import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const quotaSchema = z.object({
  jourSemaine: z.number().int().min(1).max(7), // 1 = lundi ... 7 = dimanche
  disciplineId: z.string(),
  kholleurId: z.string(),
  nombreEleves: z.number().int().min(1),
  heureDebut: z.string().regex(/^\d{2}:\d{2}$/),
  salleId: z.string(),
  referentId: z.string(),
});

const bodySchema = z.object({
  classeId: z.string(),
  semaine: z.number().int(),
  // Date du lundi de la semaine à planifier ("YYYY-MM-DD"). Sert à
  // transformer les quotas et les disponibilités récurrentes (par jour de
  // semaine) en dates concrètes pour cette semaine précise.
  dateDebutSemaine: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Quotas fixés par l'admin : pour chaque (jour, discipline, kholleur), le
  // nombre d'élèves à lui affecter cette semaine, l'heure de début du
  // premier créneau, la salle et le référent de la discipline. OR-Tools
  // choisit ensuite quels élèves précis remplissent ces quotas.
  quotas: z.array(quotaSchema).min(1),
  // Si des quotas dépassent les disponibilités déclarées d'un kholleur, le
  // calcul est d'abord refusé avec le détail (voir plus bas) pour laisser
  // l'admin confirmer explicitement qu'il veut lancer quand même.
  forcerMalgreIndisponibilites: z.boolean().optional().default(false),
  // Autorise un total de quotas inférieur à l'effectif pour une discipline
  // (des élèves n'auront alors aucun créneau cette semaine-là) — utile pour
  // rejouer un historique réel incomplet (absences non documentées). Un
  // total SUPÉRIEUR à l'effectif reste toujours une erreur, drapeau ou pas.
  permettreEffectifPartiel: z.boolean().optional().default(false),
});

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
  const { classeId, semaine, dateDebutSemaine, quotas, forcerMalgreIndisponibilites, permettreEffectifPartiel } =
    bodySchema.parse(await req.json());

  const disciplineIds = [...new Set(quotas.map((q) => q.disciplineId))];
  const kholleurIds = [...new Set(quotas.map((q) => q.kholleurId))];

  const eleves = await prisma.eleve.findMany({ where: { classeId } });

  // Sous-ensemble des disciplines de cette semaine marquées "langue vivante" :
  // seuls les élèves dont c'est la LV1 ou la LV2 y sont éligibles (voir
  // resoudre() côté solveur), donc leur effectif attendu n'est pas celui de
  // toute la classe mais celui du sous-groupe concerné — calculé plus bas.
  const disciplinesLangue = (
    await prisma.discipline.findMany({ where: { id: { in: disciplineIds }, estLangueVivante: true } })
  ).map((d) => d.id);

  // Chaque discipline non-langue présente dans les quotas doit être
  // intégralement couverte : la somme des quotas doit égaler exactement
  // l'effectif de la classe, sinon certains élèves n'auraient pas de créneau
  // (ou il y en aurait trop) pour cette discipline cette semaine.
  const erreursEffectif: string[] = [];
  for (const disciplineId of disciplineIds) {
    if (disciplinesLangue.includes(disciplineId)) continue;
    const total = quotas.filter((q) => q.disciplineId === disciplineId).reduce((s, q) => s + q.nombreEleves, 0);
    if (total > eleves.length || (total < eleves.length && !permettreEffectifPartiel)) {
      const discipline = await prisma.discipline.findUnique({ where: { id: disciplineId } });
      erreursEffectif.push(
        `${discipline?.nom ?? disciplineId} : ${total} élève(s) affecté(s) au total, attendu ${eleves.length}`
      );
    }
  }
  // Pour le groupe des disciplines "langue" de la semaine (Anglais/LV1 et
  // Espagnol/Italien/Allemand/LV2 pouvant coexister), la somme des quotas
  // doit égaler le nombre d'élèves éligibles à au moins l'une d'entre elles
  // (chacun n'en passe qu'une, quelle que soit sa LV1 ou sa LV2).
  if (disciplinesLangue.length > 0) {
    const totalLangue = quotas
      .filter((q) => disciplinesLangue.includes(q.disciplineId))
      .reduce((s, q) => s + q.nombreEleves, 0);
    const elevesEligibles = eleves.filter(
      (e) => (e.lv1Id && disciplinesLangue.includes(e.lv1Id)) || (e.lv2Id && disciplinesLangue.includes(e.lv2Id))
    ).length;
    if (totalLangue > elevesEligibles || (totalLangue < elevesEligibles && !permettreEffectifPartiel)) {
      erreursEffectif.push(
        `Langues (${disciplinesLangue.length} discipline(s)) : ${totalLangue} élève(s) affecté(s) au total, ` +
          `attendu ${elevesEligibles} (élèves dont c'est la LV1 ou la LV2)`
      );
    }
  }
  if (erreursEffectif.length > 0) {
    return NextResponse.json(
      { error: `Effectif incohérent avec les quotas saisis : ${erreursEffectif.join(" ; ")}` },
      { status: 400 }
    );
  }

  // Le référent est rattaché à (classe, discipline) : deux lignes de quota
  // pour la même discipline doivent forcément désigner le même référent.
  const erreursReferent: string[] = [];
  for (const disciplineId of disciplineIds) {
    const referentIds = new Set(quotas.filter((q) => q.disciplineId === disciplineId).map((q) => q.referentId));
    if (referentIds.size > 1) {
      const discipline = await prisma.discipline.findUnique({ where: { id: disciplineId } });
      erreursReferent.push(`${discipline?.nom ?? disciplineId} : référent différent selon les lignes`);
    }
  }
  if (erreursReferent.length > 0) {
    return NextResponse.json(
      { error: `Référent incohérent : ${erreursReferent.join(" ; ")}` },
      { status: 400 }
    );
  }

  const quotasDates = quotas.map((q) => ({
    date: dateDuJourSemaine(dateDebutSemaine, q.jourSemaine),
    disciplineId: q.disciplineId,
    kholleurId: q.kholleurId,
    nombreEleves: q.nombreEleves,
    heureDebut: q.heureDebut,
    salleId: q.salleId,
  }));

  // Une même salle ne peut pas accueillir deux quotas qui se chevauchent le
  // même jour — autant le détecter tout de suite avec un message clair
  // plutôt que de laisser OR-Tools échouer avec un "INFAISABLE" générique.
  const erreursSalle: string[] = [];
  const parSalleEtDate = new Map<string, typeof quotasDates>();
  for (const q of quotasDates) {
    const cle = `${q.date}|${q.salleId}`;
    const liste = parSalleEtDate.get(cle) ?? [];
    liste.push(q);
    parSalleEtDate.set(cle, liste);
  }
  for (const liste of parSalleEtDate.values()) {
    const triee = [...liste].sort((a, b) => minutes(a.heureDebut) - minutes(b.heureDebut));
    for (let i = 1; i < triee.length; i++) {
      const precedent = triee[i - 1];
      const finPrecedent = minutes(precedent.heureDebut) + precedent.nombreEleves * DUREE_CRENEAU_MINUTES;
      if (finPrecedent > minutes(triee[i].heureDebut)) {
        const salle = await prisma.salle.findUnique({ where: { id: triee[i].salleId } });
        erreursSalle.push(`${salle?.nom ?? triee[i].salleId} le ${triee[i].date} : deux quotas se chevauchent`);
      }
    }
  }
  if (erreursSalle.length > 0) {
    return NextResponse.json({ error: `Conflit de salle : ${erreursSalle.join(" ; ")}` }, { status: 400 });
  }

  const dispoBrutes = await prisma.disponibilite.findMany({ where: { kholleurId: { in: kholleurIds } } });
  const disponibilites = expanserDisponibilites(dispoBrutes, dateDebutSemaine);

  // Vérification précoce : le créneau [heureDebut, heureDebut + durée] doit
  // tenir intégralement dans une disponibilité déclarée du kholleur ce
  // jour-là. Contrairement aux autres vérifications ci-dessus, celle-ci ne
  // bloque pas définitivement : elle demande confirmation (l'admin peut avoir
  // de bonnes raisons de passer outre une disponibilité non déclarée), sauf
  // si `forcerMalgreIndisponibilites` a déjà été coché côté client.
  const erreursCapacite: string[] = [];
  for (const q of quotasDates) {
    const debut = minutes(q.heureDebut);
    const fin = debut + q.nombreEleves * DUREE_CRENEAU_MINUTES;
    const couvert = disponibilites.some(
      (d) =>
        d.kholleurId === q.kholleurId &&
        d.date === q.date &&
        minutes(d.heureDebut) <= debut &&
        fin <= minutes(d.heureFin)
    );
    if (!couvert) {
      const kholleur = await prisma.utilisateur.findUnique({ where: { id: q.kholleurId } });
      erreursCapacite.push(
        `${kholleur ? `${kholleur.prenom} ${kholleur.nom}` : q.kholleurId} le ${q.date} de ${q.heureDebut} à ` +
          `${minutesVersHeure(fin)} (${q.nombreEleves} élèves) : hors de ses disponibilités déclarées`
      );
    }
  }
  if (erreursCapacite.length > 0 && !forcerMalgreIndisponibilites) {
    return NextResponse.json(
      {
        confirmationRequise: true,
        error: `Certains créneaux dépassent les disponibilités déclarées : ${erreursCapacite.join(" ; ")}`,
      },
      { status: 409 }
    );
  }

  const job = await prisma.planificationJob.create({
    data: { classeId, semaine, disciplines: disciplineIds, quotas, lanceParId },
  });

  // S'assure que le référent choisi pour chaque discipline fait bien partie
  // des référents de cette classe, directement depuis l'écran de
  // planification plutôt que de devoir passer par /admin/referents
  // séparément. Plusieurs référents peuvent déjà exister pour la même
  // (classe, discipline) : on ne fait qu'ajouter celui-ci s'il n'y est pas,
  // sans toucher aux autres.
  for (const disciplineId of disciplineIds) {
    const referentId = quotas.find((q) => q.disciplineId === disciplineId)!.referentId;
    await prisma.professeurReferent.upsert({
      where: { classeId_disciplineId_utilisateurId: { classeId, disciplineId, utilisateurId: referentId } },
      update: {},
      create: { classeId, disciplineId, utilisateurId: referentId },
    });
  }

  const historique = await calculerHistorique(
    eleves.map((e) => e.id),
    kholleurIds,
    disciplineIds
  );
  const derniereLangue = await calculerDerniereLangue(eleves);

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
        eleves: eleves.map((e) => ({ ...e, lv1DisciplineId: e.lv1Id, lv2DisciplineId: e.lv2Id })),
        quotas: quotasDates,
        historique: { ...historique, derniereLangue },
        disciplinesLangue,
        effectifPartiel: permettreEffectifPartiel,
        // En Docker de production, le solveur doit rappeler l'appli via le
        // réseau interne (ex. http://app:3000), pas via le nom de domaine
        // public : selon l'hébergeur, un conteneur ne peut pas forcément se
        // "rappeler lui-même" via l'IP publique du serveur ("hairpin NAT").
        // INTERNAL_APP_URL n'a donc besoin d'être défini qu'en prod ; en
        // développement (solveur et appli sur le même hôte), NEXTAUTH_URL
        // convient déjà tel quel.
        callbackUrl: `${process.env.INTERNAL_APP_URL ?? process.env.NEXTAUTH_URL}/api/internal/planification/callback`,
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

function minutesVersHeure(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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

// Rang entier d'autant plus élevé que le créneau commence tard dans la
// journée (14h -> 14, 18h30 -> 18) : même calcul que _rang_horaire() côté
// solveur (solver.py), pour que le cumul historique et celui de la semaine
// en cours soient sur la même échelle.
function rangHoraire(heureDebut: string): number {
  return Number(heureDebut.split(":")[0]);
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
  const scoreHoraireEleve: Record<string, number> = {};

  for (const p of passagesHistoriques) {
    const cle = `${p.eleveId}|${p.creneau.sessionKholle.disciplineId}|${p.creneau.kholleurId}`;
    eleveKholleur[cle] = (eleveKholleur[cle] ?? 0) + 1;
    scoreHoraireEleve[p.eleveId] = (scoreHoraireEleve[p.eleveId] ?? 0) + rangHoraire(p.creneau.heureDebut);
  }

  const chargeParKholleur = await prisma.creneau.groupBy({
    by: ["kholleurId"],
    where: { kholleurId: { in: kholleurIds }, sessionKholle: { statut: { not: "PLANIFICATION" } } },
    _count: { id: true },
  });
  const chargeKholleur = Object.fromEntries(chargeParKholleur.map((c) => [c.kholleurId, c._count.id]));

  return { eleveKholleur, chargeKholleur, scoreHoraireEleve };
}

// Pour chaque élève ayant LV1 ET LV2, retrouve la langue (LV1 ou LV2) de son
// tout dernier passage en discipline "langue vivante" publié (toutes
// disciplines langues confondues, pas seulement celles de cette semaine) :
// nourrit l'objectif d'alternance du solveur. Sans LV1/LV2 renseignées (cas
// des L2), l'élève est ignoré — l'alternance ne les concerne pas.
async function calculerDerniereLangue(
  eleves: { id: string; lv1Id: string | null; lv2Id: string | null }[]
): Promise<Record<string, "LV1" | "LV2">> {
  const eleveIds = eleves.filter((e) => e.lv1Id && e.lv2Id).map((e) => e.id);
  if (eleveIds.length === 0) return {};

  const passages = await prisma.passage.findMany({
    where: {
      eleveId: { in: eleveIds },
      creneau: { sessionKholle: { discipline: { estLangueVivante: true }, statut: { not: "PLANIFICATION" } } },
    },
    select: {
      eleveId: true,
      creneau: { select: { sessionKholle: { select: { disciplineId: true, dateDebut: true } } } },
    },
  });

  const eleveParId = new Map(eleves.map((e) => [e.id, e]));
  const plusRecent = new Map<string, Date>();
  const resultat: Record<string, "LV1" | "LV2"> = {};

  for (const p of passages) {
    const date = p.creneau.sessionKholle.dateDebut;
    if ((plusRecent.get(p.eleveId)?.getTime() ?? -Infinity) >= date.getTime()) continue;
    const eleve = eleveParId.get(p.eleveId)!;
    const disciplineId = p.creneau.sessionKholle.disciplineId;
    const type = disciplineId === eleve.lv1Id ? "LV1" : disciplineId === eleve.lv2Id ? "LV2" : null;
    if (!type) continue;
    plusRecent.set(p.eleveId, date);
    resultat[p.eleveId] = type;
  }

  return resultat;
}
