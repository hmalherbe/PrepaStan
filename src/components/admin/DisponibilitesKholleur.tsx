"use client";

import { useState } from "react";

const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

type Disponibilite = { id: string; jourSemaine: number | null; heureDebut: string; heureFin: string };

export function DisponibilitesKholleur({
  kholleurId,
  disponibilitesInitiales,
}: {
  kholleurId: string;
  disponibilitesInitiales: Disponibilite[];
}) {
  const [disponibilites, setDisponibilites] = useState(disponibilitesInitiales);
  const [jourSemaine, setJourSemaine] = useState(1);
  const [heureDebut, setHeureDebut] = useState("14:00");
  const [heureFin, setHeureFin] = useState("18:00");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const res = await fetch(`/api/admin/kholleurs/${kholleurId}/disponibilites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jourSemaine, heureDebut, heureFin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur lors de l'ajout");
        return;
      }
      setDisponibilites((prev) => [...prev, data]);
    } finally {
      setEnCours(false);
    }
  }

  async function supprimer(dispoId: string) {
    const res = await fetch(`/api/admin/kholleurs/${kholleurId}/disponibilites/${dispoId}`, { method: "DELETE" });
    if (!res.ok) return;
    setDisponibilites((prev) => prev.filter((d) => d.id !== dispoId));
  }

  return (
    <div>
      <h2>Disponibilités récurrentes</h2>
      <table>
        <thead>
          <tr>
            <th>Jour</th>
            <th>De</th>
            <th>À</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {disponibilites.map((d) => (
            <tr key={d.id}>
              <td>{d.jourSemaine ? JOURS[d.jourSemaine - 1] : "Date ponctuelle"}</td>
              <td>{d.heureDebut}</td>
              <td>{d.heureFin}</td>
              <td>
                <button className="discret" onClick={() => supprimer(d.id)}>
                  Retirer
                </button>
              </td>
            </tr>
          ))}
          {disponibilites.length === 0 && (
            <tr>
              <td colSpan={4}>Aucune disponibilité pour le moment.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>Ajouter une disponibilité</h3>
      <form onSubmit={ajouter} className="carte">
        <label>
          Jour de la semaine
          <select value={jourSemaine} onChange={(e) => setJourSemaine(Number(e.target.value))}>
            {JOURS.map((j, i) => (
              <option key={j} value={i + 1}>
                {j}
              </option>
            ))}
          </select>
        </label>
        <label>
          De
          <input type="time" value={heureDebut} onChange={(e) => setHeureDebut(e.target.value)} required />
        </label>
        <label>
          À
          <input type="time" value={heureFin} onChange={(e) => setHeureFin(e.target.value)} required />
        </label>
        {erreur && <p className="champ-erreur">{erreur}</p>}
        <button type="submit" disabled={enCours}>
          {enCours ? "Ajout…" : "Ajouter"}
        </button>
      </form>
    </div>
  );
}
