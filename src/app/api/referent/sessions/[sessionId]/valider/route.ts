import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { envoyerEmailNoteDisponible } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { compterGrillesNonValidees } from "@/lib/sessionValidation";

// POST /api/referent/sessions/:sessionId/valider
// Valide la session entière : rejette si une seule grille de kholleur n'est
// pas encore validée. Une fois validé, les notes deviennent visibles aux
// élèves et la session passe CLOTUREE.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireRole(["PROFESSEUR_REFERENT"]);
  if (auth instanceof NextResponse) return auth;
  const professeurReferentId = auth.user.id;
  const { sessionId: sessionKholleId } = await params;

  const session = await prisma.sessionKholle.findUniqueOrThrow({
    where: { id: sessionKholleId },
    include: { classe: true, discipline: true },
  });
  const estReferent = await prisma.professeurReferent.findFirst({
    where: {
      classeId: session.classeId,
      disciplineId: session.disciplineId,
      utilisateurId: professeurReferentId,
    },
  });
  if (!estReferent) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const grillesNonValidees = await compterGrillesNonValidees(sessionKholleId);

  if (grillesNonValidees > 0) {
    return NextResponse.json(
      { error: `${grillesNonValidees} grille(s) de kholleur en attente` },
      { status: 409 }
    );
  }

  await prisma.$transaction([
    prisma.validationReferent.upsert({
      where: { sessionKholleId },
      update: { statut: "VALIDE", dateValidation: new Date(), professeurReferentId },
      create: {
        sessionKholleId,
        professeurReferentId,
        statut: "VALIDE",
        dateValidation: new Date(),
      },
    }),
    prisma.sessionKholle.update({
      where: { id: sessionKholleId },
      data: { statut: "CLOTUREE" },
    }),
  ]);

  const [eleves, parametres] = await Promise.all([
    prisma.eleve.findMany({
      where: {
        utilisateurId: { not: null },
        passages: { some: { creneau: { sessionKholleId } } },
      },
      include: { utilisateur: true },
    }),
    prisma.parametresApplication.findUnique({ where: { id: "singleton" } }),
  ]);

  if (parametres?.envoiEmailEleve === false) {
    return NextResponse.json({ ok: true });
  }

  await Promise.allSettled(
    eleves
      .filter((eleve): eleve is typeof eleve & { utilisateur: NonNullable<(typeof eleve)["utilisateur"]> } =>
        eleve.utilisateur !== null
      )
      .map((eleve) =>
        envoyerEmailNoteDisponible({
          destinataire: eleve.utilisateur.email,
          nomEleve: eleve.nom,
          prenomEleve: eleve.prenom,
          classeNom: session.classe.nom,
          disciplineNom: session.discipline.nom,
          semaine: session.semaine,
          corpsPersonnalise: parametres?.modeleEmailEleve,
        })
      )
  );

  return NextResponse.json({ ok: true });
}
