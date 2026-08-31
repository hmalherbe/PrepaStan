"use client";

import { useState } from "react";

export function ParametresGenerauxForm({ delaiInitial }: { delaiInitial: number }) {
  const [delai, setDelai] = useState(delaiInitial);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function enregistrer() {
    setEnCours(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/parametres-generaux", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delaiEnvoiMailsNotationJours: delai }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMessage(data.error ?? "Erreur lors de l'enregistrement");
        return;
      }
      setMessage("Enregistré.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="carte" style={{ marginBottom: 20 }}>
      <h2>Paramètres généraux</h2>
      <label>
        Délai d&apos;envoi des mails de rappel aux kholleurs (jours)
        <input
          type="number"
          min={0}
          max={60}
          value={delai}
          onChange={(e) => setDelai(Number(e.target.value))}
          style={{ width: 80 }}
        />
      </label>
      <p style={{ color: "#777", fontSize: "0.9rem" }}>
        Nombre de jours après la khôlle avant d&apos;envoyer un email de rappel au kholleur s&apos;il n&apos;a pas
        encore saisi note et appréciation. 0 = envoi dès que possible après la khôlle (le jour même).
      </p>
      <button type="button" onClick={enregistrer} disabled={enCours}>
        {enCours ? "Enregistrement..." : "Enregistrer"}
      </button>
      {message && <p>{message}</p>}
    </div>
  );
}
