"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";

const LIENS_PAR_ROLE: Record<string, { href: string; label: string }[]> = {
  ADMIN: [
    { href: "/admin/planification", label: "Planification" },
    { href: "/admin/classes", label: "Classes" },
    { href: "/admin/eleves", label: "Étudiants" },
    { href: "/admin/disciplines", label: "Disciplines" },
    { href: "/admin/kholleurs", label: "Kholleurs" },
    { href: "/admin/referents", label: "Référents" },
  ],
  KHOLLEUR: [{ href: "/kholleur/sessions", label: "Mes sessions" }],
  PROFESSEUR_REFERENT: [{ href: "/referent/sessions", label: "Sessions à valider" }],
  ELEVE: [{ href: "/eleve/notes", label: "Mes notes" }],
};

export function NavBar() {
  const { data: session, status } = useSession();
  const [ouvert, setOuvert] = useState(false);

  if (status !== "authenticated") {
    return null;
  }

  const liens = LIENS_PAR_ROLE[session.user.role] ?? [];

  return (
    <header className="navbar">
      <Link href="/" style={{ fontWeight: 700, textDecoration: "none", color: "inherit" }}>
        PrepaStan
      </Link>
      <button
        type="button"
        className="navbar-toggle"
        aria-label="Ouvrir le menu"
        aria-expanded={ouvert}
        onClick={() => setOuvert((v) => !v)}
      >
        ☰
      </button>
      <nav className={ouvert ? "ouvert" : ""}>
        {liens.map((lien) => (
          <Link key={lien.href} href={lien.href} onClick={() => setOuvert(false)}>
            {lien.label}
          </Link>
        ))}
        <span style={{ color: "#777", fontSize: "0.9rem" }}>
          {session.user.prenom} {session.user.nom}
        </span>
        <button className="discret" onClick={() => signOut({ callbackUrl: "/login" })}>
          Se déconnecter
        </button>
      </nav>
    </header>
  );
}
