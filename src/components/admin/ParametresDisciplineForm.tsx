"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Ligne = {
  disciplineId: string;
  disciplineNom: string;
  dureePreparationMinutes: number;
  dureeKholleMinutes: number;
};

type Classe = { id: string; nom: string };

export function ParametresDisciplineForm({
  classes,
  classeId,
  lignesInitiales,
}: {
  classes: Classe[];
  classeId: string;
  lignesInitiales: Ligne[];
}) {
  const router = useRouter();
  const [lignes, setLignes] = useState(lignesInitiales);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function modifier(disciplineId: string, champ: "dureePreparationMinutes" | "dureeKholleMinutes", valeur: number) {
    setLignes((prev) => prev.map((l) => (l.disciplineId === disciplineId ? { ...l, [champ]: valeur } : l)));
  }

  async function enregistrer() {
    setEnCours(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/parametres", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classeId,
          parametres: lignes.map((l) => ({
            disciplineId: l.disciplineId,
            dureePreparationMinutes: l.dureePreparationMinutes,
            dureeKholleMinutes: l.dureeKholleMinutes,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMessage(data.error ?? "Erreur lors de l'enregistrement");
        return;
      }
      setMessage("Enregistré.");
      router.refresh();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div>
      <label>
        Classe
        <select value={classeId} onChange={(e) => router.push(`/admin/parametres?classeId=${e.target.value}`)}>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
      </label>

      {lignes.length === 0 ? (
        <p>Aucune discipline assignée à cette classe pour le moment (écran Classes).</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Discipline</th>
                <th>Durée préparation (min)</th>
                <th>Durée khôlle (min)</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.disciplineId}>
                  <td>{l.disciplineNom}</td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      max={240}
                      value={l.dureePreparationMinutes}
                      onChange={(e) => modifier(l.disciplineId, "dureePreparationMinutes", Number(e.target.value))}
                      style={{ width: 70 }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      max={240}
                      value={l.dureeKholleMinutes}
                      onChange={(e) => modifier(l.disciplineId, "dureeKholleMinutes", Number(e.target.value))}
                      style={{ width: 70 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={enregistrer} disabled={enCours} style={{ marginTop: 12 }}>
            {enCours ? "Enregistrement..." : "Enregistrer"}
          </button>
          {message && <p>{message}</p>}
        </>
      )}
    </div>
  );
}
