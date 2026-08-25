import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DisciplinesForm } from "@/components/admin/DisciplinesForm";

export default async function DisciplinesPage() {
  await requirePageSession(["ADMIN"]);

  const disciplines = await prisma.discipline.findMany({
    include: { _count: { select: { classes: true, competences: true } } },
    orderBy: { nom: "asc" },
  });

  return (
    <main className="container">
      <h1>Disciplines</h1>
      <DisciplinesForm
        disciplinesInitiales={disciplines.map((d) => ({
          id: d.id,
          nom: d.nom,
          nbClasses: d._count.classes,
          nbKholleurs: d._count.competences,
        }))}
      />
    </main>
  );
}
