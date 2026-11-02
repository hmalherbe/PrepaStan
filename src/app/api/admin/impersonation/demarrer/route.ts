import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { creerCookieSession, pageDestination } from "@/lib/impersonation";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  email: z.string().email(),
  motDePasseAdmin: z.string().min(1),
});

// POST /api/admin/impersonation/demarrer
// Prise de main admin : remplace la session courante par celle d'un autre
// compte (étudiant, khôlleur ou référent), identifié par son email, sans
// connaître son mot de passe — authentifié à la place par le mot de passe
// de L'ADMIN courant (ressaisi ici, "sudo" avant une action sensible).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }
  if (!session.user.roles.includes("ADMIN")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  if (session.user.impersonatorId) {
    return NextResponse.json(
      { error: "Vous êtes déjà en train de prendre la main sur un autre profil — revenez d'abord à votre compte admin" },
      { status: 409 }
    );
  }

  const { email, motDePasseAdmin } = bodySchema.parse(await req.json());

  const admin = await prisma.utilisateur.findUniqueOrThrow({ where: { id: session.user.id } });
  const motDePasseValide = await bcrypt.compare(motDePasseAdmin, admin.password);
  if (!motDePasseValide) {
    return NextResponse.json({ error: "Mot de passe administrateur incorrect" }, { status: 401 });
  }

  const cible = await prisma.utilisateur.findUnique({ where: { email } });
  if (!cible) {
    return NextResponse.json({ error: "Aucun compte avec cet email" }, { status: 404 });
  }
  if (cible.roles.includes("ADMIN")) {
    return NextResponse.json({ error: "Impossible de prendre la main sur un compte administrateur" }, { status: 403 });
  }
  if (!cible.roles.some((r) => r === "KHOLLEUR" || r === "PROFESSEUR_REFERENT" || r === "ELEVE")) {
    return NextResponse.json({ error: "Ce compte n'a aucun rôle khôlleur, référent ou étudiant" }, { status: 403 });
  }

  // Traçabilité minimale : qui a pris la main sur qui, et quand. Pas de
  // table d'audit dédiée pour l'instant (à ajouter si le besoin se
  // confirme) — au moins visible dans les logs du conteneur en production.
  console.log(`[impersonation] ${admin.email} prend la main sur ${cible.email} à ${new Date().toISOString()}`);

  const { nom, valeur, options } = await creerCookieSession(cible, admin.id);
  const reponse = NextResponse.json({ ok: true, redirect: pageDestination(cible.roles) });
  reponse.cookies.set(nom, valeur, options);
  return reponse;
}
