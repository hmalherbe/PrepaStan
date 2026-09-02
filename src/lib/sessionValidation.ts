import { prisma } from "@/lib/prisma";

// Nombre de kholleurs affectés à cette session dont la grille n'est pas
// encore validée. ValidationGrille n'existe qu'à partir du moment où un
// kholleur valide (jamais créée en EN_ATTENTE à l'avance) : on compare donc
// aux kholleurs réellement affectés via leurs créneaux, pas au nombre de
// lignes ValidationGrille existantes.
export async function compterGrillesNonValidees(sessionKholleId: string): Promise<number> {
  const kholleursAffectes = await prisma.creneau.findMany({
    where: { sessionKholleId },
    select: { kholleurId: true },
    distinct: ["kholleurId"],
  });
  const validationsFaites = await prisma.validationGrille.count({
    where: { sessionKholleId, kholleurId: { in: kholleursAffectes.map((k) => k.kholleurId) }, statut: "VALIDE" },
  });
  return kholleursAffectes.length - validationsFaites;
}
