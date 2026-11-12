"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ReferentGroupe = {
  disciplineId: string;
  discipline: string;
  classes: { id: string; classeId: string; nom: string }[];
};
type Personne = {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  estKholleur: boolean;
  estReferent: boolean;
  disciplineIdsKholleur: string[];
  disciplinesKholleur: string[];
  referentGroupes: ReferentGroupe[];
  nbDisponibilites: number;
};
type Discipline = { id: string; nom: string };
type Classe = { id: string; nom: string; disciplines: Discipline[] };

// Mot de passe de remplissage utilisé uniquement pour satisfaire le schéma de
// validation de POST /api/admin/kholleurs lorsqu'on ajoute le rôle khôlleur à
// un compte référent déjà existant : ce chemin de l'API retrouve le compte
// par email et fusionne simplement le rôle, sans jamais lire ni écrire ce
// mot de passe (voir src/app/api/admin/kholleurs/route.ts).
const MOT_DE_PASSE_IGNORE_SI_FUSION = "cumul-role";

export function PersonnesForm({
  personnesInitiales,
  classes,
  disciplines,
}: {
  personnesInitiales: Personne[];
  classes: Classe[];
  disciplines: Discipline[];
}) {
  const router = useRouter();
  const [personnes, setPersonnes] = useState(personnesInitiales);
  const [classeFiltre, setClasseFiltre] = useState("");
  const [disciplineFiltre, setDisciplineFiltre] = useState("");

  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [estKholleur, setEstKholleur] = useState(false);
  const [disciplineIdsKholleur, setDisciplineIdsKholleur] = useState<string[]>([]);
  const [estReferent, setEstReferent] = useState(false);
  const [referentDisciplineId, setReferentDisciplineId] = useState("");
  const [referentClasseIds, setReferentClasseIds] = useState<string[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [erreurEdition, setErreurEdition] = useState<string | null>(null);

  useEffect(() => {
    setPersonnes(personnesInitiales);
  }, [personnesInitiales]);

  const personnesAffichees = personnes
    .filter((p) => !disciplineFiltre || p.disciplineIdsKholleur.includes(disciplineFiltre) || p.referentGroupes.some((g) => g.disciplineId === disciplineFiltre))
    .filter((p) => !classeFiltre || p.referentGroupes.some((g) => g.classes.some((c) => c.classeId === classeFiltre)))
    .sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom));

  const classesEligibles = classes.filter((c) => c.disciplines.some((d) => d.id === referentDisciplineId));

  function toggleDisciplineKholleur(id: string) {
    setDisciplineIdsKholleur((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  }
  function toggleReferentClasse(id: string) {
    setReferentClasseIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      let utilisateurId: string | null = null;

      if (estKholleur) {
        const res = await fetch("/api/admin/kholleurs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nom, prenom, email, password, disciplineIds: disciplineIdsKholleur }),
        });
        const data = await res.json();
        if (!res.ok) {
          setErreur(data.error ?? "Erreur lors de la création");
          return;
        }
        utilisateurId = data.id;
      }

      if (estReferent) {
        const res = await fetch("/api/admin/referents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            utilisateurId
              ? { utilisateurId, disciplineId: referentDisciplineId, classeIds: referentClasseIds }
              : { nom, prenom, email, password, disciplineId: referentDisciplineId, classeIds: referentClasseIds }
          ),
        });
        const data = await res.json();
        if (!res.ok) {
          setErreur(
            utilisateurId
              ? `Compte khôlleur créé, mais ${data.error ?? "erreur lors de l'ajout du rôle référent"}`
              : (data.error ?? "Erreur lors de la création")
          );
          return;
        }
      }

      setNom("");
      setPrenom("");
      setEmail("");
      setPassword("");
      setEstKholleur(false);
      setDisciplineIdsKholleur([]);
      setEstReferent(false);
      setReferentDisciplineId("");
      setReferentClasseIds([]);
      router.refresh();
    } finally {
      setEnCours(false);
    }
  }

  async function retirerKholleur(p: Personne) {
    const message = p.estReferent
      ? `Retirer le rôle khôlleur de ${p.prenom} ${p.nom} ?`
      : `Supprimer ${p.prenom} ${p.nom} ?`;
    if (!confirm(message)) return;
    const res = await fetch(`/api/admin/kholleurs/${p.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Erreur lors de la suppression");
      return;
    }
    router.refresh();
  }

  async function retirerReferent(p: Personne) {
    const message = p.estKholleur
      ? `Retirer le rôle référent de ${p.prenom} ${p.nom} ?`
      : `Supprimer ${p.prenom} ${p.nom} ?`;
    if (!confirm(message)) return;
    const res = await fetch(`/api/admin/referents/personne/${p.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Erreur lors de la suppression");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <label style={{ maxWidth: 220 }}>
          Filtrer par classe (référent)
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
            <th>Nom</th>
            <th>Prénom</th>
            <th>Email</th>
            <th>Khôlleur</th>
            <th>Référent</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {personnesAffichees.map((p) =>
            enEdition === p.id ? (
              <LigneEditionPersonne
                key={p.id}
                personne={p}
                classes={classes}
                disciplines={disciplines}
                erreur={erreurEdition}
                setErreur={setErreurEdition}
                onAnnuler={() => {
                  setEnEdition(null);
                  setErreurEdition(null);
                }}
                onRafraichir={() => router.refresh()}
              />
            ) : (
              <tr key={p.id}>
                <td>{p.nom}</td>
                <td>{p.prenom}</td>
                <td>{p.email}</td>
                <td>
                  {p.estKholleur ? (
                    <>
                      {p.disciplinesKholleur.join(", ")} —{" "}
                      <Link href={`/admin/kholleurs/${p.id}`}>{p.nbDisponibilites} dispo.</Link>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {p.estReferent ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {p.referentGroupes.map((g) => (
                        <div key={g.disciplineId}>
                          <strong>{g.discipline}</strong> : {g.classes.map((c) => c.nom).join(", ")}
                        </div>
                      ))}
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="discret" onClick={() => setEnEdition(p.id)}>
                    Modifier
                  </button>
                  {p.estKholleur && (
                    <button className="discret" onClick={() => retirerKholleur(p)}>
                      {p.estReferent ? "Retirer rôle khôlleur" : "Supprimer"}
                    </button>
                  )}
                  {p.estReferent && (
                    <button className="discret" onClick={() => retirerReferent(p)}>
                      {p.estKholleur ? "Retirer rôle référent" : "Supprimer"}
                    </button>
                  )}
                </td>
              </tr>
            )
          )}
          {personnesAffichees.length === 0 && (
            <tr>
              <td colSpan={6}>
                {personnes.length === 0 ? "Aucune personne pour le moment." : "Aucune personne pour ce filtre."}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Ajouter une personne</h2>
      <form onSubmit={ajouter} className="carte">
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

        <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={estKholleur} onChange={() => setEstKholleur((v) => !v)} />
            Khôlleur
          </label>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={estReferent} onChange={() => setEstReferent((v) => !v)} />
            Professeur référent
          </label>
        </div>

        {estKholleur && (
          <>
            <p>Disciplines qu&apos;elle/il peut kholler :</p>
            {disciplines.map((d) => (
              <label key={d.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={disciplineIdsKholleur.includes(d.id)}
                  onChange={() => toggleDisciplineKholleur(d.id)}
                />
                {d.nom}
              </label>
            ))}
          </>
        )}

        {estReferent && (
          <>
            <label>
              Discipline (référent)
              <select
                value={referentDisciplineId}
                onChange={(e) => {
                  setReferentDisciplineId(e.target.value);
                  setReferentClasseIds([]);
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
            <p>Classes (pour cette discipline) :</p>
            {classesEligibles.map((c) => (
              <label key={c.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={referentClasseIds.includes(c.id)}
                  onChange={() => toggleReferentClasse(c.id)}
                />
                {c.nom}
              </label>
            ))}
            {referentDisciplineId && classesEligibles.length === 0 && (
              <p style={{ color: "#777", fontSize: "0.9rem" }}>
                Aucune classe n&apos;a encore cette discipline assignée.
              </p>
            )}
          </>
        )}

        {erreur && <p className="champ-erreur">{erreur}</p>}
        <button
          type="submit"
          disabled={
            enCours ||
            (!estKholleur && !estReferent) ||
            (estKholleur && disciplineIdsKholleur.length === 0) ||
            (estReferent && (!referentDisciplineId || referentClasseIds.length === 0))
          }
          style={{ marginTop: 12 }}
        >
          {enCours ? "Création…" : "Ajouter"}
        </button>
      </form>
    </div>
  );
}

function LigneEditionPersonne({
  personne,
  classes,
  disciplines,
  erreur,
  setErreur,
  onAnnuler,
  onRafraichir,
}: {
  personne: Personne;
  classes: Classe[];
  disciplines: Discipline[];
  erreur: string | null;
  setErreur: (e: string | null) => void;
  onAnnuler: () => void;
  onRafraichir: () => void;
}) {
  const [nom, setNom] = useState(personne.nom);
  const [prenom, setPrenom] = useState(personne.prenom);
  const [email, setEmail] = useState(personne.email);
  const [password, setPassword] = useState("");
  const [disciplineIdsKholleur, setDisciplineIdsKholleur] = useState<string[]>(personne.disciplineIdsKholleur);
  const [enCours, setEnCours] = useState(false);

  const [ajoutKholleurOuvert, setAjoutKholleurOuvert] = useState(false);
  const [nouvellesDisciplinesKholleur, setNouvellesDisciplinesKholleur] = useState<string[]>([]);

  const [nouvelleDisciplineReferent, setNouvelleDisciplineReferent] = useState("");
  const [nouvellesClassesReferent, setNouvellesClassesReferent] = useState<string[]>([]);

  function toggleDisciplineKholleur(id: string) {
    setDisciplineIdsKholleur((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  }
  function toggleNouvelleDisciplineKholleur(id: string) {
    setNouvellesDisciplinesKholleur((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  }
  function toggleNouvelleClasseReferent(id: string) {
    setNouvellesClassesReferent((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  const classesEligiblesNouvelleDiscipline = classes.filter((c) =>
    c.disciplines.some((d) => d.id === nouvelleDisciplineReferent)
  );

  async function sauvegarderIdentite() {
    setErreur(null);
    setEnCours(true);
    try {
      if (personne.estKholleur) {
        const res = await fetch(`/api/admin/kholleurs/${personne.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nom,
            prenom,
            email,
            password: password || undefined,
            disciplineIds: disciplineIdsKholleur,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setErreur(data.error ?? "Erreur lors de la modification");
          return;
        }
      } else if (personne.estReferent) {
        const premiereLigne = personne.referentGroupes[0]?.classes[0];
        if (!premiereLigne) return;
        const res = await fetch(`/api/admin/referents/${premiereLigne.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nom,
            prenom,
            email,
            password: password || undefined,
            classeId: premiereLigne.classeId,
            disciplineId: personne.referentGroupes[0].disciplineId,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setErreur(data.error ?? "Erreur lors de la modification");
          return;
        }
      }
      onRafraichir();
      onAnnuler();
    } finally {
      setEnCours(false);
    }
  }

  async function confirmerAjoutKholleur() {
    setErreur(null);
    const res = await fetch("/api/admin/kholleurs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nom: personne.nom,
        prenom: personne.prenom,
        email: personne.email,
        password: MOT_DE_PASSE_IGNORE_SI_FUSION,
        disciplineIds: nouvellesDisciplinesKholleur,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErreur(data.error ?? "Erreur lors de l'ajout du rôle khôlleur");
      return;
    }
    onRafraichir();
  }

  async function retirerClasseReferent(id: string) {
    const res = await fetch(`/api/admin/referents/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setErreur(data.error ?? "Erreur lors du retrait");
      return;
    }
    onRafraichir();
  }

  async function ajouterGroupeReferent() {
    setErreur(null);
    const res = await fetch("/api/admin/referents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        utilisateurId: personne.id,
        disciplineId: nouvelleDisciplineReferent,
        classeIds: nouvellesClassesReferent,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErreur(data.error ?? "Erreur lors de l'ajout");
      return;
    }
    setNouvelleDisciplineReferent("");
    setNouvellesClassesReferent([]);
    onRafraichir();
  }

  return (
    <tr>
      <td colSpan={6}>
        <div className="carte" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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

          <div>
            <strong>Khôlleur</strong>
            {personne.estKholleur ? (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
                {disciplines.map((d) => (
                  <label key={d.id} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={disciplineIdsKholleur.includes(d.id)}
                      onChange={() => toggleDisciplineKholleur(d.id)}
                    />
                    {d.nom}
                  </label>
                ))}
              </div>
            ) : ajoutKholleurOuvert ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {disciplines.map((d) => (
                    <label key={d.id} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={nouvellesDisciplinesKholleur.includes(d.id)}
                        onChange={() => toggleNouvelleDisciplineKholleur(d.id)}
                      />
                      {d.nom}
                    </label>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={confirmerAjoutKholleur}
                    disabled={nouvellesDisciplinesKholleur.length === 0}
                  >
                    Confirmer
                  </button>
                  <button type="button" className="discret" onClick={() => setAjoutKholleurOuvert(false)}>
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <button type="button" className="discret" onClick={() => setAjoutKholleurOuvert(true)}>
                  + Ajouter le rôle khôlleur
                </button>
              </div>
            )}
          </div>

          <div>
            <strong>Professeur référent</strong>
            {personne.referentGroupes.map((g) => (
              <div key={g.disciplineId} style={{ marginTop: 4 }}>
                {g.discipline} :{" "}
                {g.classes.map((c) => (
                  <span
                    key={c.id}
                    className="badge"
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 4 }}
                  >
                    {c.nom}
                    <button
                      type="button"
                      className="discret"
                      style={{ padding: "0 4px", lineHeight: 1 }}
                      onClick={() => retirerClasseReferent(c.id)}
                      title={`Retirer de ${c.nom}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", marginTop: 6 }}>
              <select
                value={nouvelleDisciplineReferent}
                onChange={(e) => {
                  setNouvelleDisciplineReferent(e.target.value);
                  setNouvellesClassesReferent([]);
                }}
              >
                <option value="">+ discipline…</option>
                {disciplines
                  .filter((d) => !personne.referentGroupes.some((g) => g.disciplineId === d.id))
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nom}
                    </option>
                  ))}
              </select>
              {nouvelleDisciplineReferent && (
                <>
                  {classesEligiblesNouvelleDiscipline.map((c) => (
                    <label key={c.id} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={nouvellesClassesReferent.includes(c.id)}
                        onChange={() => toggleNouvelleClasseReferent(c.id)}
                      />
                      {c.nom}
                    </label>
                  ))}
                  <button type="button" onClick={ajouterGroupeReferent} disabled={nouvellesClassesReferent.length === 0}>
                    Ajouter
                  </button>
                </>
              )}
            </div>
          </div>

          {erreur && <p className="champ-erreur">{erreur}</p>}
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={sauvegarderIdentite} disabled={enCours}>
              OK
            </button>
            <button type="button" className="discret" onClick={onAnnuler}>
              Annuler
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}
