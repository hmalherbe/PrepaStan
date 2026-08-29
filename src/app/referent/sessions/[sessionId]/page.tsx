import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DetailSessionReferent } from "@/components/referent/DetailSessionReferent";

export default async function DetailSessionReferentPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = await requirePageSession(["PROFESSEUR_REFERENT"]);

  const sessionKholle = await prisma.sessionKholle.findUnique({
    where: { id: sessionId },
    include: {
      classe: true,
      discipline: true,
      validationReferent: true,
      creneaux: {
        include: {
          kholleur: true,
          salle: true,
          passages: { include: { eleve: true, note: true }, orderBy: { ordre: "asc" } },
        },
        orderBy: [{ date: "asc" }, { heureDebut: "asc" }],
      },
    },
  });
  if (!sessionKholle) notFound();

  const estReferent = await prisma.professeurReferent.findFirst({
    where: {
      classeId: sessionKholle.classeId,
      disciplineId: sessionKholle.disciplineId,
      utilisateurId: session.user.id,
    },
  });
  if (!estReferent) notFound();

  const kholleurIds = [...new Set(sessionKholle.creneaux.map((c) => c.kholleurId))];
  const validations = await prisma.validationGrille.findMany({
    where: { sessionKholleId: sessionKholle.id, kholleurId: { in: kholleurIds } },
  });
  const statutParKholleur = new Map(validations.map((v) => [v.kholleurId, v.statut]));

  const groupes = kholleurIds.map((kholleurId) => {
    const creneauxKholleur = sessionKholle.creneaux.filter((c) => c.kholleurId === kholleurId);
    const kholleur = creneauxKholleur[0].kholleur;
    return {
      kholleurId,
      nom: `${kholleur.prenom} ${kholleur.nom}`,
      statut: statutParKholleur.get(kholleurId) ?? "EN_ATTENTE",
      lignes: creneauxKholleur.flatMap((c) =>
        c.passages.map((p) => ({
          eleve: `${p.eleve.prenom} ${p.eleve.nom}`,
          jour: c.date.toISOString().slice(0, 10),
          heureDebut: c.heureDebut,
          heureFin: c.heureFin,
          valeur: p.note?.valeur ? Number(p.note.valeur) : null,
          appreciation: p.note?.appreciation ?? "",
        }))
      ),
    };
  });

  return (
    <main className="container">
      <h1>
        {sessionKholle.discipline.nom} · {sessionKholle.classe.nom} · Semaine {sessionKholle.semaine}
      </h1>
      <DetailSessionReferent
        sessionId={sessionKholle.id}
        groupes={groupes}
        valideInitial={sessionKholle.validationReferent?.statut === "VALIDE"}
      />
    </main>
  );
}
