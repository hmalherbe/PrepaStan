"use client";

import { useState } from "react";

type Ligne = {
  passageId: string;
  eleve: string;
  jour: string;
  heureDebut: string;
  heureFin: string;
  salle: string;
  valeur: number | null;
  appreciation: string;
};

type EtatSauvegarde = "idle" | "saving" | "saved" | "error";

export function GrilleForm({
  sessionId,
  lignesInitiales,
  valideInitial,
  dateValidation,
}: {
  sessionId: string;
  lignesInitiales: Ligne[];
  valideInitial: boolean;
  dateValidation: string | null;
}) {
  const [lignes, setLignes] = useState(lignesInitiales);
  const [valide, setValide] = useState(valideInitial);
  const [etats, setEtats] = useState<Record<string, EtatSauvegarde>>({});
  const [erreurValidation, setErreurValidation] = useState<string | null>(null);
  const [validationEnCours, setValidationEnCours] = useState(false);

  function majLigne(passageId: string, champ: "valeur" | "appreciation", val: string) {
    setLignes((prev) =>
      prev.map((l) =>
        l.passageId === passageId
          ? { ...l, [champ]: champ === "valeur" ? (val === "" ? null : Number(val)) : val }
          : l
      )
    );
  }

  async function enregistrerLigne(ligne: Ligne) {
    setEtats((prev) => ({ ...prev, [ligne.passageId]: "saving" }));
    try {
      const res = await fetch(`/api/passages/${ligne.passageId}/note`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valeur: ligne.valeur, appreciation: ligne.appreciation || null }),
      });
      if (!res.ok) throw new Error();
      setEtats((prev) => ({ ...prev, [ligne.passageId]: "saved" }));
    } catch {
      setEtats((prev) => ({ ...prev, [ligne.passageId]: "error" }));
    }
  }

  async function valider() {
    if (!confirm("Une fois la grille validée, vous ne pourrez plus la modifier sauf réouverture par le référent. Confirmer ?")) {
      return;
    }
    setValidationEnCours(true);
    setErreurValidation(null);
    try {
      const res = await fetch(`/api/kholleur/sessions/${sessionId}/valider`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setErreurValidation(data.error ?? "Erreur lors de la validation");
        return;
      }
      setValide(true);
    } finally {
      setValidationEnCours(false);
    }
  }

  const toutesLesNotesSaisies = lignes.every((l) => l.valeur !== null);

  return (
    <div>
      {valide && (
        <p className="badge badge-succes">
          Grille validée{dateValidation ? ` le ${new Date(dateValidation).toLocaleString("fr-FR")}` : ""}
        </p>
      )}

      <table>
        <thead>
          <tr>
            <th>Élève</th>
            <th>Créneau</th>
            <th>Salle</th>
            <th>Note</th>
            <th>Appréciation</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.passageId}>
              <td>{l.eleve}</td>
              <td>
                {new Date(l.jour).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                {" · "}
                {l.heureDebut}-{l.heureFin}
              </td>
              <td>{l.salle}</td>
              <td>
                <input
                  type="number"
                  min={0}
                  max={20}
                  step={0.5}
                  style={{ width: 70 }}
                  value={l.valeur ?? ""}
                  disabled={valide}
                  onChange={(e) => majLigne(l.passageId, "valeur", e.target.value)}
                  onBlur={() => enregistrerLigne(l)}
                />
              </td>
              <td>
                <textarea
                  rows={2}
                  style={{ width: "100%", minWidth: 220 }}
                  value={l.appreciation}
                  disabled={valide}
                  onChange={(e) => majLigne(l.passageId, "appreciation", e.target.value)}
                  onBlur={() => enregistrerLigne(l)}
                />
              </td>
              <td style={{ fontSize: "0.8rem", color: "#777" }}>
                {etats[l.passageId] === "saving" && "Enregistrement…"}
                {etats[l.passageId] === "saved" && "Enregistré ✓"}
                {etats[l.passageId] === "error" && <span className="champ-erreur">Erreur</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {erreurValidation && <p className="champ-erreur">{erreurValidation}</p>}

      {!valide && (
        <p style={{ marginTop: 16 }}>
          <button onClick={valider} disabled={!toutesLesNotesSaisies || validationEnCours}>
            {validationEnCours ? "Validation…" : "Valider ma grille"}
          </button>
          {!toutesLesNotesSaisies && (
            <span style={{ marginLeft: 12, color: "#777", fontSize: "0.9rem" }}>
              Toutes les notes doivent être saisies avant validation.
            </span>
          )}
        </p>
      )}
    </div>
  );
}
