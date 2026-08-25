"use client";

import { useState } from "react";

type Discipline = { id: string; nom: string; nbClasses: number; nbKholleurs: number };

export function DisciplinesForm({ disciplinesInitiales }: { disciplinesInitiales: Discipline[] }) {
  const [disciplines, setDisciplines] = useState(disciplinesInitiales);
  const [nom, setNom] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

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

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Classes</th>
            <th>Kholleurs</th>
          </tr>
        </thead>
        <tbody>
          {disciplines.map((d) => (
            <tr key={d.id}>
              <td>{d.nom}</td>
              <td>{d.nbClasses}</td>
              <td>{d.nbKholleurs}</td>
            </tr>
          ))}
          {disciplines.length === 0 && (
            <tr>
              <td colSpan={3}>Aucune discipline pour le moment.</td>
            </tr>
          )}
        </tbody>
      </table>

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
