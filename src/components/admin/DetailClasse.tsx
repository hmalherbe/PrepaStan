"use client";

import { useState } from "react";

type Eleve = { id: string; nom: string; prenom: string; aUnCompte: boolean; email: string | null };
type Discipline = { id: string; nom: string };

export function DetailClasse({
  classeId,
  elevesInitiaux,
  disciplinesAssigneesInitiales,
  toutesDisciplines,
}: {
  classeId: string;
  elevesInitiaux: Eleve[];
  disciplinesAssigneesInitiales: Discipline[];
  toutesDisciplines: Discipline[];
}) {
  const [eleves, setEleves] = useState(elevesInitiaux);
  const [disciplinesAssignees, setDisciplinesAssignees] = useState(disciplinesAssigneesInitiales);
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [erreurEdition, setErreurEdition] = useState<string | null>(null);

  async function ajouterEleve(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const res = await fetch(`/api/admin/classes/${classeId}/eleves`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, prenom, email: email || undefined, password: password || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur lors de l'ajout");
        return;
      }
      setEleves((prev) => [...prev, { id: data.id, nom, prenom, aUnCompte: Boolean(email), email: email || null }]);
      setNom("");
      setPrenom("");
      setEmail("");
      setPassword("");
    } finally {
      setEnCours(false);
    }
  }

  async function supprimerEleve(eleveId: string) {
    if (!confirm("Retirer cet élève de la classe ?")) return;
    const res = await fetch(`/api/admin/classes/${classeId}/eleves/${eleveId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Erreur lors de la suppression");
      return;
    }
    setEleves((prev) => prev.filter((e) => e.id !== eleveId));
  }

  async function sauvegarderEdition(
    eleveId: string,
    patch: { nom: string; prenom: string; email?: string; password?: string }
  ) {
    setErreurEdition(null);
    const res = await fetch(`/api/admin/classes/${classeId}/eleves/${eleveId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) {
      setErreurEdition(data.error ?? "Erreur lors de la modification");
      return;
    }
    setEleves((prev) =>
      prev.map((e) =>
        e.id === eleveId
          ? {
              ...e,
              nom: patch.nom,
              prenom: patch.prenom,
              email: patch.email ?? e.email,
              aUnCompte: e.aUnCompte || Boolean(patch.email),
            }
          : e
      )
    );
    setEnEdition(null);
  }

  async function toggleDiscipline(discipline: Discipline, assignee: boolean) {
    // Mise à jour optimiste : une case à cocher contrôlée qui n'affiche son
    // nouvel état qu'après la réponse réseau donne l'impression de ne pas
    // réagir au clic. On revient en arrière si l'appel échoue.
    setDisciplinesAssignees((prev) =>
      assignee ? prev.filter((d) => d.id !== discipline.id) : [...prev, discipline]
    );
    const methode = assignee ? "DELETE" : "POST";
    const res = await fetch(`/api/admin/classes/${classeId}/disciplines/${discipline.id}`, { method: methode });
    if (!res.ok) {
      setDisciplinesAssignees((prev) =>
        assignee ? [...prev, discipline] : prev.filter((d) => d.id !== discipline.id)
      );
    }
  }

  return (
    <div>
      <h2>Disciplines de la classe</h2>
      <div className="carte">
        {toutesDisciplines.map((d) => {
          const assignee = disciplinesAssignees.some((da) => da.id === d.id);
          return (
            <label key={d.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={assignee} onChange={() => toggleDiscipline(d, assignee)} />
              {d.nom}
            </label>
          );
        })}
        {toutesDisciplines.length === 0 && <p>Aucune discipline créée pour le moment.</p>}
      </div>

      <h2>Élèves</h2>
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Prénom</th>
            <th>Compte</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {eleves.map((e) =>
            enEdition === e.id ? (
              <LigneEdition
                key={e.id}
                eleve={e}
                onAnnuler={() => setEnEdition(null)}
                onSauvegarder={(patch) => sauvegarderEdition(e.id, patch)}
              />
            ) : (
              <tr key={e.id}>
                <td>{e.nom}</td>
                <td>{e.prenom}</td>
                <td>{e.aUnCompte ? "Oui" : "Non"}</td>
                <td style={{ display: "flex", gap: 8 }}>
                  <button className="discret" onClick={() => setEnEdition(e.id)}>
                    Modifier
                  </button>
                  <button className="discret" onClick={() => supprimerEleve(e.id)}>
                    Retirer
                  </button>
                </td>
              </tr>
            )
          )}
          {eleves.length === 0 && (
            <tr>
              <td colSpan={4}>Aucun élève pour le moment.</td>
            </tr>
          )}
        </tbody>
      </table>
      {erreurEdition && <p className="champ-erreur">{erreurEdition}</p>}

      <h3>Ajouter un élève</h3>
      <form onSubmit={ajouterEleve} className="carte">
        <label>
          Nom
          <input value={nom} onChange={(e) => setNom(e.target.value)} required />
        </label>
        <label>
          Prénom
          <input value={prenom} onChange={(e) => setPrenom(e.target.value)} required />
        </label>
        <label>
          Email (optionnel, crée un compte de connexion)
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {email && (
          <label>
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={Boolean(email)}
            />
          </label>
        )}
        {erreur && <p className="champ-erreur">{erreur}</p>}
        <button type="submit" disabled={enCours}>
          {enCours ? "Ajout…" : "Ajouter l'élève"}
        </button>
      </form>
    </div>
  );
}

function LigneEdition({
  eleve,
  onAnnuler,
  onSauvegarder,
}: {
  eleve: Eleve;
  onAnnuler: () => void;
  onSauvegarder: (patch: { nom: string; prenom: string; email?: string; password?: string }) => void;
}) {
  const [nom, setNom] = useState(eleve.nom);
  const [prenom, setPrenom] = useState(eleve.prenom);
  const [email, setEmail] = useState(eleve.email ?? "");
  const [password, setPassword] = useState("");

  return (
    <tr>
      <td colSpan={4}>
        <div className="carte" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom" style={{ flex: 1 }} />
            <input
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              placeholder="Prénom"
              style={{ flex: 1 }}
            />
          </div>
          <label>
            {eleve.aUnCompte ? "Email du compte" : "Email (optionnel, crée un compte de connexion)"}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {email && (
            <label>
              {eleve.aUnCompte ? "Nouveau mot de passe (optionnel)" : "Mot de passe"}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={!eleve.aUnCompte}
              />
            </label>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() =>
                onSauvegarder({ nom, prenom, email: email || undefined, password: password || undefined })
              }
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
