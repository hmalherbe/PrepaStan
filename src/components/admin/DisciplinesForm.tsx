"use client";

import { useState } from "react";

type Discipline = { id: string; nom: string; estLangueVivante: boolean; classeIds: string[] };
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
  const [estLangueVivante, setEstLangueVivante] = useState(false);
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
        body: JSON.stringify({ nom, estLangueVivante }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur lors de la création");
        return;
      }
      setDisciplines((prev) => [...prev, { ...data, classeIds: [] }]);
      setNom("");
      setEstLangueVivante(false);
    } finally {
      setEnCours(false);
    }
  }

  async function sauvegarder(disciplineId: string, patch: { nom: string; estLangueVivante: boolean }) {
    setErreurEdition(null);
    // Mise à jour optimiste : nécessaire notamment pour la case "langue
    // vivante", qui se coche directement sans passer par le mode "Modifier".
    setDisciplines((prev) => prev.map((d) => (d.id === disciplineId ? { ...d, ...patch } : d)));
    const res = await fetch(`/api/admin/disciplines/${disciplineId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = await res.json();
      setErreurEdition(data.error ?? "Erreur lors de la modification");
      // On ne connaît pas l'état d'avant sans le re-fetcher ; le plus sûr
      // est de recharger la page si la mise à jour optimiste s'avère fausse.
      return;
    }
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
            <th>Langue vivante</th>
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
                onSauvegarder={(patch) => sauvegarder(d.id, patch)}
              />
            ) : (
              <tr key={d.id}>
                <td>{d.nom}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={d.estLangueVivante}
                    onChange={() => sauvegarder(d.id, { nom: d.nom, estLangueVivante: !d.estLangueVivante })}
                  />
                </td>
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
        <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={estLangueVivante}
            onChange={(e) => setEstLangueVivante(e.target.checked)}
          />
          Langue vivante
        </label>
        {erreur && <p className="champ-erreur">{erreur}</p>}
        <button type="submit" disabled={enCours} style={{ marginTop: 12 }}>
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
  onSauvegarder: (patch: { nom: string; estLangueVivante: boolean }) => void;
}) {
  const [nom, setNom] = useState(discipline.nom);

  return (
    <tr>
      <td>
        <input value={nom} onChange={(e) => setNom(e.target.value)} />
      </td>
      <td />
      <td>{discipline.classeIds.length}</td>
      <td style={{ display: "flex", gap: 6 }}>
        <button onClick={() => onSauvegarder({ nom, estLangueVivante: discipline.estLangueVivante })}>OK</button>
        <button className="discret" onClick={onAnnuler}>
          Annuler
        </button>
      </td>
    </tr>
  );
}
