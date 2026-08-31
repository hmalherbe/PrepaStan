import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const TYPES_AUTORISES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const TAILLE_MAX_OCTETS = 10 * 1024 * 1024; // 10 Mo

async function passageDuKholleur(passageId: string, kholleurId: string) {
  const passage = await prisma.passage.findUniqueOrThrow({
    where: { id: passageId },
    include: { creneau: true },
  });
  return passage.creneau.kholleurId === kholleurId ? passage : null;
}

async function grilleDejaValidee(kholleurId: string, sessionKholleId: string) {
  const validation = await prisma.validationGrille.findUnique({
    where: { kholleurId_sessionKholleId: { kholleurId, sessionKholleId } },
  });
  return validation?.statut === "VALIDE";
}

// POST /api/passages/:passageId/fichier
// Attache un fichier (PDF ou Word, 10 Mo max) à la note de cette khôlle —
// ex. copie annotée, grille de correction détaillée. Stocké directement en
// base (voir Note.fichierData) : pas de volume de fichiers séparé à gérer
// en production.
export async function POST(req: Request, { params }: { params: Promise<{ passageId: string }> }) {
  const auth = await requireRole(["KHOLLEUR"]);
  if (auth instanceof NextResponse) return auth;
  const kholleurId = auth.user.id;
  const { passageId } = await params;

  const passage = await passageDuKholleur(passageId, kholleurId);
  if (!passage) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  if (await grilleDejaValidee(kholleurId, passage.creneau.sessionKholleId)) {
    return NextResponse.json({ error: "Grille déjà validée, modification impossible" }, { status: 409 });
  }

  const formData = await req.formData();
  const fichier = formData.get("fichier");
  if (!(fichier instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }
  if (!TYPES_AUTORISES.has(fichier.type)) {
    return NextResponse.json({ error: "Seuls les fichiers PDF ou Word sont acceptés" }, { status: 400 });
  }
  if (fichier.size > TAILLE_MAX_OCTETS) {
    return NextResponse.json({ error: "Fichier trop volumineux (10 Mo maximum)" }, { status: 400 });
  }

  const donnees = Buffer.from(await fichier.arrayBuffer());

  await prisma.note.upsert({
    where: { passageId },
    update: { fichierNom: fichier.name, fichierType: fichier.type, fichierData: donnees },
    create: { passageId, fichierNom: fichier.name, fichierType: fichier.type, fichierData: donnees },
  });

  return NextResponse.json({ fichierNom: fichier.name });
}

// GET /api/passages/:passageId/fichier
// Téléchargement, accessible au kholleur propriétaire, à l'élève concerné
// (une fois la session validée par le référent, comme pour ses notes) et à
// l'admin.
export async function GET(req: Request, { params }: { params: Promise<{ passageId: string }> }) {
  const auth = await requireRole(["KHOLLEUR", "ELEVE", "ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { passageId } = await params;

  const passage = await prisma.passage.findUniqueOrThrow({
    where: { id: passageId },
    include: {
      creneau: true,
      eleve: { select: { utilisateurId: true } },
      note: { select: { fichierNom: true, fichierType: true, fichierData: true } },
    },
  });

  const estKholleurProprietaire =
    auth.user.roles.includes("KHOLLEUR") && passage.creneau.kholleurId === auth.user.id;
  const estAdmin = auth.user.roles.includes("ADMIN");
  let estEleveAutorise = false;
  if (auth.user.roles.includes("ELEVE") && passage.eleve.utilisateurId === auth.user.id) {
    const sessionKholle = await prisma.sessionKholle.findUnique({
      where: { id: passage.creneau.sessionKholleId },
      include: { validationReferent: true },
    });
    estEleveAutorise = sessionKholle?.validationReferent?.statut === "VALIDE";
  }

  if (!estKholleurProprietaire && !estAdmin && !estEleveAutorise) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  if (!passage.note?.fichierData) {
    return NextResponse.json({ error: "Aucun fichier attaché" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(passage.note.fichierData), {
    headers: {
      "Content-Type": passage.note.fichierType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(passage.note.fichierNom ?? "fichier")}`,
    },
  });
}

// DELETE /api/passages/:passageId/fichier
export async function DELETE(req: Request, { params }: { params: Promise<{ passageId: string }> }) {
  const auth = await requireRole(["KHOLLEUR"]);
  if (auth instanceof NextResponse) return auth;
  const kholleurId = auth.user.id;
  const { passageId } = await params;

  const passage = await passageDuKholleur(passageId, kholleurId);
  if (!passage) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  if (await grilleDejaValidee(kholleurId, passage.creneau.sessionKholleId)) {
    return NextResponse.json({ error: "Grille déjà validée, modification impossible" }, { status: 409 });
  }

  await prisma.note
    .update({ where: { passageId }, data: { fichierNom: null, fichierType: null, fichierData: null } })
    .catch(() => null); // pas de Note existante = rien à supprimer

  return NextResponse.json({ ok: true });
}
