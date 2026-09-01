import { NextResponse } from "next/server";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  valeur: z.number().min(0).max(20).nullable(),
  appreciation: z.string().nullable(),
});

// L'appréciation vient de l'éditeur riche du kholleur (voir
// AppreciationEditor.tsx, qui produit du HTML via document.execCommand) :
// on ne fait confiance qu'aux balises qu'il peut réellement produire, sans
// attribut, avant stockage — l'appréciation est ensuite affichée telle
// quelle (dangerouslySetInnerHTML) au référent et à l'élève.
const OPTIONS_SANITIZE_APPRECIATION: sanitizeHtml.IOptions = {
  allowedTags: ["b", "strong", "i", "em", "ul", "ol", "li", "br", "div", "p"],
  allowedAttributes: {},
};

// PUT /api/passages/:passageId/note
// Upsert de la note et de l'appréciation. Rejeté si la grille du kholleur
// pour cette session est déjà validée.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ passageId: string }> }
) {
  const auth = await requireRole(["KHOLLEUR"]);
  if (auth instanceof NextResponse) return auth;
  const kholleurId = auth.user.id;
  const { passageId } = await params;
  const body = bodySchema.parse(await req.json());

  const passage = await prisma.passage.findUniqueOrThrow({
    where: { id: passageId },
    include: { creneau: true },
  });

  if (passage.creneau.kholleurId !== kholleurId) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const validation = await prisma.validationGrille.findUnique({
    where: {
      kholleurId_sessionKholleId: {
        kholleurId,
        sessionKholleId: passage.creneau.sessionKholleId,
      },
    },
  });

  if (validation?.statut === "VALIDE") {
    return NextResponse.json(
      { error: "Grille déjà validée, modification impossible" },
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
