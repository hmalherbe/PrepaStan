import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DisciplinesForm } from "@/components/admin/DisciplinesForm";

export default async function DisciplinesPage() {
  await requirePageSession(["ADMIN"]);

  const [disciplines, classes] = await Promise.all([
    prisma.discipline.findMany({
      include: { classes: { select: { classeId: true } } },
      orderBy: { nom: "asc" },
    }),
    prisma.classe.findMany({ orderBy: { nom: "asc" } }),
  ]);

  return (
    <main className="container">
      <h1>Disciplines</h1>
      <DisciplinesForm
        disciplinesInitiales={disciplines.map((d) => ({
          id: d.id,
          nom: d.nom,
          estLangueVivante: d.estLangueVivante,
          classeIds: d.classes.map((cd) => cd.classeId),
        }))}
        classes={classes.map((c) => ({ id: c.id, nom: c.nom }))}
      />
    </main>
  );
}
