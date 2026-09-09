import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DetailClasse } from "@/components/admin/DetailClasse";

export default async function DetailClassePage({
  params,
}: {
  params: Promise<{ classeId: string }>;
}) {
  await requirePageSession(["ADMIN"]);
  const { classeId } = await params;

  const classe = await prisma.classe.findUnique({
    where: { id: classeId },
    include: {
      anneeScolaire: true,
      eleves: { include: { utilisateur: { select: { email: true } } }, orderBy: [{ nom: "asc" }] },
      disciplines: { include: { discipline: true }, orderBy: { discipline: { nom: "asc" } } },
    },
  });
  if (!classe) notFound();

  const toutesDisciplines = await prisma.discipline.findMany({ orderBy: { nom: "asc" } });

  // Nombre d'élèves concernés par chaque discipline : l'effectif entier de
  // la classe pour une matière normale, mais seulement le sous-groupe ayant
  // cette langue en LV1 ou LV2 pour une langue vivante — voir aussi
  // GenererPlanningForm, qui a besoin de la même distinction pour valider
  // les quotas de planification.
  const nbElevesParDiscipline = Object.fromEntries(
    toutesDisciplines.map((d) => [
      d.id,
      d.estLangueVivante
        ? classe.eleves.filter((e) => e.lv1Id === d.id || e.lv2Id === d.id).length
        : classe.eleves.length,
    ])
  );

  return (
    <main className="container">
      <h1>
        {classe.nom} · {classe.anneeScolaire.libelle}
      </h1>
      <DetailClasse
        classeId={classe.id}
        elevesInitiaux={classe.eleves.map((e) => ({
          id: e.id,
          nom: e.nom,
          prenom: e.prenom,
          aUnCompte: e.utilisateurId !== null,
          email: e.utilisateur?.email ?? null,
        }))}
        disciplinesAssigneesInitiales={classe.disciplines.map((cd) => ({
          id: cd.discipline.id,
          nom: cd.discipline.nom,
        }))}
        toutesDisciplines={toutesDisciplines.map((d) => ({ id: d.id, nom: d.nom }))}
        nbElevesParDiscipline={nbElevesParDiscipline}
      />
    </main>
  );
}
