"use client";

import "quill/dist/quill.core.css";
import { useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { AppreciationEditor, estAppreciationVide } from "@/components/kholleur/AppreciationEditor";

type Ligne = {
  passageId: string;
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

type EtatSauvegarde = "idle" | "saving" | "saved" | "error";

export function DetailSessionReferent({
  sessionId,
  groupes: groupesInitiaux,
  valideInitial,
}: {
  sessionId: string;
  groupes: Groupe[];
  valideInitial: boolean;
}) {
  const [groupes, setGroupes] = useState(groupesInitiaux);
  const [valide, setValide] = useState(valideInitial);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  // kholleurId de la fiche actuellement dépliée en édition (une seule à la
  // fois, pour ne pas multiplier les éditeurs Quill montés en même temps).
  const [kholleurEnEdition, setKholleurEnEdition] = useState<string | null>(null);
  const [etatsSauvegarde, setEtatsSauvegarde] = useState<Record<string, EtatSauvegarde>>({});

  const totalValides = groupes.filter((g) => g.statut === "VALIDE").length;
  const toutValide = groupes.length > 0 && totalValides === groupes.length;

  function majLigne(passageId: string, champ: "valeur" | "appreciation", val: string) {
    setGroupes((prev) =>
      prev.map((g) => ({
        ...g,
        lignes: g.lignes.map((l) =>
          l.passageId === passageId
            ? { ...l, [champ]: champ === "valeur" ? (val === "" ? null : Number(val)) : val }
            : l
        ),
      }))
    );
  }

  async function enregistrerLigne(ligne: Ligne) {
    setEtatsSauvegarde((prev) => ({ ...prev, [ligne.passageId]: "saving" }));
    try {
      const res = await fetch(`/api/referent/passages/${ligne.passageId}/note`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valeur: ligne.valeur,
          appreciation: estAppreciationVide(ligne.appreciation) ? null : ligne.appreciation,
        }),
      });
      if (!res.ok) throw new Error();
      setEtatsSauvegarde((prev) => ({ ...prev, [ligne.passageId]: "saved" }));
    } catch {
      setEtatsSauvegarde((prev) => ({ ...prev, [ligne.passageId]: "error" }));
    }
  }

  async function validerSession() {
    if (!confirm("Valider cette session ? Les notes deviendront visibles aux étudiants.")) return;
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

      {groupes.map((g) => {
        const enEdition = kholleurEnEdition === g.kholleurId;
        return (
          <details key={g.kholleurId} className="carte" open={groupes.length <= 3}>
            <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
              <strong>{g.nom}</strong>
              <StatusBadge statut={g.statut} />
              {!valide && (
                <button
                  type="button"
                  className="discret"
                  style={{ marginLeft: "auto" }}
                  onClick={(e) => {
                    e.preventDefault();
                    setKholleurEnEdition(enEdition ? null : g.kholleurId);
                  }}
                >
                  {enEdition ? "Terminer la modification" : "Modifier"}
                </button>
              )}
            </summary>

            <table style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Étudiant</th>
                  <th>Créneau</th>
                  <th>Note</th>
                  <th style={{ width: "100%" }}>Appréciation</th>
                </tr>
              </thead>
              <tbody>
                {g.lignes.map((l) => (
                  <tr key={l.passageId}>
                    <td>{l.eleve}</td>
                    <td>
                      {new Date(l.jour).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                      {" · "}
                      {l.heureDebut}-{l.heureFin}
                    </td>
                    {enEdition ? (
                      <>
                        <td>
                          <input
                            type="number"
                            min={0}
                            max={20}
                            step={0.5}
                            style={{ width: 70 }}
                            value={l.valeur ?? ""}
                            onChange={(e) => majLigne(l.passageId, "valeur", e.target.value)}
                            onBlur={() => enregistrerLigne(l)}
                          />
                        </td>
                        <td>
                          <AppreciationEditor
                            value={l.appreciation}
                            disabled={false}
                            onChange={(html) => majLigne(l.passageId, "appreciation", html)}
                            onBlur={() => enregistrerLigne(l)}
                            // Pas de pièce jointe depuis cet écran : le
                            // khôlleur reste responsable de la sienne, le
                            // référent ne fait que corriger du texte.
                            onChoisirPieceJointe={() => {}}
                            accept=".pdf,.doc,.docx"
                          />
                          {etatsSauvegarde[l.passageId] === "saving" && (
                            <div style={{ fontSize: "0.8rem", color: "#777" }}>Enregistrement…</div>
                          )}
                          {etatsSauvegarde[l.passageId] === "saved" && (
                            <div style={{ fontSize: "0.8rem", color: "#777" }}>Enregistré ✓</div>
                          )}
                          {etatsSauvegarde[l.passageId] === "error" && (
                            <div className="champ-erreur" style={{ fontSize: "0.8rem" }}>Erreur</div>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{l.valeur ?? "—"}</td>
                        <td>
                          {l.appreciation ? (
                            <div className="ql-editor" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: l.appreciation }} />
                          ) : (
                            "—"
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        );
      })}

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
