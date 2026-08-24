import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

const ACCUEIL_PAR_ROLE: Record<string, string> = {
  ADMIN: "/admin/planification",
  KHOLLEUR: "/kholleur/sessions",
  PROFESSEUR_REFERENT: "/referent/sessions",
  ELEVE: "/eleve/notes",
};

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect(ACCUEIL_PAR_ROLE[session.user.role] ?? "/login");
  }
  redirect("/login");
}
