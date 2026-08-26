import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GenererPlanningForm } from "@/components/admin/GenererPlanningForm";

export default async function PlanificationPage({
  searchParams,
}: {
  searchParams: Promise<{ classeId?: string; semaine?: string }>;
}) {
  await requirePageSession(["ADMIN"]);
  const { classeId: classeIdParam, semaine: semaineParam } = await searchParams;

  const classes = await prisma.classe.findMany({
    orderBy: { nom: "asc" },
    include: {
      eleves: { select: { id: true } },
      disciplines: {
        include: {
          discipline: {
            include: {
              competences: {
                include: { kholleur: { select: { id: true, nom: true, prenom: true } } },
              },
            },
          },
        },
      },
    },
  });

  const classesAvecDisciplines = classes.map((c) => ({
    id: c.id,
    nom: c.nom,
    effectif: c.eleves.length,
    disciplines: c.disciplines.map((cd) => ({
      id: cd.discipline.id,
      nom: cd.discipline.nom,
      kholleurs: cd.discipline.competences.map((comp) => ({
        id: comp.kholleur.id,
        nom: `${comp.kholleur.prenom} ${comp.kholleur.nom}`,
      })),
    })),
  }));

  return (
    <main className="container">
      <h1>Générer le planning</h1>
      <GenererPlanningForm
        classes={classesAvecDisciplines}
        classeIdInitiale={classeIdParam}
        semaineInitiale={semaineParam ? Number(semaineParam) : undefined}
      />
    </main>
  );
}
