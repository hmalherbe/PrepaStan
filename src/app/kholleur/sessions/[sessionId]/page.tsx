import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GrilleForm } from "@/components/kholleur/GrilleForm";

export default async function GrilleKholleurPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = await requirePageSession(["KHOLLEUR"]);
  const kholleurId = session.user.id;

  const sessionKholle = await prisma.sessionKholle.findUnique({
    where: { id: sessionId },
    include: { classe: true, discipline: true },
  });
  if (!sessionKholle) notFound();

  const creneaux = await prisma.creneau.findMany({
    where: { sessionKholleId: sessionId, kholleurId },
    include: {
      salle: true,
      passages: {
        include: { eleve: true, note: { select: { valeur: true, appreciation: true, fichierNom: true } } },
        orderBy: { ordre: "asc" },
      },
    },
    orderBy: [{ date: "asc" }, { heureDebut: "asc" }],
  });

  const validation = await prisma.validationGrille.findUnique({
    where: { kholleurId_sessionKholleId: { kholleurId, sessionKholleId: sessionId } },
  });

  const lignes = creneaux.flatMap((c) =>
    c.passages.map((p) => ({
      passageId: p.id,
      eleve: `${p.eleve.prenom} ${p.eleve.nom}`,
      jour: c.date.toISOString().slice(0, 10),
      heureDebut: c.heureDebut,
      heureFin: c.heureFin,
      salle: c.salle.nom,
      valeur: p.note?.valeur ? Number(p.note.valeur) : null,
      appreciation: p.note?.appreciation ?? "",
      fichierNom: p.note?.fichierNom ?? null,
    }))
  );

  return (
    <main className="container">
      <h1>
        {sessionKholle.discipline.nom} · {sessionKholle.classe.nom} · Semaine {sessionKholle.semaine}
      </h1>
      <GrilleForm
        sessionId={sessionId}
        lignesInitiales={lignes}
        valideInitial={validation?.statut === "VALIDE"}
        dateValidation={validation?.dateValidation?.toISOString() ?? null}
        gelee={sessionKholle.statut === "CLOTUREE"}
      />
    </main>
  );
}
