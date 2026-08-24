"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";

type Ligne = {
  eleve: string;
  jour: string;
  heureDebut: string;
  heureFin: string;
  valeur: number | null;
  appreciation: string;
};

type Groupe = {
  kholleurId: string;
  nom: string;
  statut: string;
  lignes: Ligne[];
};

export function DetailSessionReferent({
  sessionId,
  groupes,
  valideInitial,
}: {
  sessionId: string;
  groupes: Groupe[];
  valideInitial: boolean;
}) {
  const router = useRouter();
  const [valide, setValide] = useState(valideInitial);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const totalValides = groupes.filter((g) => g.statut === "VALIDE").length;
  const toutValide = groupes.length > 0 && totalValides === groupes.length;

  async function rouvrir(kholleurId: string) {
    setEnCours(kholleurId);
    setErreur(null);
    try {
      const res = await fetch(`/api/referent/sessions/${sessionId}/kholleurs/${kholleurId}/rouvrir`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur lors de la réouverture");
        return;
      }
      router.refresh();
    } finally {
      setEnCours(null);
    }
  }

  async function validerSession() {
    if (!confirm("Valider cette session ? Les notes deviendront visibles aux élèves.")) return;
    setEnCours("session");
    setErreur(null);
    try {
      const res = await fetch(`/api/referent/sessions/${sessionId}/valider`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur lors de la validation");
        return;
      }
      setValide(true);
    } finally {
      setEnCours(null);
    }
  }

  return (
    <div>
      <p>
        {totalValides}/{groupes.length} kholleurs ont validé leur grille.{" "}
        {valide && <StatusBadge statut="VALIDE" />}
      </p>

      {groupes.map((g) => (
        <details key={g.kholleurId} className="carte" open={groupes.length <= 3}>
          <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
            <strong>{g.nom}</strong>
            <StatusBadge statut={g.statut} />
          </summary>

          <table style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Élève</th>
                <th>Créneau</th>
                <th>Note</th>
                <th>Appréciation</th>
              </tr>
            </thead>
            <tbody>
              {g.lignes.map((l, i) => (
                <tr key={i}>
                  <td>{l.eleve}</td>
                  <td>
                    {new Date(l.jour).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                    {" · "}
                    {l.heureDebut}-{l.heureFin}
                  </td>
                  <td>{l.valeur ?? "—"}</td>
                  <td>{l.appreciation || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {g.statut === "VALIDE" && !valide && (
            <p style={{ marginTop: 12 }}>
              <button className="secondaire" onClick={() => rouvrir(g.kholleurId)} disabled={enCours === g.kholleurId}>
                {enCours === g.kholleurId ? "Réouverture…" : "Rouvrir la grille"}
              </button>
            </p>
          )}
        </details>
      ))}

      {erreur && <p className="champ-erreur">{erreur}</p>}

      {!valide && (
        <p style={{ marginTop: 16 }}>
          <button onClick={validerSession} disabled={!toutValide || enCours === "session"}>
            {enCours === "session" ? "Validation…" : "Valider la session"}
          </button>
          {!toutValide && (
            <span style={{ marginLeft: 12, color: "#777", fontSize: "0.9rem" }}>
              Tous les kholleurs doivent avoir validé leur grille.
            </span>
          )}
        </p>
      )}
    </div>
  );
}
