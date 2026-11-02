import { NextResponse } from "next/server";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  valeur: z.number().min(0).max(20).nullable(),
  appreciation: z.string().nullable(),
});

// Mêmes règles que l'éditeur du kholleur (voir
// /api/passages/[passageId]/note/route.ts, dont ce fichier reprend aussi le
// commentaire sur pourquoi ces balises précises).
const OPTIONS_SANITIZE_APPRECIATION: sanitizeHtml.IOptions = {
  allowedTags: ["b", "strong", "i", "em", "u", "s", "ul", "ol", "li", "span", "br", "div", "p"],
  allowedAttributes: { li: ["data-list"], span: ["class"] },
  allowedClasses: { span: ["ql-ui"] },
};

// PUT /api/referent/passages/:passageId/note
// Permet au professeur référent de corriger lui-même note/appréciation
// avant d'avoir à attendre que TOUS les khôlleurs aient validé leur grille
// (contrairement à auparavant, où le référent ne pouvait que consulter en
// lecture seule) — utile par exemple pour une coquille repérée en
// relisant, sans avoir à redemander au khôlleur concerné. Réservé au
// référent EN TITRE de cette (classe, discipline) précise, jamais
// n'importe quel référent. Refusé une fois la session clôturée, comme pour
// le khôlleur.
export async function PUT(req: Request, { params }: { params: Promise<{ passageId: string }> }) {
  const auth = await requireRole(["PROFESSEUR_REFERENT"]);
  if (auth instanceof NextResponse) return auth;
  const { passageId } = await params;
  const body = bodySchema.parse(await req.json());

  const passage = await prisma.passage.findUniqueOrThrow({
    where: { id: passageId },
    include: { creneau: { include: { sessionKholle: { select: { classeId: true, disciplineId: true, statut: true } } } } },
  });

  const estReferent = await prisma.professeurReferent.findFirst({
    where: {
      classeId: passage.creneau.sessionKholle.classeId,
      disciplineId: passage.creneau.sessionKholle.disciplineId,
      utilisateurId: auth.user.id,
    },
  });
  if (!estReferent) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  if (passage.creneau.sessionKholle.statut === "CLOTUREE") {
    return NextResponse.json(
      { error: "Session déjà validée, modification impossible" },
      { status: 409 }
    );
  }

  const appreciation = body.appreciation
    ? sanitizeHtml(body.appreciation, OPTIONS_SANITIZE_APPRECIATION)
    : body.appreciation;

  const note = await prisma.note.upsert({
    where: { passageId },
    update: { ...body, appreciation, dateSaisie: new Date() },
    create: { passageId, ...body, appreciation, dateSaisie: new Date() },
  });

  return NextResponse.json(note);
}
