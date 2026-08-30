"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ANNEE_SCOLAIRE_COOKIE } from "@/lib/anneeScolaire";

const LIENS_PAR_ROLE: Record<string, { href: string; label: string }[]> = {
  ADMIN: [
    { href: "/admin/planification", label: "Planification" },
    { href: "/admin/classes", label: "Classes" },
    { href: "/admin/eleves", label: "Étudiants" },
    { href: "/admin/disciplines", label: "Disciplines" },
    { href: "/admin/kholleurs", label: "Kholleurs" },
    { href: "/admin/referents", label: "Référents" },
    { href: "/admin/salles", label: "Salles" },
    { href: "/admin/statistiques", label: "Statistiques" },
  ],
  KHOLLEUR: [{ href: "/kholleur/sessions", label: "Mes sessions" }],
  PROFESSEUR_REFERENT: [{ href: "/referent/sessions", label: "Sessions à valider" }],
  ELEVE: [{ href: "/eleve/notes", label: "Mes notes" }],
};

export function NavBar({
  anneeScolaireInitiale,
  anneesScolaires,
}: {
  anneeScolaireInitiale: string;
  anneesScolaires: string[];
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [anneeScolaire, setAnneeScolaire] = useState(anneeScolaireInitiale);

  if (status !== "authenticated") {
    return null;
  }

  // Une même personne peut cumuler plusieurs rôles (ex. khôlleur ET
  // référent) : on affiche l'union des liens de tous ses rôles, dans l'ordre
  // ADMIN > KHOLLEUR > PROFESSEUR_REFERENT > ELEVE, sans doublon.
  const liens = (["ADMIN", "KHOLLEUR", "PROFESSEUR_REFERENT", "ELEVE"] as const)
    .filter((r) => session.user.roles.includes(r))
    .flatMap((r) => LIENS_PAR_ROLE[r] ?? [])
    .filter((lien, i, arr) => arr.findIndex((l) => l.href === lien.href) === i);

  // Change l'année scolaire courante pour toute l'appli (ex. les nouvelles
  // classes créées y seront rattachées) : cookie lu par les Server
  // Components, plus un router.refresh() pour qu'ils se re-rendent avec la
  // nouvelle valeur.
  async function changerAnneeScolaire(libelle: string) {
    setAnneeScolaire(libelle);
    document.cookie = `${ANNEE_SCOLAIRE_COOKIE}=${encodeURIComponent(libelle)}; path=/; max-age=31536000`;
    // S'assure que l'entité existe déjà en base au moment où on en aura
    // besoin (création d'une classe) ; un 409 ("existe déjà") est normal
    // et sans conséquence.
    await fetch("/api/admin/annees-scolaires", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ libelle }),
    }).catch(() => {});
    router.refresh();
  }

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
        {session.user.roles.includes("ADMIN") && (
          <select
            value={anneeScolaire}
            onChange={(e) => changerAnneeScolaire(e.target.value)}
            aria-label="Année scolaire courante"
            title="Année scolaire courante (utilisée pour les nouvelles classes)"
          >
            {anneesScolaires.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
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
