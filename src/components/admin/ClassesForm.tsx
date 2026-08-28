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
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [erreurEdition, setErreurEdition] = useState<string | null>(null);

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

  async function sauvegarderEdition(classeId: string, patch: { nom: string; anneeScolaire: string }) {
    setErreurEdition(null);
    const res = await fetch(`/api/admin/classes/${classeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) {
      setErreurEdition(data.error ?? "Erreur lors de la modification");
      return;
    }
    setClasses((prev) => prev.map((c) => (c.id === classeId ? { ...c, nom: data.nom, anneeScolaire: data.anneeScolaire } : c)));
    setEnEdition(null);
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
          {classes.map((c) =>
            enEdition === c.id ? (
              <LigneEdition
                key={c.id}
                classe={c}
                onAnnuler={() => setEnEdition(null)}
                onSauvegarder={(patch) => sauvegarderEdition(c.id, patch)}
              />
            ) : (
              <tr key={c.id}>
                <td>{c.nom}</td>
                <td>{c.anneeScolaire}</td>
                <td>{c.nbEleves}</td>
                <td>{c.nbDisciplines}</td>
                <td style={{ display: "flex", gap: 8 }}>
                  <button className="discret" onClick={() => setEnEdition(c.id)}>
                    Modifier
                  </button>
                  <Link href={`/admin/classes/${c.id}`}>Gérer</Link>
                </td>
              </tr>
            )
          )}
          {classes.length === 0 && (
            <tr>
              <td colSpan={5}>Aucune classe pour le moment.</td>
            </tr>
          )}
        </tbody>
      </table>
      {erreurEdition && <p className="champ-erreur">{erreurEdition}</p>}

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

function LigneEdition({
  classe,
  onAnnuler,
  onSauvegarder,
}: {
  classe: Classe;
  onAnnuler: () => void;
  onSauvegarder: (patch: { nom: string; anneeScolaire: string }) => void;
}) {
  const [nom, setNom] = useState(classe.nom);
  const [anneeScolaire, setAnneeScolaire] = useState(classe.anneeScolaire);

  return (
    <tr>
      <td>
        <input value={nom} onChange={(e) => setNom(e.target.value)} />
      </td>
      <td>
        <input value={anneeScolaire} onChange={(e) => setAnneeScolaire(e.target.value)} />
      </td>
      <td>{classe.nbEleves}</td>
      <td>{classe.nbDisciplines}</td>
      <td style={{ display: "flex", gap: 6 }}>
        <button onClick={() => onSauvegarder({ nom, anneeScolaire })}>OK</button>
        <button className="discret" onClick={onAnnuler}>
          Annuler
        </button>
      </td>
    </tr>
  );
}
