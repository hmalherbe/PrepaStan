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
  fichierNom: string | null;
};

type EtatSauvegarde = "idle" | "saving" | "saved" | "error";

const TYPES_FICHIER_ACCEPTES = ".pdf,.doc,.docx";

export function GrilleForm({
  sessionId,
  lignesInitiales,
  valideInitial,
  dateValidation,
  gelee,
}: {
  sessionId: string;
  lignesInitiales: Ligne[];
  valideInitial: boolean;
  dateValidation: string | null;
  // Le référent a validé la session entière (SessionKholle.statut ===
  // CLOTUREE) : la grille de ce kholleur ne peut alors plus jamais être
  // rouverte (voir .../rouvrir), donc verrouillée pour de bon — au-delà de
  // `valide`, qui ne reflète que sa propre validation et peut encore être
  // annulée par le référent tant que la session n'est pas gelée.
  gelee: boolean;
}) {
  const [lignes, setLignes] = useState(lignesInitiales);
  const [valide, setValide] = useState(valideInitial);
  const fige = valide || gelee;
  const [etats, setEtats] = useState<Record<string, EtatSauvegarde>>({});
  const [erreurValidation, setErreurValidation] = useState<string | null>(null);
  const [validationEnCours, setValidationEnCours] = useState(false);
  const [etatsFichier, setEtatsFichier] = useState<Record<string, EtatSauvegarde>>({});
  const [erreursFichier, setErreursFichier] = useState<Record<string, string>>({});

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

  async function televerserFichier(passageId: string, fichier: File) {
    setEtatsFichier((prev) => ({ ...prev, [passageId]: "saving" }));
    setErreursFichier((prev) => ({ ...prev, [passageId]: "" }));
    try {
      const corps = new FormData();
      corps.append("fichier", fichier);
      const res = await fetch(`/api/passages/${passageId}/fichier`, { method: "POST", body: corps });
      const data = await res.json();
      if (!res.ok) {
        setErreursFichier((prev) => ({ ...prev, [passageId]: data.error ?? "Erreur lors de l'envoi" }));
        setEtatsFichier((prev) => ({ ...prev, [passageId]: "error" }));
        return;
      }
      setLignes((prev) => prev.map((l) => (l.passageId === passageId ? { ...l, fichierNom: data.fichierNom } : l)));
      setEtatsFichier((prev) => ({ ...prev, [passageId]: "saved" }));
    } catch {
      setEtatsFichier((prev) => ({ ...prev, [passageId]: "error" }));
    }
  }

  async function supprimerFichier(passageId: string) {
    setEtatsFichier((prev) => ({ ...prev, [passageId]: "saving" }));
    try {
      const res = await fetch(`/api/passages/${passageId}/fichier`, { method: "DELETE" });
      if (!res.ok) {
        setEtatsFichier((prev) => ({ ...prev, [passageId]: "error" }));
        return;
      }
      setLignes((prev) => prev.map((l) => (l.passageId === passageId ? { ...l, fichierNom: null } : l)));
      setEtatsFichier((prev) => ({ ...prev, [passageId]: "idle" }));
    } catch {
      setEtatsFichier((prev) => ({ ...prev, [passageId]: "error" }));
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

  const toutSaisi = lignes.every((l) => l.valeur !== null && l.appreciation.trim() !== "");

  return (
    <div>
      {gelee ? (
        <p className="badge badge-succes">Gelée — validée par le référent, verrouillée définitivement</p>
      ) : (
        valide && (
          <p className="badge badge-succes">
            Grille validée{dateValidation ? ` le ${new Date(dateValidation).toLocaleString("fr-FR")}` : ""}
          </p>
        )
      )}

      <table>
        <thead>
          <tr>
            <th>Élève</th>
            <th>Créneau</th>
            <th>Salle</th>
            <th>Note</th>
            <th>Appréciation</th>
            <th>Pièce jointe</th>
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
                  disabled={fige}
                  onChange={(e) => majLigne(l.passageId, "valeur", e.target.value)}
                  onBlur={() => enregistrerLigne(l)}
                />
              </td>
              <td>
                <textarea
                  rows={2}
                  style={{ width: "100%", minWidth: 220 }}
                  value={l.appreciation}
                  disabled={fige}
                  onChange={(e) => majLigne(l.passageId, "appreciation", e.target.value)}
                  onBlur={() => enregistrerLigne(l)}
                />
              </td>
              <td>
                {l.fichierNom ? (
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <a href={`/api/passages/${l.passageId}/fichier`} target="_blank" rel="noreferrer">
                      {l.fichierNom}
                    </a>
                    {!fige && (
                      <button
                        type="button"
                        className="discret"
                        onClick={() => supprimerFichier(l.passageId)}
                        disabled={etatsFichier[l.passageId] === "saving"}
                      >
                        Retirer
                      </button>
                    )}
                  </span>
                ) : (
                  !fige && (
                    <input
                      type="file"
                      accept={TYPES_FICHIER_ACCEPTES}
                      style={{ width: 160, fontSize: "0.85rem" }}
                      disabled={etatsFichier[l.passageId] === "saving"}
                      onChange={(e) => {
                        const fichier = e.target.files?.[0];
                        if (fichier) televerserFichier(l.passageId, fichier);
                        e.target.value = "";
                      }}
                    />
                  )
                )}
                {etatsFichier[l.passageId] === "saving" && (
                  <div style={{ fontSize: "0.8rem", color: "#777" }}>Envoi…</div>
                )}
                {etatsFichier[l.passageId] === "error" && (
                  <div className="champ-erreur" style={{ fontSize: "0.8rem" }}>
                    {erreursFichier[l.passageId] || "Erreur"}
                  </div>
                )}
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

      {!fige && (
        <p style={{ marginTop: 16 }}>
          <button onClick={valider} disabled={!toutSaisi || validationEnCours}>
            {validationEnCours ? "Validation…" : "Valider ma grille"}
          </button>
          {!toutSaisi && (
            <span style={{ marginLeft: 12, color: "#777", fontSize: "0.9rem" }}>
              Toutes les notes et appréciations doivent être saisies avant validation.
            </span>
          )}
        </p>
      )}
    </div>
  );
}
