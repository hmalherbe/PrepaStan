"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function ReinitialiserMotDePasseForm({ token }: { token: string }) {
  const router = useRouter();
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [reussi, setReussi] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErreur(null);

    if (motDePasse !== confirmation) {
      setErreur("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setEnCours(true);
    const res = await fetch("/api/auth/reinitialiser-mot-de-passe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, motDePasse }),
    });
    setEnCours(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setErreur(data?.erreur ?? "Une erreur est survenue.");
      return;
    }

    setReussi(true);
    setTimeout(() => router.push("/login"), 2000);
  }

  if (!token) {
    return (
      <>
        <p role="alert">Lien invalide : aucun token fourni.</p>
        <p>
          <Link href="/mot-de-passe-oublie">Redemander un lien</Link>
        </p>
      </>
    );
  }

  if (reussi) {
    return <p>Votre mot de passe a bien été mis à jour. Redirection vers la connexion...</p>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Nouveau mot de passe
        <input
          type="password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          minLength={8}
          required
        />
      </label>
      <label>
        Confirmation
        <input
          type="password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          minLength={8}
          required
        />
      </label>
      {erreur && <p role="alert">{erreur}</p>}
      <button type="submit" disabled={enCours}>
        {enCours ? "Enregistrement..." : "Enregistrer le nouveau mot de passe"}
      </button>
    </form>
  );
}
