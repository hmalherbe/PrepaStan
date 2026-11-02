import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { creerCookieSession, pageDestination } from "@/lib/impersonation";
import { prisma } from "@/lib/prisma";

const ROLES_PRENABLES = ["KHOLLEUR", "PROFESSEUR_REFERENT", "ELEVE"] as const;

const bodySchema = z.object({
  email: z.string().email(),
  motDePasseAdmin: z.string().min(1),
  // Requis seulement si la personne cumule plusieurs des rôles ci-dessus
  // (ex. khôlleur ET référent) : lequel incarner, choisi par l'admin après
  // un premier appel sans ce champ (voir plus bas, "choixRequis").
  profil: z.enum(ROLES_PRENABLES).optional(),
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

  const { email, motDePasseAdmin, profil } = bodySchema.parse(await req.json());

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
  const rolesPrenables = cible.roles.filter((r): r is (typeof ROLES_PRENABLES)[number] =>
    ROLES_PRENABLES.includes(r as (typeof ROLES_PRENABLES)[number])
  );
  if (rolesPrenables.length === 0) {
    return NextResponse.json({ error: "Ce compte n'a aucun rôle khôlleur, référent ou étudiant" }, { status: 403 });
  }

  // Une même personne peut cumuler khôlleur ET référent (voire étudiant) sur
  // un seul compte — pas de choix pertinent côté connexion normale (elle
  // voit tout simplement les deux menus à la fois, voir NavBar.tsx), mais
  // une prise de main doit rester sans ambiguïté sur CE qu'elle montre à
  // l'admin : sans "profil" déjà choisi, on le lui demande plutôt que de
  // deviner (ancien comportement : priorité khôlleur > référent > étudiant,
  // source de confusion signalée). Le mot de passe est déjà vérifié à ce
  // stade, donc ce deuxième appel (avec profil) n'a pas besoin de le
  // revérifier une seconde fois côté UX, juste de le renvoyer.
  if (rolesPrenables.length > 1 && !profil) {
    return NextResponse.json({ choixRequis: true, roles: rolesPrenables });
  }
  const roleChoisi: Role = profil && rolesPrenables.includes(profil) ? profil : rolesPrenables[0];

  // Traçabilité minimale : qui a pris la main sur qui, et quand. Pas de
  // table d'audit dédiée pour l'instant (à ajouter si le besoin se
  // confirme) — au moins visible dans les logs du conteneur en production.
  console.log(
    `[impersonation] ${admin.email} prend la main sur ${cible.email} (profil ${roleChoisi}) à ${new Date().toISOString()}`
  );

  // La session créée ne porte QUE ce rôle (jamais tous ceux de "cible") :
  // c'est précisément ce qui évite l'ambiguïté — l'admin voit exactement le
  // menu d'un khôlleur pur, ou d'un référent pur, jamais les deux mélangés.
  const { nom, valeur, options } = await creerCookieSession({ ...cible, roles: [roleChoisi] }, admin.id);
  const reponse = NextResponse.json({ ok: true, redirect: pageDestination([roleChoisi]) });
  reponse.cookies.set(nom, valeur, options);
  return reponse;
}
