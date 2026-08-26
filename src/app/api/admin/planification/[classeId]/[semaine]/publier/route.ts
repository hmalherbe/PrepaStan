import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { envoyerEmailPublicationPlanning } from "@/lib/email";

// POST /api/admin/planification/:classeId/:semaine/publier
// Passe toutes les SessionKholle du brouillon en PLANIFIEE : les créneaux
// deviennent visibles pour les kholleurs concernés, qui reçoivent en plus un
// email récapitulatif de leurs créneaux pour la semaine.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ classeId: string; semaine: string }> }
) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { classeId, semaine } = await params;

  const sessionsAPublier = await prisma.sessionKholle.findMany({
    where: { classeId, semaine: Number(semaine), statut: "PLANIFICATION" },
    select: { id: true },
  });

  if (sessionsAPublier.length === 0) {
    return NextResponse.json({ sessionsPubliees: 0 });
  }

  const sessionIds = sessionsAPublier.map((s) => s.id);

  await prisma.sessionKholle.updateMany({
    where: { id: { in: sessionIds } },
    data: { statut: "PLANIFIEE" },
  });

  const creneaux = await prisma.creneau.findMany({
    where: { sessionKholleId: { in: sessionIds } },
    include: {
      kholleur: true,
      salle: true,
      sessionKholle: { include: { discipline: true, classe: true } },
      passages: { include: { eleve: true } },
    },
    orderBy: [{ date: "asc" }, { heureDebut: "asc" }],
  });

  const creneauxParKholleur = new Map<string, typeof creneaux>();
  for (const c of creneaux) {
    const liste = creneauxParKholleur.get(c.kholleurId) ?? [];
    liste.push(c);
    creneauxParKholleur.set(c.kholleurId, liste);
  }

  await Promise.allSettled(
    [...creneauxParKholleur.values()].map((creneauxKholleur) => {
      const kholleur = creneauxKholleur[0].kholleur;
      const classeNom = creneauxKholleur[0].sessionKholle.classe.nom;
      return envoyerEmailPublicationPlanning({
        destinataire: kholleur.email,
        nomKholleur: `${kholleur.prenom} ${kholleur.nom}`,
        classeNom,
        semaine: Number(semaine),
        creneaux: creneauxKholleur.map((c) => ({
          date: c.date,
          heureDebut: c.heureDebut,
          heureFin: c.heureFin,
          disciplineNom: c.sessionKholle.discipline.nom,
          salleNom: c.salle.nom,
          eleves: c.passages.map((p) => `${p.eleve.prenom} ${p.eleve.nom}`),
        })),
      });
    })
  );

  return NextResponse.json({ sessionsPubliees: sessionIds.length });
}
