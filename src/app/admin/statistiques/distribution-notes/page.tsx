import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DistributionNotesChart } from "@/components/admin/DistributionNotesChart";

export default async function DistributionNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ classeId?: string }>;
}) {
  await requirePageSession(["ADMIN"]);
  const { classeId: classeIdParam } = await searchParams;

  const classes = await prisma.classe.findMany({ orderBy: { nom: "asc" } });
  const classe = classeIdParam ? classes.find((c) => c.id === classeIdParam) : classes[0];

  if (!classe) {
    return (
      <main className="container">
        <h1>Distribution des notes</h1>
        <p>Aucune classe créée pour le moment.</p>
      </main>
    );
  }

  const [disciplines, passages] = await Promise.all([
    prisma.discipline.findMany({
      where: { classes: { some: { classeId: classe.id } } },
      orderBy: { nom: "asc" },
    }),
    prisma.passage.findMany({
      where: {
        eleve: { classeId: classe.id },
        note: { valeur: { not: null } },
      },
      select: {
        note: { select: { valeur: true } },
        creneau: {
          select: {
            kholleurId: true,
            kholleur: { select: { nom: true, prenom: true } },
            sessionKholle: {
              select: { disciplineId: true, discipline: { select: { nom: true } } },
            },
          },
        },
      },
    }),
  ]);

  const kholleursParId = new Map<string, { nom: string; prenom: string }>();
  for (const p of passages) {
    kholleursParId.set(p.creneau.kholleurId, p.creneau.kholleur);
  }
  const kholleurs = [...kholleursParId.entries()]
    .map(([id, k]) => ({ id, nom: `${k.prenom} ${k.nom}` }))
    .sort((a, b) => a.nom.localeCompare(b.nom));

  const notes = passages.map((p) => ({
    disciplineId: p.creneau.sessionKholle.disciplineId,
    disciplineNom: p.creneau.sessionKholle.discipline.nom,
    kholleurId: p.creneau.kholleurId,
    kholleurNom: `${p.creneau.kholleur.prenom} ${p.creneau.kholleur.nom}`,
    valeur: Number(p.note!.valeur),
  }));

  return (
    <main className="container">
      <h1>Distribution des notes</h1>
      <DistributionNotesChart
        classes={classes.map((c) => ({ id: c.id, nom: c.nom }))}
        classeIdActuelle={classe.id}
        disciplines={disciplines.map((d) => ({ id: d.id, nom: d.nom }))}
        kholleurs={kholleurs}
        notes={notes}
      />
    </main>
  );
}
