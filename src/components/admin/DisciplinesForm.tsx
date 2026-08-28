"use client";

import { useState } from "react";

type Discipline = { id: string; nom: string; nbClasses: number; nbKholleurs: number };

export function DisciplinesForm({ disciplinesInitiales }: { disciplinesInitiales: Discipline[] }) {
  const [disciplines, setDisciplines] = useState(disciplinesInitiales);
  const [nom, setNom] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [erreurEdition, setErreurEdition] = useState<string | null>(null);

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
      setDisciplines((prev) => [...prev, { ...data, nbClasses: 0, nbKholleurs: 0 }]);
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

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Classes</th>
            <th>Kholleurs</th>
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
                <td>{d.nbClasses}</td>
                <td>{d.nbKholleurs}</td>
                <td>
                  <button className="discret" onClick={() => setEnEdition(d.id)}>
                    Modifier
                  </button>
                </td>
              </tr>
            )
          )}
          {disciplines.length === 0 && (
            <tr>
              <td colSpan={4}>Aucune discipline pour le moment.</td>
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
      <td>{discipline.nbClasses}</td>
      <td>{discipline.nbKholleurs}</td>
      <td style={{ display: "flex", gap: 6 }}>
        <button onClick={() => onSauvegarder(nom)}>OK</button>
        <button className="discret" onClick={onAnnuler}>
          Annuler
        </button>
      </td>
    </tr>
  );
}
