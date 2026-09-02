"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

export default function MotDePasseOubliePage() {
  const [email, setEmail] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    await fetch("/api/auth/mot-de-passe-oublie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setEnCours(false);
    setEnvoye(true);
  }

  if (envoye) {
    return (
      <main>
        <h1>Mot de passe oublié</h1>
        <p>
          Si un compte existe pour l&apos;adresse {email}, un email contenant un lien de
          réinitialisation vient de vous être envoyé. Pensez à vérifier vos courriers indésirables.
        </p>
        <p>
          <Link href="/login">Retour à la connexion</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Mot de passe oublié</h1>
      <p>Saisissez votre email : nous vous enverrons un lien pour choisir un nouveau mot de passe.</p>
      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={enCours}>
          {enCours ? "Envoi..." : "Envoyer le lien"}
        </button>
      </form>
      <p>
        <Link href="/login">Retour à la connexion</Link>
      </p>
    </main>
  );
}
