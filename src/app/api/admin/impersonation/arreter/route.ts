import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { COOKIE_SECURISE, creerCookieSession } from "@/lib/impersonation";
import { prisma } from "@/lib/prisma";

// POST /api/admin/impersonation/arreter
// Revient de la prise de main vers le vrai compte admin — PAS de
// requireRole(["ADMIN"]) ici : pendant une prise de main, la session en
// cours est celle de la personne impersonnée (étudiant/khôlleur/référent),
// jamais admin. On lit donc le JWT brut directement (impersonatorId), pas
// la session NextAuth habituelle. getToken() exige un NextRequest (pas le
// Request générique), contrairement au reste des routes de l'appli.
export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET!, secureCookie: COOKIE_SECURISE });
  if (!token?.impersonatorId) {
    return NextResponse.json({ error: "Vous n'êtes pas en train de prendre la main sur un profil" }, { status: 409 });
  }

  // Relu depuis la base plutôt que repris du token d'origine (perdu de
  // toute façon, voir plus haut) : récupère l'état courant de l'admin
  // (nom/prénom/rôles) plutôt que des valeurs potentiellement périmées.
  const admin = await prisma.utilisateur.findUnique({ where: { id: token.impersonatorId } });
  if (!admin) {
    return NextResponse.json({ error: "Compte administrateur introuvable, reconnectez-vous" }, { status: 404 });
  }

  const { nom, valeur, options } = await creerCookieSession(admin);
  const reponse = NextResponse.json({ ok: true });
  reponse.cookies.set(nom, valeur, options);
  return reponse;
}
