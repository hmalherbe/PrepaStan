import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE /api/admin/planification/historique
// Supprime TOUS les plannings (toutes classes, toutes semaines confondues) :
// sessions, créneaux, passages, notes et validations. Utilisé depuis
// l'écran "Historique des plannings" pour repartir d'une base propre — ex.
// après avoir importé un jeu de données de démonstration/test.
//
// ValidationReferent n'a pas onDelete: Cascade depuis SessionKholle (voir
// prisma/schema.prisma) : supprimée explicitement en premier pour éviter
// une violation de contrainte de clé étrangère. RappelJourMemeEnvoye n'a
// rien à voir avec SessionKholle (clé (kholleurId, date), voir
// schema.prisma) : rien n'y devient orphelin quand des sessions sont
// supprimées, pas besoin de la nettoyer ici. RappelValidationReferentEnvoye,
// en revanche, référence bien sessionKholleId sans contrainte de clé
// étrangère — laissé tel quel (comportement déjà existant avant ce
// changement, hors périmètre ici).
export async function DELETE() {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const { supprimes } = await prisma.$transaction(async (tx) => {
    await tx.validationReferent.deleteMany({});
    // Cascade Prisma : Creneau (donc Passage puis Note) et ValidationGrille.
    const { count } = await tx.sessionKholle.deleteMany({});
    return { supprimes: count };
  });

  return NextResponse.json({ supprimes });
}
