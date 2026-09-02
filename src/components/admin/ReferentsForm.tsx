"use client";

import { useState } from "react";

type Referent = {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  classeId: string;
  classe: string;
  disciplineId: string;
  discipline: string;
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
  referentsInitiaux: Referent[];
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

  const referentsAffiches = referents
    .filter((r) => !classeFiltre || r.classeId === classeFiltre)
    .filter((r) => !disciplineFiltre || r.disciplineId === disciplineFiltre)
    .sort(
      (a, b) =>
        a.classe.localeCompare(b.classe) || a.discipline.localeCompare(b.discipline) || a.nom.localeCompare(b.nom)
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
      const lignes = data as { id: string; utilisateur: CompteExistant; classeId: string }[];
      const nouveauxReferents = lignes.map((r) => ({
        id: r.id,
        nom: r.utilisateur.nom,
        prenom: r.utilisateur.prenom,
        email: r.utilisateur.email,
        classeId: r.classeId,
        classe: classes.find((c) => c.id === r.classeId)?.nom ?? "",
        disciplineId,
        discipline: disciplines.find((d) => d.id === disciplineId)?.nom ?? "",
      }));
      setReferents((prev) => [...prev, ...nouveauxReferents]);
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

  async function supprimer(referentId: string) {
    if (!confirm("Retirer cette assignation de référent ?")) return;
    const res = await fetch(`/api/admin/referents/${referentId}`, { method: "DELETE" });
    if (!res.ok) return;
    setReferents((prev) => prev.filter((r) => r.id !== referentId));
  }

  async function sauvegarderEdition(
    referentId: string,
    patch: {
      nom: string;
      prenom: string;
      email: string;
      password?: string;
      classeId: string;
      disciplineId: string;
    }
  ) {
    setErreurEdition(null);
    const res = await fetch(`/api/admin/referents/${referentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) {
      setErreurEdition(data.error ?? "Erreur lors de la modification");
      return;
    }
    setReferents((prev) =>
      prev.map((r) =>
        r.id === referentId
          ? {
              ...r,
              nom: patch.nom,
              prenom: patch.prenom,
              email: patch.email,
              classeId: patch.classeId,
              classe: classes.find((c) => c.id === patch.classeId)?.nom ?? "",
              disciplineId: patch.disciplineId,
              discipline: disciplines.find((d) => d.id === patch.disciplineId)?.nom ?? "",
            }
          : r
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
            enEdition === r.id ? (
              <LigneEdition
                key={r.id}
                referent={r}
                classes={classes}
                disciplines={disciplines}
                onAnnuler={() => setEnEdition(null)}
                onSauvegarder={(patch) => sauvegarderEdition(r.id, patch)}
              />
            ) : (
              <tr key={r.id}>
                <td>{r.classe}</td>
                <td>{r.discipline}</td>
                <td>{r.nom}</td>
                <td>{r.prenom}</td>
                <td style={{ display: "flex", gap: 8 }}>
                  <button className="discret" onClick={() => setEnEdition(r.id)}>
                    Modifier
                  </button>
                  <button className="discret" onClick={() => supprimer(r.id)}>
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

        <p>Classe(s) concernée(s) :</p>
        {classesEligibles.map((c) => (
          <label key={c.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={classeIds.includes(c.id)} onChange={() => toggleClasse(c.id)} />
            {c.nom}
          </label>
        ))}
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
  classes,
  disciplines,
  onAnnuler,
  onSauvegarder,
}: {
  referent: Referent;
  classes: Classe[];
  disciplines: Discipline[];
  onAnnuler: () => void;
  onSauvegarder: (patch: {
    nom: string;
    prenom: string;
    email: string;
    password?: string;
    classeId: string;
    disciplineId: string;
  }) => void;
}) {
  const [nom, setNom] = useState(referent.nom);
  const [prenom, setPrenom] = useState(referent.prenom);
  const [email, setEmail] = useState(referent.email);
  const [password, setPassword] = useState("");
  const [classeId, setClasseId] = useState(referent.classeId);
  const [disciplineId, setDisciplineId] = useState(referent.disciplineId);

  const classeChoisie = classes.find((c) => c.id === classeId);
  const disciplinesDisponibles = classeChoisie?.disciplines ?? [];

  return (
    <tr>
      <td colSpan={5}>
        <div className="carte" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select
              value={classeId}
              onChange={(e) => {
                setClasseId(e.target.value);
                setDisciplineId("");
              }}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
            <select value={disciplineId} onChange={(e) => setDisciplineId(e.target.value)}>
              <option value="" disabled>
                Choisir…
              </option>
              {disciplinesDisponibles.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nom}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() =>
                onSauvegarder({ nom, prenom, email, password: password || undefined, classeId, disciplineId })
              }
              disabled={!disciplineId}
            >
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
