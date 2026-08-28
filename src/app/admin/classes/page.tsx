import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ClassesForm } from "@/components/admin/ClassesForm";

export default async function ClassesPage() {
  await requirePageSession(["ADMIN"]);

  const [classes, anneesScolaires] = await Promise.all([
    prisma.classe.findMany({
      include: { anneeScolaire: true, _count: { select: { eleves: true, disciplines: true } } },
      orderBy: [{ anneeScolaire: { libelle: "desc" } }, { nom: "asc" }],
    }),
    prisma.anneeScolaire.findMany({ orderBy: { libelle: "desc" } }),
  ]);

  return (
    <main className="container">
      <h1>Classes</h1>
      <ClassesForm
        classesInitiales={classes.map((c) => ({
          id: c.id,
          nom: c.nom,
          anneeScolaireId: c.anneeScolaireId,
          anneeScolaire: c.anneeScolaire.libelle,
          nbEleves: c._count.eleves,
          nbDisciplines: c._count.disciplines,
        }))}
        anneesScolairesInitiales={anneesScolaires.map((a) => ({ id: a.id, libelle: a.libelle }))}
      />
    </main>
  );
}
