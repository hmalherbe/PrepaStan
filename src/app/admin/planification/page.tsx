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

  const [classes, salles, chargeParKholleur] = await Promise.all([
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
    // Nombre de créneaux déjà publiés par kholleur (tous temps confondus) :
    // sert uniquement à trier les listes déroulantes de kholleurs ci-dessous
    // (les moins sollicités en premier), pour inciter naturellement l'admin
    // à mieux répartir la charge — le solveur, lui, ne choisit jamais le
    // kholleur d'un quota (fixé par l'admin), voir solver.py.
    prisma.creneau.groupBy({
      by: ["kholleurId"],
      where: { sessionKholle: { statut: { not: "PLANIFICATION" } } },
      _count: { id: true },
    }),
  ]);
  const chargeParKholleurId = new Map(chargeParKholleur.map((c) => [c.kholleurId, c._count.id]));

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
        kholleurs: cd.discipline.competences
          .map((comp) => ({
            id: comp.kholleur.id,
            nom: `${comp.kholleur.prenom} ${comp.kholleur.nom}`,
            charge: chargeParKholleurId.get(comp.kholleur.id) ?? 0,
          }))
          .sort((a, b) => a.charge - b.charge || a.nom.localeCompare(b.nom))
          .map(({ id, nom }) => ({ id, nom })),
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
