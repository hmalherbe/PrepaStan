"use client";

import Link from "next/link";
import { useState } from "react";

type Classe = { id: string; nom: string; anneeScolaire: string; nbEleves: number; nbDisciplines: number };

export function ClassesForm({ classesInitiales }: { classesInitiales: Classe[] }) {
  const [classes, setClasses] = useState(classesInitiales);
  const [nom, setNom] = useState("");
  const [anneeScolaire, setAnneeScolaire] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const res = await fetch("/api/admin/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, anneeScolaire }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur lors de la création");
        return;
      }
      setClasses((prev) => [...prev, { ...data, nbEleves: 0, nbDisciplines: 0 }]);
      setNom("");
      setAnneeScolaire("");
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
            <th>Année scolaire</th>
            <th>Élèves</th>
            <th>Disciplines</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {classes.map((c) => (
            <tr key={c.id}>
              <td>{c.nom}</td>
              <td>{c.anneeScolaire}</td>
              <td>{c.nbEleves}</td>
              <td>{c.nbDisciplines}</td>
              <td>
                <Link href={`/admin/classes/${c.id}`}>Gérer</Link>
              </td>
            </tr>
          ))}
          {classes.length === 0 && (
            <tr>
              <td colSpan={5}>Aucune classe pour le moment.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Ajouter une classe</h2>
      <form onSubmit={ajouter} className="carte">
        <label>
          Nom
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="MP2I-1" required />
        </label>
        <label>
          Année scolaire
          <input
            value={anneeScolaire}
            onChange={(e) => setAnneeScolaire(e.target.value)}
            placeholder="2025-2026"
            required
          />
        </label>
        {erreur && <p className="champ-erreur">{erreur}</p>}
        <button type="submit" disabled={enCours}>
          {enCours ? "Création…" : "Ajouter"}
        </button>
      </form>
    </div>
  );
}
