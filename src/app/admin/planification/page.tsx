import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GenererPlanningForm } from "@/components/admin/GenererPlanningForm";

export default async function PlanificationPage({
  searchParams,
}: {
  searchParams: Promise<{ classeId?: string; date?: string }>;
}) {
  await requirePageSession(["ADMIN"]);
  const { classeId: classeIdParam, date: dateParam } = await searchParams;

  const [classes, salles] = await Promise.all([
    prisma.classe.findMany({
      orderBy: { nom: "asc" },
      include: {
        eleves: { select: { id: true } },
        referents: true,
        disciplines: {
          include: {
            discipline: {
              include: {
                competences: {
                  include: { kholleur: { select: { id: true, nom: true, prenom: true } } },
                },
                referents: {
                  include: { utilisateur: { select: { id: true, nom: true, prenom: true } } },
                },
              },
            },
          },
        },
      },
    }),
    prisma.salle.findMany({ orderBy: { nom: "asc" } }),
  ]);

  const classesAvecDisciplines = classes.map((c) => ({
    id: c.id,
    nom: c.nom,
    effectif: c.eleves.length,
    disciplines: c.disciplines.map((cd) => {
      const referentsUniques = new Map(
        cd.discipline.referents.map((r) => [
          r.utilisateur.id,
          { id: r.utilisateur.id, nom: `${r.utilisateur.prenom} ${r.utilisateur.nom}` },
        ])
      );
      const referentActuel = c.referents.find((r) => r.disciplineId === cd.disciplineId);
      return {
        id: cd.discipline.id,
        nom: cd.discipline.nom,
        kholleurs: cd.discipline.competences.map((comp) => ({
          id: comp.kholleur.id,
          nom: `${comp.kholleur.prenom} ${comp.kholleur.nom}`,
        })),
        referents: [...referentsUniques.values()],
        referentActuelId: referentActuel?.utilisateurId ?? null,
      };
    }),
  }));

  return (
    <main className="container">
      <h1>Générer le planning</h1>
      <GenererPlanningForm
        classes={classesAvecDisciplines}
        salles={salles.map((s) => ({ id: s.id, nom: s.nom }))}
        classeIdInitiale={classeIdParam}
        dateDebutSemaineInitiale={dateParam}
      />
    </main>
  );
}
