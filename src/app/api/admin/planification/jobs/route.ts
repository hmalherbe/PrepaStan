import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  classeId: z.string(),
  semaine: z.number().int(),
  disciplineIds: z.array(z.string()).min(1),
  // Date du lundi de la semaine à planifier ("YYYY-MM-DD"). Sert à
  // transformer les disponibilités récurrentes (par jour de semaine) en
  // créneaux concrets pour cette semaine précise.
  dateDebutSemaine: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Au-delà de cette heure, un créneau est considéré "tardif" pour
// l'équilibrage des horaires de passage (voir calculerHistorique ci-dessous).
const SEUIL_TARDIF = "17:00";

// POST /api/admin/planification/jobs
// Crée un job de planification et déclenche le microservice OR-Tools ; le
// calcul lui-même tourne en tâche de fond côté Python (le microservice
// répond 202 immédiatement), mais on ATTEND cet accusé de réception avant
// de répondre au navigateur. Un appel "fire-and-forget" (fetch non attendu)
// peut être interrompu par Next.js dès que cette route répond, avant même
// que la requête n'ait été envoyée sur le réseau — c'est exactement ce qui
// provoquait des jobs bloqués indéfiniment en EN_COURS, le microservice ne
// recevant jamais rien. Le microservice rappelle ensuite
// /api/internal/planification/callback à la fin du calcul.
export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const lanceParId = auth.user.id;
  const { classeId, semaine, disciplineIds, dateDebutSemaine } = bodySchema.parse(await req.json());

  const job = await prisma.planificationJob.create({
    data: { classeId, semaine, disciplines: disciplineIds, lanceParId },
  });

  const [eleves, dispoBrutes, competences, salles] = await Promise.all([
    prisma.eleve.findMany({ where: { classeId } }),
    prisma.disponibilite.findMany({
      where: { kholleur: { competences: { some: { disciplineId: { in: disciplineIds } } } } },
    }),
    prisma.competence.findMany({ where: { disciplineId: { in: disciplineIds } } }),
    prisma.salle.findMany(),
  ]);

  const disponibilites = expanserDisponibilites(dispoBrutes, dateDebutSemaine);

  const historique = await calculerHistorique(
    eleves.map((e) => e.id),
    competences.map((c) => c.kholleurId),
    disciplineIds
  );

  const solverUrl = process.env.PLANNING_SOLVER_URL;
  if (!solverUrl) {
    return NextResponse.json({ error: "PLANNING_SOLVER_URL non configuré" }, { status: 500 });
  }

  try {
    const solveRes = await fetch(`${solverUrl}/solve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: job.id,
        classeId,
        semaine,
        dateDebutSemaine,
        eleves,
        disponibilites,
        competences,
        salles,
        historique,
        callbackUrl: `${process.env.NEXTAUTH_URL}/api/internal/planification/callback`,
        callbackSecret: process.env.PLANNING_CALLBACK_SECRET,
      }),
      // Le endpoint /solve répond quasi instantanément (il ne fait que
      // planifier une tâche de fond) : un délai court suffit largement et
      // transforme un éventuel blocage réseau silencieux (ex. résolution
      // "localhost" capricieuse sous Windows) en erreur claire plutôt qu'un
      // job qui reste EN_COURS indéfiniment sans aucun message.
      signal: AbortSignal.timeout(10_000),
    });
    if (!solveRes.ok) {
      throw new Error(`Le microservice a répondu ${solveRes.status}`);
    }
  } catch (err) {
    await prisma.planificationJob.update({
      where: { id: job.id },
      data: { statut: "ECHEC", message: String(err), dateFin: new Date() },
    });
    return NextResponse.json(
      { error: `Impossible de joindre le microservice de planification : ${String(err)}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ jobId: job.id }, { status: 202 });
}

type DisponibiliteBrute = {
  kholleurId: string;
  jourSemaine: number | null;
  date: Date | null;
  heureDebut: string;
  heureFin: string;
};

// Transforme les disponibilités récurrentes (jourSemaine 1=lundi..7=dimanche)
// en dates concrètes pour la semaine ciblée, et convertit les disponibilités
// ponctuelles en la même forme attendue par le solveur (date "YYYY-MM-DD").
// Une disponibilité ponctuelle hors de la semaine ciblée est ignorée.
function expanserDisponibilites(brutes: DisponibiliteBrute[], dateDebutSemaine: string) {
  const lundi = new Date(`${dateDebutSemaine}T00:00:00.000Z`);
  const dimanche = new Date(lundi);
  dimanche.setUTCDate(dimanche.getUTCDate() + 7);

  const resultat: { kholleurId: string; date: string; heureDebut: string; heureFin: string }[] = [];

  for (const d of brutes) {
    if (d.jourSemaine) {
      const jour = new Date(lundi);
      jour.setUTCDate(jour.getUTCDate() + (d.jourSemaine - 1));
      resultat.push({
        kholleurId: d.kholleurId,
        date: jour.toISOString().slice(0, 10),
        heureDebut: d.heureDebut,
        heureFin: d.heureFin,
      });
    } else if (d.date && d.date >= lundi && d.date < dimanche) {
      resultat.push({
        kholleurId: d.kholleurId,
        date: d.date.toISOString().slice(0, 10),
        heureDebut: d.heureDebut,
        heureFin: d.heureFin,
      });
    }
  }

  return resultat;
}

// Agrège l'historique des khôlles déjà publiées (PLANIFIEE ou CLOTUREE, donc
// hors brouillon en cours) pour nourrir les objectifs "soft" du solveur :
// diversité des kholleurs par élève, équilibrage des horaires de passage,
// équirépartition de la charge des kholleurs sur la durée.
async function calculerHistorique(eleveIds: string[], kholleurIds: string[], disciplineIds: string[]) {
  const passagesHistoriques = await prisma.passage.findMany({
    where: {
      eleveId: { in: eleveIds },
      creneau: {
        sessionKholle: { disciplineId: { in: disciplineIds }, statut: { not: "PLANIFICATION" } },
      },
    },
    select: {
      eleveId: true,
      creneau: { select: { kholleurId: true, heureDebut: true, sessionKholle: { select: { disciplineId: true } } } },
    },
  });

  const eleveKholleur: Record<string, number> = {};
  const tardifEleve: Record<string, number> = {};

  for (const p of passagesHistoriques) {
    const cle = `${p.eleveId}|${p.creneau.sessionKholle.disciplineId}|${p.creneau.kholleurId}`;
    eleveKholleur[cle] = (eleveKholleur[cle] ?? 0) + 1;
    if (p.creneau.heureDebut >= SEUIL_TARDIF) {
      tardifEleve[p.eleveId] = (tardifEleve[p.eleveId] ?? 0) + 1;
    }
  }

  const chargeParKholleur = await prisma.creneau.groupBy({
    by: ["kholleurId"],
    where: { kholleurId: { in: kholleurIds }, sessionKholle: { statut: { not: "PLANIFICATION" } } },
    _count: { id: true },
  });
  const chargeKholleur = Object.fromEntries(chargeParKholleur.map((c) => [c.kholleurId, c._count.id]));

  return { eleveKholleur, chargeKholleur, tardifEleve };
}
