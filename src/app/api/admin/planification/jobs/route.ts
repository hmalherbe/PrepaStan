import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const quotaSchema = z.object({
  jourSemaine: z.number().int().min(1).max(7), // 1 = lundi ... 7 = dimanche
  disciplineId: z.string(),
  kholleurId: z.string(),
  nombreEleves: z.number().int().min(1),
});

const bodySchema = z.object({
  classeId: z.string(),
  semaine: z.number().int(),
  // Date du lundi de la semaine à planifier ("YYYY-MM-DD"). Sert à
  // transformer les quotas et les disponibilités récurrentes (par jour de
  // semaine) en dates concrètes pour cette semaine précise.
  dateDebutSemaine: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Quotas fixés par l'admin : pour chaque (jour, discipline, kholleur), le
  // nombre d'élèves à lui affecter cette semaine. OR-Tools choisit ensuite
  // quels élèves précis remplissent ces quotas.
  quotas: z.array(quotaSchema).min(1),
});

// Au-delà de cette heure, un créneau est considéré "tardif" pour
// l'équilibrage des horaires de passage (voir calculerHistorique ci-dessous).
const SEUIL_TARDIF = "17:00";
const DUREE_CRENEAU_MINUTES = 20;

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
  const { classeId, semaine, dateDebutSemaine, quotas } = bodySchema.parse(await req.json());

  const disciplineIds = [...new Set(quotas.map((q) => q.disciplineId))];
  const kholleurIds = [...new Set(quotas.map((q) => q.kholleurId))];

  const eleves = await prisma.eleve.findMany({ where: { classeId } });

  // Chaque discipline présente dans les quotas doit être intégralement
  // couverte : la somme des quotas doit égaler exactement l'effectif de la
  // classe, sinon certains élèves n'auraient pas de créneau (ou il y en
  // aurait trop) pour cette discipline cette semaine.
  const erreursEffectif: string[] = [];
  for (const disciplineId of disciplineIds) {
    const total = quotas.filter((q) => q.disciplineId === disciplineId).reduce((s, q) => s + q.nombreEleves, 0);
    if (total !== eleves.length) {
      const discipline = await prisma.discipline.findUnique({ where: { id: disciplineId } });
      erreursEffectif.push(
        `${discipline?.nom ?? disciplineId} : ${total} élève(s) affecté(s) au total, attendu ${eleves.length}`
      );
    }
  }
  if (erreursEffectif.length > 0) {
    return NextResponse.json(
      { error: `Effectif incohérent avec les quotas saisis : ${erreursEffectif.join(" ; ")}` },
      { status: 400 }
    );
  }

  const job = await prisma.planificationJob.create({
    data: { classeId, semaine, disciplines: disciplineIds, quotas, lanceParId },
  });

  const [dispoBrutes, competences, salles] = await Promise.all([
    prisma.disponibilite.findMany({ where: { kholleurId: { in: kholleurIds } } }),
    prisma.competence.findMany({ where: { disciplineId: { in: disciplineIds } } }),
    prisma.salle.findMany(),
  ]);

  const disponibilites = expanserDisponibilites(dispoBrutes, dateDebutSemaine);
  const quotasDates = quotas.map((q) => ({
    date: dateDuJourSemaine(dateDebutSemaine, q.jourSemaine),
    disciplineId: q.disciplineId,
    kholleurId: q.kholleurId,
    nombreEleves: q.nombreEleves,
  }));

  // Vérification précoce : un quota dont le kholleur n'a aucune disponibilité
  // ce jour-là (ou pas assez pour caser tout le monde) est nécessairement
  // infaisable — autant le dire tout de suite plutôt que de faire tourner
  // OR-Tools pour rien.
  const erreursCapacite: string[] = [];
  for (const q of quotasDates) {
    const dispoJour = disponibilites.filter((d) => d.kholleurId === q.kholleurId && d.date === q.date);
    const capaciteMinutes = dispoJour.reduce((s, d) => s + (minutes(d.heureFin) - minutes(d.heureDebut)), 0);
    const minutesRequises = q.nombreEleves * DUREE_CRENEAU_MINUTES;
    if (capaciteMinutes < minutesRequises) {
      const kholleur = await prisma.utilisateur.findUnique({ where: { id: q.kholleurId } });
      erreursCapacite.push(
        `${kholleur ? `${kholleur.prenom} ${kholleur.nom}` : q.kholleurId} le ${q.date} : ${capaciteMinutes} min disponibles pour ${minutesRequises} min requises (${q.nombreEleves} élèves)`
      );
    }
  }
  if (erreursCapacite.length > 0) {
    await prisma.planificationJob.update({
      where: { id: job.id },
      data: { statut: "INFAISABLE", message: erreursCapacite.join(" ; "), dateFin: new Date() },
    });
    return NextResponse.json({ jobId: job.id }, { status: 202 });
  }

  const historique = await calculerHistorique(
    eleves.map((e) => e.id),
    kholleurIds,
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
        quotas: quotasDates,
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

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function dateDuJourSemaine(dateDebutSemaine: string, jourSemaine: number): string {
  const lundi = new Date(`${dateDebutSemaine}T00:00:00.000Z`);
  const jour = new Date(lundi);
  jour.setUTCDate(jour.getUTCDate() + (jourSemaine - 1));
  return jour.toISOString().slice(0, 10);
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
      resultat.push({
        kholleurId: d.kholleurId,
        date: dateDuJourSemaine(dateDebutSemaine, d.jourSemaine),
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
