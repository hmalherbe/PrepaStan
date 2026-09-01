import { NextResponse } from "next/server";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  valeur: z.number().min(0).max(20).nullable(),
  // Large pour laisser passer plusieurs images (voir TAILLE_MAX_IMG_SRC
  // ci-dessous, appliquée par image individuellement), mais borné : refuse
  // net un envoi anormalement volumineux plutôt que de laisser grossir la
  // base sans limite.
  appreciation: z.string().max(10_000_000).nullable(),
});

// L'appréciation vient de l'éditeur riche du kholleur (voir
// AppreciationEditor.tsx, un éditeur Quill dont la barre d'outils propose
// gras/italique/souligné/barré/listes/effacer la mise en forme/image) : on
// ne fait confiance qu'aux balises qu'il peut réellement produire avant
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
const REGEX_IMG_SRC_SUR = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/]+=*$/;
// ~1,5 Mo décodés : l'éditeur compresse déjà chaque image côté client (voir
// comprimerImage dans AppreciationEditor.tsx), cette limite ne sert qu'à
// rejeter un envoi qui contournerait l'interface pour poster une image
// directement à l'API.
const TAILLE_MAX_IMG_SRC = 2_000_000;

const OPTIONS_SANITIZE_APPRECIATION: sanitizeHtml.IOptions = {
  allowedTags: ["b", "strong", "i", "em", "u", "s", "ul", "ol", "li", "span", "img", "br", "div", "p"],
  allowedAttributes: { li: ["data-list"], span: ["class"], img: ["src"] },
  allowedClasses: { span: ["ql-ui"] },
  // src="data:image/...;base64,..." uniquement : pas d'URL externe (pas de
  // hotlink/pixel de tracking), pas de data:image/svg+xml (une image SVG
  // peut embarquer du script, même si <img> ne l'exécute pas dans les
  // navigateurs actuels — autant rester sur des formats matriciels sûrs).
  allowedSchemesByTag: { img: ["data"] },
  exclusiveFilter: (frame) => {
    if (frame.tag !== "img") return false;
    const src = frame.attribs.src ?? "";
    return !REGEX_IMG_SRC_SUR.test(src) || src.length > TAILLE_MAX_IMG_SRC;
  },
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
