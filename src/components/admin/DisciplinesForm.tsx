"use client";

import { useState } from "react";

type Discipline = { id: string; nom: string; classeIds: string[] };
type Classe = { id: string; nom: string };

export function DisciplinesForm({
  disciplinesInitiales,
  classes,
}: {
  disciplinesInitiales: Discipline[];
  classes: Classe[];
}) {
  const [disciplines, setDisciplines] = useState(disciplinesInitiales);
  const [nom, setNom] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [erreurEdition, setErreurEdition] = useState<string | null>(null);
  const [classesOuvertes, setClassesOuvertes] = useState<string | null>(null);

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const res = await fetch("/api/admin/disciplines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur lors de la création");
        return;
      }
      setDisciplines((prev) => [...prev, { ...data, classeIds: [] }]);
      setNom("");
    } finally {
      setEnCours(false);
    }
  }

  async function sauvegarderEdition(disciplineId: string, nouveauNom: string) {
    setErreurEdition(null);
    const res = await fetch(`/api/admin/disciplines/${disciplineId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nom: nouveauNom }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErreurEdition(data.error ?? "Erreur lors de la modification");
      return;
    }
    setDisciplines((prev) => prev.map((d) => (d.id === disciplineId ? { ...d, nom: data.nom } : d)));
    setEnEdition(null);
  }

  async function supprimer(disciplineId: string) {
    if (!confirm("Supprimer cette discipline ?")) return;
    const res = await fetch(`/api/admin/disciplines/${disciplineId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Erreur lors de la suppression");
      return;
    }
    setDisciplines((prev) => prev.filter((d) => d.id !== disciplineId));
  }

  async function toggleClasse(disciplineId: string, classeId: string, assignee: boolean) {
    // Mise à jour optimiste, comme pour les cases à cocher de disciplines
    // côté écran Classes.
    setDisciplines((prev) =>
      prev.map((d) =>
        d.id === disciplineId
          ? { ...d, classeIds: assignee ? d.classeIds.filter((id) => id !== classeId) : [...d.classeIds, classeId] }
          : d
      )
    );
    const methode = assignee ? "DELETE" : "POST";
    const res = await fetch(`/api/admin/classes/${classeId}/disciplines/${disciplineId}`, { method: methode });
    if (!res.ok) {
      setDisciplines((prev) =>
        prev.map((d) =>
          d.id === disciplineId
            ? {
                ...d,
                classeIds: assignee ? [...d.classeIds, classeId] : d.classeIds.filter((id) => id !== classeId),
              }
            : d
        )
      );
    }
  }

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Classes</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {disciplines.map((d) =>
            enEdition === d.id ? (
              <LigneEdition
                key={d.id}
                discipline={d}
                onAnnuler={() => setEnEdition(null)}
                onSauvegarder={(nouveauNom) => sauvegarderEdition(d.id, nouveauNom)}
              />
            ) : (
              <tr key={d.id}>
                <td>{d.nom}</td>
                <td>
                  {classesOuvertes === d.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {classes.map((c) => (
                        <label key={c.id} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <input
                            type="checkbox"
                            checked={d.classeIds.includes(c.id)}
                            onChange={() => toggleClasse(d.id, c.id, d.classeIds.includes(c.id))}
                          />
                          {c.nom}
                        </label>
                      ))}
                      {classes.length === 0 && (
                        <span style={{ color: "#777", fontSize: "0.85rem" }}>Aucune classe créée.</span>
                      )}
                      <button className="discret" onClick={() => setClassesOuvertes(null)}>
                        Fermer
                      </button>
                    </div>
                  ) : (
                    <button className="discret" onClick={() => setClassesOuvertes(d.id)}>
                      {d.classeIds.length} classe{d.classeIds.length !== 1 ? "s" : ""} — gérer
                    </button>
                  )}
                </td>
                <td style={{ display: "flex", gap: 8 }}>
                  <button className="discret" onClick={() => setEnEdition(d.id)}>
                    Modifier
                  </button>
                  <button className="discret" onClick={() => supprimer(d.id)}>
                    Supprimer
                  </button>
                </td>
              </tr>
            )
          )}
          {disciplines.length === 0 && (
            <tr>
              <td colSpan={3}>Aucune discipline pour le moment.</td>
            </tr>
          )}
        </tbody>
      </table>
      {erreurEdition && <p className="champ-erreur">{erreurEdition}</p>}

      <h2>Ajouter une discipline</h2>
      <form onSubmit={ajouter} className="carte">
        <label>
          Nom
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Mathématiques" required />
        </label>
        {erreur && <p className="champ-erreur">{erreur}</p>}
        <button type="submit" disabled={enCours}>
          {enCours ? "Création…" : "Ajouter"}
        </button>
      </form>
    </div>
  );
}

function LigneEdition({
  discipline,
  onAnnuler,
  onSauvegarder,
}: {
  discipline: Discipline;
  onAnnuler: () => void;
  onSauvegarder: (nom: string) => void;
}) {
  const [nom, setNom] = useState(discipline.nom);

  return (
    <tr>
      <td>
        <input value={nom} onChange={(e) => setNom(e.target.value)} />
      </td>
      <td>{discipline.classeIds.length}</td>
      <td style={{ display: "flex", gap: 6 }}>
        <button onClick={() => onSauvegarder(nom)}>OK</button>
        <button className="discret" onClick={onAnnuler}>
          Annuler
        </button>
      </td>
    </tr>
  );
}
