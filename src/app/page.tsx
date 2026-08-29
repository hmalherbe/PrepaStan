import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { authOptions } from "@/lib/auth";

// Une même personne peut cumuler plusieurs rôles : on redirige vers le
// premier écran pertinent selon cet ordre de priorité.
const ACCUEIL_PAR_ROLE: [Role, string][] = [
  ["ADMIN", "/admin/planification"],
  ["KHOLLEUR", "/kholleur/sessions"],
  ["PROFESSEUR_REFERENT", "/referent/sessions"],
  ["ELEVE", "/eleve/notes"],
];

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (session) {
    const trouve = ACCUEIL_PAR_ROLE.find(([role]) => session.user.roles.includes(role));
    redirect(trouve?.[1] ?? "/login");
  }
  redirect("/login");
}
