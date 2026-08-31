import { requirePageSession } from "@/lib/auth";
import { dureesParDefaut } from "@/lib/parametresDiscipline";
import { prisma } from "@/lib/prisma";
import { ParametresDisciplineForm } from "@/components/admin/ParametresDisciplineForm";
import { ParametresGenerauxForm } from "@/components/admin/ParametresGenerauxForm";

export default async function ParametresPage({
  searchParams,
}: {
  searchParams: Promise<{ classeId?: string }>;
}) {
  await requirePageSession(["ADMIN"]);
  const { classeId: classeIdParam } = await searchParams;

  const [classes, parametresGeneraux] = await Promise.all([
    prisma.classe.findMany({ orderBy: { nom: "asc" } }),
    prisma.parametresApplication.findUnique({ where: { id: "singleton" } }),
  ]);
  const classe = classeIdParam ? classes.find((c) => c.id === classeIdParam) : classes[0];
  const delaiInitial = parametresGeneraux?.delaiEnvoiMailsNotationJours ?? 0;

  if (!classe) {
    return (
      <main className="container">
        <h1>Paramètres</h1>
        <ParametresGenerauxForm delaiInitial={delaiInitial} />
        <p>Aucune classe créée pour le moment.</p>
      </main>
    );
  }

  const [classeDisciplines, parametres] = await Promise.all([
    prisma.classeDiscipline.findMany({
      where: { classeId: classe.id },
      include: { discipline: true },
      orderBy: { discipline: { nom: "asc" } },
    }),
    prisma.parametreDiscipline.findMany({ where: { classeId: classe.id } }),
  ]);
  const parametreParDiscipline = new Map(parametres.map((p) => [p.disciplineId, p]));

  const lignes = classeDisciplines.map((cd) => {
    const existant = parametreParDiscipline.get(cd.disciplineId);
    const defaut = dureesParDefaut(cd.discipline.estLangueVivante);
    return {
      disciplineId: cd.disciplineId,
      disciplineNom: cd.discipline.nom,
      dureePreparationMinutes: existant?.dureePreparationMinutes ?? defaut.dureePreparationMinutes,
      dureeKholleMinutes: existant?.dureeKholleMinutes ?? defaut.dureeKholleMinutes,
    };
  });

  return (
    <main className="container">
      <h1>Paramètres</h1>
      <ParametresGenerauxForm delaiInitial={delaiInitial} />
      <h2>Durées par discipline</h2>
      <p>Durée de préparation et durée de khôlle, par discipline, pour la classe sélectionnée.</p>
      <ParametresDisciplineForm
        classes={classes.map((c) => ({ id: c.id, nom: c.nom }))}
        classeId={classe.id}
        lignesInitiales={lignes}
      />
    </main>
  );
}
