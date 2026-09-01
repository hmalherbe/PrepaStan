"use client";

import { useMemo, useState } from "react";

type Ligne = {
  passageId: string;
  semaine: number;
  discipline: string;
  date: string; // "YYYY-MM-DD"
  valide: boolean;
  valeur: number | null;
  appreciation: string;
  fichierNom: string | null;
};

export function NotesEleveTable({ lignes }: { lignes: Ligne[] }) {
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");

  const lignesAffichees = useMemo(
    () =>
      lignes.filter((l) => (!dateDebut || l.date >= dateDebut) && (!dateFin || l.date <= dateFin)),
    [lignes, dateDebut, dateFin]
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <label style={{ maxWidth: 200 }}>
          Du
          <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
        </label>
        <label style={{ maxWidth: 200 }}>
          Au
          <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
        </label>
        {(dateDebut || dateFin) && (
          <button
            type="button"
            className="discret"
            style={{ alignSelf: "flex-end", marginBottom: 12 }}
            onClick={() => {
              setDateDebut("");
              setDateFin("");
            }}
          >
            Réinitialiser
          </button>
        )}
      </div>

      <table>
        <thead>
          <tr>
            <th>Semaine</th>
            <th>Discipline</th>
            <th>Date</th>
            <th>Note</th>
            <th>Appréciation</th>
            <th>Pièce jointe</th>
          </tr>
        </thead>
        <tbody>
          {lignesAffichees.map((l) => (
            <tr key={l.passageId}>
              <td>{l.semaine}</td>
              <td>{l.discipline}</td>
              <td>{new Date(l.date).toLocaleDateString("fr-FR")}</td>
              {l.valide ? (
                <>
                  <td>{l.valeur ?? "—"}</td>
                  <td>{l.appreciation || "—"}</td>
                  <td>
                    {l.fichierNom ? (
                      <a href={`/api/passages/${l.passageId}/fichier`} target="_blank" rel="noreferrer">
                        {l.fichierNom}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </>
              ) : (
                <td colSpan={3} style={{ color: "#777" }}>
                  En attente
                </td>
              )}
            </tr>
          ))}
          {lignesAffichees.length === 0 && (
            <tr>
              <td colSpan={6}>
                {lignes.length === 0 ? "Aucune khôlle passée pour le moment." : "Aucune khôlle sur cette période."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
