"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const REDIRECTION_PAR_ROLE: Record<string, string> = {
  ADMIN: "/admin/planification",
  KHOLLEUR: "/kholleur/sessions",
  PROFESSEUR_REFERENT: "/referent/sessions",
  ELEVE: "/eleve/notes",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);

    const result = await signIn("credentials", { email, password, redirect: false });

    setEnCours(false);
    if (!result || result.error) {
      setErreur("Email ou mot de passe incorrect.");
      return;
    }

    const session = await fetch("/api/auth/session").then((r) => r.json());
    router.push(REDIRECTION_PAR_ROLE[session?.user?.role] ?? "/");
  }

  return (
    <main>
      <h1>Connexion</h1>
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
        <label>
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {erreur && <p role="alert">{erreur}</p>}
        <button type="submit" disabled={enCours}>
          {enCours ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </main>
  );
}
