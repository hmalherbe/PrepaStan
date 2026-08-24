"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";

const LIENS_PAR_ROLE: Record<string, { href: string; label: string }> = {
  ADMIN: { href: "/admin/planification", label: "Planification" },
  KHOLLEUR: { href: "/kholleur/sessions", label: "Mes sessions" },
  PROFESSEUR_REFERENT: { href: "/referent/sessions", label: "Sessions à valider" },
  ELEVE: { href: "/eleve/notes", label: "Mes notes" },
};

export function NavBar() {
  const { data: session, status } = useSession();

  if (status !== "authenticated") {
    return null;
  }

  const lien = LIENS_PAR_ROLE[session.user.role];

  return (
    <header className="navbar">
      <Link href="/" style={{ fontWeight: 700, textDecoration: "none", color: "inherit" }}>
        PrepaStan
      </Link>
      <nav>
        {lien && <Link href={lien.href}>{lien.label}</Link>}
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
