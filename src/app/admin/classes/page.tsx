import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ClassesForm } from "@/components/admin/ClassesForm";

export default async function ClassesPage() {
  await requirePageSession(["ADMIN"]);

  const classes = await prisma.classe.findMany({
    include: { anneeScolaire: true, _count: { select: { eleves: true, disciplines: true } } },
    orderBy: [{ anneeScolaire: { libelle: "desc" } }, { nom: "asc" }],
  });

  return (
    <main className="container">
      <h1>Classes</h1>
      <ClassesForm
        classesInitiales={classes.map((c) => ({
          id: c.id,
          nom: c.nom,
          anneeScolaire: c.anneeScolaire.libelle,
          nbEleves: c._count.eleves,
          nbDisciplines: c._count.disciplines,
        }))}
      />
    </main>
  );
}
