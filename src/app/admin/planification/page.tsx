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

  const [classes, disciplines] = await Promise.all([
    prisma.classe.findMany({ orderBy: { nom: "asc" } }),
    prisma.discipline.findMany({
      include: { competences: { include: { kholleur: { include: { disponibilites: true } } } } },
      orderBy: { nom: "asc" },
    }),
  ]);

  const disciplinesAvecPrerequis = disciplines.map((d) => {
    const kholleurIds = [...new Set(d.competences.map((c) => c.kholleurId))];
    const kholleursAvecDispo = kholleurIds.filter((id) =>
      d.competences.some((c) => c.kholleurId === id && c.kholleur.disponibilites.length > 0)
    ).length;
    return { id: d.id, nom: d.nom, kholleursTotal: kholleurIds.length, kholleursAvecDispo };
  });

  return (
    <main className="container">
      <h1>Générer le planning</h1>
      <GenererPlanningForm
        classes={classes.map((c) => ({ id: c.id, nom: c.nom }))}
        disciplines={disciplinesAvecPrerequis}
        classeIdInitiale={classeIdParam}
        semaineInitiale={semaineParam ? Number(semaineParam) : undefined}
      />
    </main>
  );
}
