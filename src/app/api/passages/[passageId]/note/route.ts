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
// AppreciationEditor.tsx, un éditeur Quill dont la barre d'outils propose
// gras/italique/souligné/barré/listes/effacer la mise en forme) : on ne
// fait confiance qu'aux balises qu'il peut réellement produire avant
// stockage — l'appréciation est ensuite affichée telle quelle
// (dangerouslySetInnerHTML, avec le CSS de Quill) au référent et à l'élève.
// data-list sur <li> et <span class="ql-ui"> : Quill représente aussi bien
// une liste à puces qu'une liste numérotée avec un <ol> (!) — même balise
// pour les deux — et distingue visuellement les deux uniquement via cet
// attribut plus ce span (son CSS y injecte la puce ou le numéro en ::before,
// voir quill.core.css). Les retirer transformerait silencieusement toute
// liste à puces en liste numérotée à l'affichage. Ni un attribut data-* ni
// une classe fixe ne peuvent exécuter de script, donc les autoriser ne
// réintroduit aucun risque XSS.
const OPTIONS_SANITIZE_APPRECIATION: sanitizeHtml.IOptions = {
  allowedTags: ["b", "strong", "i", "em", "u", "s", "ul", "ol", "li", "span", "br", "div", "p"],
  allowedAttributes: { li: ["data-list"], span: ["class"] },
  allowedClasses: { span: ["ql-ui"] },
};

// PUT /api/passages/:passageId/note
// Upsert de la note et de l'appréciation. Rejeté seulement une fois le
// référent a validé la session (SessionKholle.statut === CLOTUREE) : avant
// ça, le kholleur peut revenir sur sa grille autant de fois qu'il veut,
// même après avoir cliqué "Valider ma grille" (voir GrilleForm.tsx).
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
    include: { creneau: { include: { sessionKholle: { select: { statut: true } } } } },
  });

  if (passage.creneau.kholleurId !== kholleurId) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  if (passage.creneau.sessionKholle.statut === "CLOTUREE") {
    return NextResponse.json(
      { error: "Session déjà validée par le référent, modification impossible" },
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
