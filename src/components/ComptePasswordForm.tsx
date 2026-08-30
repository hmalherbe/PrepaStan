"use client";

import { useState, type FormEvent } from "react";

export function ComptePasswordForm() {
  const [motDePasseActuel, setMotDePasseActuel] = useState("");
  const [nouveauMotDePasse, setNouveauMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);
  const [enCours, setEnCours] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setSucces(false);

    if (nouveauMotDePasse !== confirmation) {
      setErreur("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setEnCours(true);
    const res = await fetch("/api/compte/mot-de-passe", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motDePasseActuel, nouveauMotDePasse }),
    });
    setEnCours(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setErreur(data?.error ?? "Une erreur est survenue.");
      return;
    }

    setSucces(true);
    setMotDePasseActuel("");
    setNouveauMotDePasse("");
    setConfirmation("");
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Mot de passe actuel
        <input
          type="password"
          value={motDePasseActuel}
          onChange={(e) => setMotDePasseActuel(e.target.value)}
          required
        />
      </label>
      <label>
        Nouveau mot de passe
        <input
          type="password"
          value={nouveauMotDePasse}
          onChange={(e) => setNouveauMotDePasse(e.target.value)}
          minLength={8}
          required
        />
      </label>
      <label>
        Confirmer le nouveau mot de passe
        <input
          type="password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          minLength={8}
          required
        />
      </label>
      {erreur && <p role="alert">{erreur}</p>}
      {succes && <p role="status">Mot de passe modifié.</p>}
      <button type="submit" disabled={enCours}>
        {enCours ? "Modification..." : "Changer le mot de passe"}
      </button>
    </form>
  );
}
