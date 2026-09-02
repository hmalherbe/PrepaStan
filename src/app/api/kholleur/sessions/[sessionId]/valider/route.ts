import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { envoyerEmailGrillesValidees } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { compterGrillesNonValidees } from "@/lib/sessionValidation";

// POST /api/kholleur/sessions/:sessionId/valider
// Valide la grille du kholleur connecté pour cette session : rejette si une
// note OU une appréciation manque (les deux sont obligatoires), sinon
// verrouille la saisie et vérifie si tous les kholleurs de la session ont
// désormais validé (pour notifier le référent).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireRole(["KHOLLEUR"]);
  if (auth instanceof NextResponse) return auth;
  const kholleurId = auth.user.id;
  const { sessionId: sessionKholleId } = await params;

  const sessionKholle = await prisma.sessionKholle.findUniqueOrThrow({
    where: { id: sessionKholleId },
    include: { classe: true, discipline: true },
  });
  if (sessionKholle.statut === "CLOTUREE") {
    return NextResponse.json(
      { error: "Session déjà validée par le référent" },
      { status: 409 }
    );
  }

  const passagesIncomplets = await prisma.passage.count({
    where: {
      creneau: { sessionKholleId, kholleurId },
      OR: [{ note: { is: null } }, { note: { valeur: null } }, { note: { appreciation: null } }, { note: { appreciation: "" } }],
    },
  });

  if (passagesIncomplets > 0) {
    return NextResponse.json(
      { error: `${passagesIncomplets} note(s) et/ou appréciation(s) manquante(s)` },
      { status: 400 }
    );
  }

  const validationExistante = await prisma.validationGrille.findUnique({
    where: { kholleurId_sessionKholleId: { kholleurId, sessionKholleId } },
  });

  await prisma.validationGrille.upsert({
    where: { kholleurId_sessionKholleId: { kholleurId, sessionKholleId } },
    update: { statut: "VALIDE", dateValidation: new Date() },
    create: { kholleurId, sessionKholleId, statut: "VALIDE", dateValidation: new Date() },
  });

  // Si cette validation vient de compléter la dernière grille manquante,
  // notifier le(s) professeur(s) référent(s) de cette (classe, discipline).
  // Rien à faire si la grille était déjà validée avant cet appel (idempotent).
  if (validationExistante?.statut !== "VALIDE") {
    const grillesNonValidees = await compterGrillesNonValidees(sessionKholleId);
    if (grillesNonValidees === 0) {
      const [referents, parametres] = await Promise.all([
        prisma.professeurReferent.findMany({
          where: { classeId: sessionKholle.classeId, disciplineId: sessionKholle.disciplineId },
          include: { utilisateur: true },
        }),
        prisma.parametresApplication.findUnique({ where: { id: "singleton" } }),
      ]);

      await Promise.allSettled(
        referents.map((referent) =>
          envoyerEmailGrillesValidees({
            destinataire: referent.utilisateur.email,
            nomReferent: referent.utilisateur.nom,
            prenomReferent: referent.utilisateur.prenom,
            classeNom: sessionKholle.classe.nom,
            disciplineNom: sessionKholle.discipline.nom,
            semaine: sessionKholle.semaine,
            corpsPersonnalise: parametres?.modeleEmailReferent,
          })
        )
      );
    }
  }

  return NextResponse.json({ ok: true });
}
