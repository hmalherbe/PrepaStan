import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PlanningReview } from "@/components/admin/PlanningReview";

export default async function PlanningReviewPage({
  params,
}: {
  params: Promise<{ classeId: string; semaine: string }>;
}) {
  await requirePageSession(["ADMIN"]);
  const { classeId, semaine: semaineParam } = await params;
  const semaine = Number(semaineParam);

  const classe = await prisma.classe.findUnique({ where: { id: classeId } });
  if (!classe) notFound();

  const sessions = await prisma.sessionKholle.findMany({
    where: { classeId, semaine },
    include: {
      discipline: true,
      creneaux: {
        include: {
          kholleur: true,
          salle: true,
          passages: { include: { eleve: true }, orderBy: { ordre: "asc" } },
        },
        orderBy: [{ date: "asc" }, { heureDebut: "asc" }],
      },
    },
  });

  const [kholleurs, salles] = await Promise.all([
    prisma.utilisateur.findMany({ where: { roles: { has: "KHOLLEUR" } }, orderBy: { nom: "asc" } }),
    prisma.salle.findMany({ orderBy: { nom: "asc" } }),
  ]);

  const estBrouillon = sessions.every((s) => s.statut === "PLANIFICATION");

  const creneaux = sessions.flatMap((s) =>
    s.creneaux.map((c) => ({
      id: c.id,
      discipline: s.discipline.nom,
      jour: c.date.toISOString().slice(0, 10),
      heureDebut: c.heureDebut,
      heureFin: c.heureFin,
      kholleurId: c.kholleurId,
      kholleurNom: `${c.kholleur.prenom} ${c.kholleur.nom}`,
      salleId: c.salleId,
      salleNom: c.salle.nom,
      eleves: c.passages.map((p) => `${p.eleve.prenom} ${p.eleve.nom}`),
    }))
  );

  return (
    <main className="container">
      <h1>
        {classe.nom} · Semaine {semaine}
      </h1>
      <PlanningReview
        classeId={classeId}
        semaine={semaine}
        creneauxInitiaux={creneaux}
        estBrouillon={estBrouillon}
        aucuneSession={sessions.length === 0}
        kholleurs={kholleurs.map((k) => ({ id: k.id, nom: `${k.prenom} ${k.nom}` }))}
        salles={salles.map((s) => ({ id: s.id, nom: s.nom }))}
      />
    </main>
  );
}
