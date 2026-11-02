"use client";

import { useState } from "react";

export function PriseDeMainForm({ emailInitial }: { emailInitial: string }) {
  const [email, setEmail] = useState(emailInitial);
  const [motDePasseAdmin, setMotDePasseAdmin] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const res = await fetch("/api/admin/impersonation/demarrer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, motDePasseAdmin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur lors de la prise de main");
        setEnCours(false);
        return;
      }
      // Navigation complète (pas router.push) : force NextAuth côté client
      // à relire le cookie de session fraîchement posé par le serveur,
      // plutôt que de garder en cache la session admin précédente.
      window.location.href = data.redirect;
    } catch {
      setErreur("Erreur lors de la prise de main");
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={soumettre} className="carte" style={{ maxWidth: 420 }}>
      <label>
        Email de la personne
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="prenom.nom@exemple.fr"
        />
      </label>
      <label>
        Votre mot de passe administrateur
        <input
          type="password"
          required
          value={motDePasseAdmin}
          onChange={(e) => setMotDePasseAdmin(e.target.value)}
        />
      </label>
      {erreur && <p className="champ-erreur">{erreur}</p>}
      <p>
        <button type="submit" disabled={enCours}>
          {enCours ? "Connexion…" : "Prendre la main"}
        </button>
      </p>
    </form>
  );
}
