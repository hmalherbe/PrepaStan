import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NotesEleveTable } from "@/components/eleve/NotesEleveTable";

export default async function NotesElevePage() {
  const session = await requirePageSession(["ELEVE"]);

  const eleve = await prisma.eleve.findUnique({ where: { utilisateurId: session.user.id } });
  if (!eleve) notFound();

  // Les khôlles déjà passées sont listées dès leur publication (pas
  // seulement une fois entièrement validées) pour que l'élève voie que sa
  // khôlle a bien eu lieu, avec un statut "En attente" tant que le
  // kholleur/référent n'a pas terminé — plutôt que de la faire disparaître
  // entièrement jusqu'à validation complète.
  const passages = await prisma.passage.findMany({
    where: {
      eleveId: eleve.id,
      creneau: {
        date: { lte: new Date() },
        sessionKholle: { statut: { not: "PLANIFICATION" } },
      },
    },
    include: {
      note: { select: { valeur: true, appreciation: true, fichierNom: true } },
      creneau: { include: { sessionKholle: { include: { discipline: true, validationReferent: true } } } },
    },
    orderBy: [{ creneau: { date: "desc" } }],
  });

  const lignes = passages.map((p) => ({
    passageId: p.id,
    semaine: p.creneau.sessionKholle.semaine,
    discipline: p.creneau.sessionKholle.discipline.nom,
    date: p.creneau.date.toISOString().slice(0, 10),
    valide: p.creneau.sessionKholle.validationReferent?.statut === "VALIDE",
    valeur: p.note?.valeur ? Number(p.note.valeur) : null,
    appreciation: p.note?.appreciation ?? "",
    fichierNom: p.note?.fichierNom ?? null,
  }));

  return (
    <main className="container">
      <h1>Mes notes</h1>
      <NotesEleveTable lignes={lignes} />
    </main>
  );
}
