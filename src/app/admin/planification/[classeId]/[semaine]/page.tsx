import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PlanningReview } from "@/components/admin/PlanningReview";

export default async function PlanningReviewPage({
  params,
}: {
  params: Promise<{ classeId: string; semaine: string }>;
}) {
  await requirePageSession(["ADMIN"]);
  const { classeId, semaine: semaineParam } = await params;
  const semaine = Number(semaineParam);

  const classe = await prisma.classe.findUnique({ where: { id: classeId } });
  if (!classe) notFound();

  const sessions = await prisma.sessionKholle.findMany({
    where: { classeId, semaine },
    include: {
      discipline: true,
      creneaux: {
        include: {
          kholleur: true,
          salle: true,
          passages: { include: { eleve: true }, orderBy: { ordre: "asc" } },
        },
        orderBy: [{ date: "asc" }, { heureDebut: "asc" }],
      },
    },
  });

  const disciplineIds = [...new Set(sessions.map((s) => s.disciplineId))];

  const [kholleurs, salles, dispenses] = await Promise.all([
    prisma.utilisateur.findMany({ where: { roles: { has: "KHOLLEUR" } }, orderBy: { nom: "asc" } }),
    prisma.salle.findMany({ orderBy: { nom: "asc" } }),
    // Élèves dispensés d'une des disciplines de cette semaine (voir
    // EleveDispense dans schema.prisma) : n'apparaissent dans aucun
    // créneau (exclus par le solveur, voir solver.py), donc affichés à
    // part pour que leur absence ne ressemble pas à un oubli.
    disciplineIds.length > 0
      ? prisma.eleveDispense.findMany({
          where: { disciplineId: { in: disciplineIds }, eleve: { classeId } },
          include: { eleve: { select: { nom: true, prenom: true } }, discipline: { select: { nom: true } } },
          orderBy: [{ discipline: { nom: "asc" } }, { eleve: { nom: "asc" } }],
        })
      : Promise.resolve([]),
  ]);

  const dispensesParDiscipline = new Map<string, string[]>();
  for (const d of dispenses) {
    const liste = dispensesParDiscipline.get(d.discipline.nom) ?? [];
    liste.push(`${d.eleve.prenom} ${d.eleve.nom}`);
    dispensesParDiscipline.set(d.discipline.nom, liste);
  }

  const estBrouillon = sessions.every((s) => s.statut === "PLANIFICATION");

  const creneaux = sessions
    .flatMap((s) =>
      s.creneaux.map((c) => ({
        id: c.id,
        discipline: s.discipline.nom,
        jour: c.date.toISOString().slice(0, 10),
        heureDebutPreparation: c.heureDebutPreparation,
        heureDebut: c.heureDebut,
        heureFin: c.heureFin,
        kholleurId: c.kholleurId,
        kholleurNom: `${c.kholleur.prenom} ${c.kholleur.nom}`,
        salleId: c.salleId,
        salleNom: c.salle.nom,
        eleves: c.passages.map((p) => `${p.eleve.prenom} ${p.eleve.nom}`),
        sessionCloturee: s.statut === "CLOTUREE",
      }))
    )
    // Toutes les sessions (une par discipline) sont fusionnées ici : sans ce
    // tri, les disciplines s'entremêlent au sein d'une même journée (ex.
    // Droit, Économie, Droit, Économie) au gré du nom des kholleurs. Tri
    // par jour, puis discipline (pour regrouper Droit/Droit/Économie/
    // Économie), puis kholleur, puis heure de khôlle, tous croissants.
    .sort(
      (a, b) =>
        a.jour.localeCompare(b.jour) ||
        a.discipline.localeCompare(b.discipline) ||
        a.kholleurNom.localeCompare(b.kholleurNom) ||
        a.heureDebut.localeCompare(b.heureDebut)
    );

  return (
    <main className="container">
      {/* Masqué à l'impression (voir PlanningReview.tsx) : ce titre partagerait
          sinon le budget vertical de la 1re page avec le premier jour imprimé
          — repris à l'identique dans le titre de chaque jour, pour que tous
          les jours (y compris le premier) disposent d'une page pleine. */}
      <h1 className="no-print">
        {classe.nom} · Semaine {semaine}
      </h1>
      <PlanningReview
        classeId={classeId}
        classeNom={classe.nom}
        semaine={semaine}
        dateDebutSemaine={sessions[0]?.dateDebut.toISOString().slice(0, 10) ?? ""}
        creneauxInitiaux={creneaux}
        estBrouillon={estBrouillon}
        aucuneSession={sessions.length === 0}
        dispensesParDiscipline={[...dispensesParDiscipline.entries()].map(([discipline, eleves]) => ({
          discipline,
          eleves,
        }))}
        kholleurs={kholleurs.map((k) => ({ id: k.id, nom: `${k.prenom} ${k.nom}` }))}
        salles={salles.map((s) => ({ id: s.id, nom: s.nom }))}
      />
    </main>
  );
}
