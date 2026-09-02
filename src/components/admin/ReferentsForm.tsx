"use client";

import { useState } from "react";

type ClasseAssignee = { id: string; classeId: string; nom: string };
type ReferentGroupe = {
  cle: string; // utilisateurId_disciplineId
  utilisateurId: string;
  nom: string;
  prenom: string;
  email: string;
  disciplineId: string;
  discipline: string;
  // Un même référent peut intervenir dans plusieurs classes pour une même
  // discipline (voir page.tsx, qui regroupe les lignes ProfesseurReferent) :
  // une entrée par classe assignée, chacune retirable individuellement.
  classes: ClasseAssignee[];
};
type Discipline = { id: string; nom: string };
type Classe = { id: string; nom: string; disciplines: Discipline[] };
type CompteExistant = { id: string; nom: string; prenom: string; email: string };

export function ReferentsForm({
  referentsInitiaux,
  classes,
  disciplines,
  comptesExistants,
}: {
  referentsInitiaux: ReferentGroupe[];
  classes: Classe[];
  disciplines: Discipline[];
  comptesExistants: CompteExistant[];
}) {
  const [referents, setReferents] = useState(referentsInitiaux);
  const [comptes, setComptes] = useState(comptesExistants);
  const [modeCompte, setModeCompte] = useState<"nouveau" | "existant">(
    comptesExistants.length > 0 ? "existant" : "nouveau"
  );
  const [utilisateurId, setUtilisateurId] = useState(comptesExistants[0]?.id ?? "");
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [disciplineId, setDisciplineId] = useState("");
  const [classeIds, setClasseIds] = useState<string[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [erreurEdition, setErreurEdition] = useState<string | null>(null);
  const [classeFiltre, setClasseFiltre] = useState("");
  const [disciplineFiltre, setDisciplineFiltre] = useState("");

  // Une classe n'est proposable que si la discipline choisie lui est déjà
  // assignée (table ClasseDiscipline) — voir écran Classes ou Disciplines.
  const classesEligibles = classes.filter((c) => c.disciplines.some((d) => d.id === disciplineId));

  // Si le compte existant sélectionné est déjà référent de cette discipline
  // dans certaines classes, on le signale plutôt que de laisser resélectionner
  // une classe déjà assignée (l'API l'ignorerait silencieusement).
  const groupeExistant =
    modeCompte === "existant"
      ? referents.find((r) => r.utilisateurId === utilisateurId && r.disciplineId === disciplineId)
      : undefined;
  const classeIdsDejaAssignees = new Set(groupeExistant?.classes.map((c) => c.classeId) ?? []);

  const referentsAffiches = referents
    .map((r) => ({ ...r, classes: [...r.classes].sort((a, b) => a.nom.localeCompare(b.nom)) }))
    .filter((r) => !classeFiltre || r.classes.some((c) => c.classeId === classeFiltre))
    .filter((r) => !disciplineFiltre || r.disciplineId === disciplineFiltre)
    .sort(
      (a, b) =>
        (a.classes[0]?.nom ?? "").localeCompare(b.classes[0]?.nom ?? "") ||
        a.discipline.localeCompare(b.discipline) ||
        a.nom.localeCompare(b.nom)
    );

  function toggleClasse(id: string) {
    setClasseIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const res = await fetch("/api/admin/referents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          modeCompte === "existant"
            ? { utilisateurId, disciplineId, classeIds }
            : { nom, prenom, email, password, disciplineId, classeIds }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur lors de la création");
        return;
      }
      const lignes = data as { id: string; utilisateurId: string; classeId: string; utilisateur: CompteExistant }[];
      if (lignes.length === 0) {
        setNom("");
        setPrenom("");
        setEmail("");
        setPassword("");
        setClasseIds([]);
        return;
      }
      setReferents((prev) => {
        // Purement immutable : le Mode Strict de React invoque une fonction
        // passée à setState deux fois en développement pour détecter les
        // effets de bord — muter groupe.classes en place ferait fuiter le
        // premier appel (normalement jeté) dans le second, doublant les
        // classes ajoutées.
        let suivant = prev;
        for (const l of lignes) {
          const cle = `${l.utilisateurId}_${disciplineId}`;
          const classeAssignee = { id: l.id, classeId: l.classeId, nom: classes.find((c) => c.id === l.classeId)?.nom ?? "" };
          suivant = suivant.some((r) => r.cle === cle)
            ? suivant.map((r) => (r.cle === cle ? { ...r, classes: [...r.classes, classeAssignee] } : r))
            : [
                ...suivant,
                {
                  cle,
                  utilisateurId: l.utilisateurId,
                  nom: l.utilisateur.nom,
                  prenom: l.utilisateur.prenom,
                  email: l.utilisateur.email,
                  disciplineId,
                  discipline: disciplines.find((d) => d.id === disciplineId)?.nom ?? "",
                  classes: [classeAssignee],
                },
              ];
        }
        return suivant;
      });
      if (modeCompte === "nouveau" && lignes[0]) {
        setComptes((prev) => [...prev, lignes[0].utilisateur]);
      }
      setNom("");
      setPrenom("");
      setEmail("");
      setPassword("");
      setClasseIds([]);
    } finally {
      setEnCours(false);
    }
  }

  // Retire une seule classe (une ligne ProfesseurReferent) d'un groupe.
  async function retirerClasse(groupeCle: string, classeAssigneeId: string) {
    const res = await fetch(`/api/admin/referents/${classeAssigneeId}`, { method: "DELETE" });
    if (!res.ok) return;
    setReferents((prev) =>
      prev
        .map((r) => (r.cle === groupeCle ? { ...r, classes: r.classes.filter((c) => c.id !== classeAssigneeId) } : r))
        .filter((r) => r.classes.length > 0)
    );
  }

  // Retire le référent de toutes les classes affichées dans le groupe (pour
  // cette discipline).
  async function retirerGroupe(groupe: ReferentGroupe) {
    if (!confirm(`Retirer ${groupe.prenom} ${groupe.nom} de toutes les classes listées pour ${groupe.discipline} ?`)) {
      return;
    }
    await Promise.all(groupe.classes.map((c) => fetch(`/api/admin/referents/${c.id}`, { method: "DELETE" })));
    setReferents((prev) => prev.filter((r) => r.cle !== groupe.cle));
  }

  async function sauvegarderEdition(
    groupe: ReferentGroupe,
    patch: { nom: string; prenom: string; email: string; password?: string }
  ) {
    setErreurEdition(null);
    // L'API met à jour le compte utilisateur (partagé par toutes les classes
    // du groupe) via n'importe laquelle de ses lignes ProfesseurReferent ;
    // classe/discipline de cette ligne sont renvoyées inchangées, seules
    // les infos personnelles sont éditées ici (voir retirer/ajouter pour
    // gérer les classes).
    const premiereLigne = groupe.classes[0];
    const res = await fetch(`/api/admin/referents/${premiereLigne.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...patch, classeId: premiereLigne.classeId, disciplineId: groupe.disciplineId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErreurEdition(data.error ?? "Erreur lors de la modification");
      return;
    }
    setReferents((prev) =>
      prev.map((r) =>
        r.cle === groupe.cle ? { ...r, nom: patch.nom, prenom: patch.prenom, email: patch.email } : r
      )
    );
    setEnEdition(null);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <label style={{ maxWidth: 220 }}>
          Filtrer par classe
          <select value={classeFiltre} onChange={(e) => setClasseFiltre(e.target.value)}>
            <option value="">Toutes les classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </label>
        <label style={{ maxWidth: 220 }}>
          Filtrer par discipline
          <select value={disciplineFiltre} onChange={(e) => setDisciplineFiltre(e.target.value)}>
            <option value="">Toutes les disciplines</option>
            {disciplines.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nom}
              </option>
            ))}
          </select>
        </label>
      </div>

      <table>
        <thead>
          <tr>
            <th>Classe</th>
            <th>Discipline</th>
            <th>Nom</th>
            <th>Prénom</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {referentsAffiches.map((r) =>
            enEdition === r.cle ? (
              <LigneEdition
                key={r.cle}
                referent={r}
                onAnnuler={() => setEnEdition(null)}
                onSauvegarder={(patch) => sauvegarderEdition(r, patch)}
              />
            ) : (
              <tr key={r.cle}>
                <td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {r.classes.map((c) => (
                      <span
                        key={c.id}
                        className="badge"
                        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        {c.nom}
                        <button
                          type="button"
                          className="discret"
                          style={{ padding: "0 4px", lineHeight: 1 }}
                          onClick={() => retirerClasse(r.cle, c.id)}
                          title={`Retirer de ${c.nom}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </td>
                <td>{r.discipline}</td>
                <td>{r.nom}</td>
                <td>{r.prenom}</td>
                <td style={{ display: "flex", gap: 8 }}>
                  <button className="discret" onClick={() => setEnEdition(r.cle)}>
                    Modifier
                  </button>
                  <button className="discret" onClick={() => retirerGroupe(r)}>
                    Retirer
                  </button>
                </td>
              </tr>
            )
          )}
          {referentsAffiches.length === 0 && (
            <tr>
              <td colSpan={5}>
                {referents.length === 0 ? "Aucun référent pour le moment." : "Aucun référent pour ce filtre."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {erreurEdition && <p className="champ-erreur">{erreurEdition}</p>}

      <h2>Ajouter un référent</h2>
      <form onSubmit={ajouter} className="carte">
        <div style={{ display: "flex", gap: 16 }}>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <input
              type="radio"
              checked={modeCompte === "existant"}
              onChange={() => setModeCompte("existant")}
              disabled={comptes.length === 0}
            />
            Compte existant
          </label>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <input type="radio" checked={modeCompte === "nouveau"} onChange={() => setModeCompte("nouveau")} />
            Nouveau compte
          </label>
        </div>

        {modeCompte === "existant" ? (
          <label>
            Référent
            <select value={utilisateurId} onChange={(e) => setUtilisateurId(e.target.value)} required>
              <option value="" disabled>
                Choisir…
              </option>
              {comptes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.prenom} {c.nom} ({c.email})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>
              Nom
              <input value={nom} onChange={(e) => setNom(e.target.value)} required />
            </label>
            <label>
              Prénom
              <input value={prenom} onChange={(e) => setPrenom(e.target.value)} required />
            </label>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Mot de passe
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
          </>
        )}

        <label>
          Discipline
          <select
            value={disciplineId}
            onChange={(e) => {
              setDisciplineId(e.target.value);
              setClasseIds([]);
            }}
            required
          >
            <option value="" disabled>
              Choisir…
            </option>
            {disciplines.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nom}
              </option>
            ))}
          </select>
        </label>

        {/* Un même référent peut intervenir dans plusieurs classes : les
            cocher toutes ici plutôt que de répéter l'ajout classe par classe. */}
        <p>Classe(s) concernée(s) :</p>
        {classesEligibles.map((c) => {
          const dejaAssignee = classeIdsDejaAssignees.has(c.id);
          return (
            <label
              key={c.id}
              style={{ flexDirection: "row", alignItems: "center", gap: 8, opacity: dejaAssignee ? 0.5 : 1 }}
            >
              <input
                type="checkbox"
                checked={classeIds.includes(c.id)}
                onChange={() => toggleClasse(c.id)}
                disabled={dejaAssignee}
              />
              {c.nom}
              {dejaAssignee && " (déjà assigné)"}
            </label>
          );
        })}
        {disciplineId && classesEligibles.length === 0 && (
          <span style={{ color: "#777", fontSize: "0.85rem" }}>
            Aucune classe n&apos;a cette discipline assignée (voir l&apos;écran Classes ou Disciplines).
          </span>
        )}

        {erreur && <p className="champ-erreur">{erreur}</p>}
        <button
          type="submit"
          disabled={enCours || classeIds.length === 0 || (modeCompte === "existant" && !utilisateurId)}
          style={{ marginTop: 12 }}
        >
          {enCours ? "Création…" : "Ajouter"}
        </button>
      </form>
    </div>
  );
}

function LigneEdition({
  referent,
  onAnnuler,
  onSauvegarder,
}: {
  referent: ReferentGroupe;
  onAnnuler: () => void;
  onSauvegarder: (patch: { nom: string; prenom: string; email: string; password?: string }) => void;
}) {
  const [nom, setNom] = useState(referent.nom);
  const [prenom, setPrenom] = useState(referent.prenom);
  const [email, setEmail] = useState(referent.email);
  const [password, setPassword] = useState("");

  return (
    <tr>
      <td colSpan={5}>
        <div className="carte" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#777" }}>
            {referent.discipline} — {referent.classes.map((c) => c.nom).join(", ")} (pour changer les classes,
            utilisez les × et le formulaire d&apos;ajout ci-dessous)
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom" style={{ flex: 1 }} />
            <input
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              placeholder="Prénom"
              style={{ flex: 1 }}
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              style={{ flex: 1 }}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nouveau mot de passe (optionnel)"
              style={{ flex: 1 }}
            />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => onSauvegarder({ nom, prenom, email, password: password || undefined })}>
              OK
            </button>
            <button className="discret" onClick={onAnnuler}>
              Annuler
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}
