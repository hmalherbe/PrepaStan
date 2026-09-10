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
// une violation de contrainte de clé étrangère. RappelNotationEnvoye n'a
// pas de vraie contrainte de clé étrangère (juste un champ sessionKholleId
// texte) donc ne bloquerait rien, mais laisserait des lignes orphelines
// sans intérêt une fois leur session supprimée.
export async function DELETE() {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const { supprimes } = await prisma.$transaction(async (tx) => {
    await tx.validationReferent.deleteMany({});
    await tx.rappelNotationEnvoye.deleteMany({});
    // Cascade Prisma : Creneau (donc Passage puis Note) et ValidationGrille.
    const { count } = await tx.sessionKholle.deleteMany({});
    return { supprimes: count };
  });

  return NextResponse.json({ supprimes });
}
