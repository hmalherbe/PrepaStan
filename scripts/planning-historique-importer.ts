// Reconstruit dans l'appli les plannings réels de l'année 2025-2026 (L1 et
// L2), à partir de scripts/planning-historique-L1.json et
// planning-historique-L2.json (générés depuis le fichier Excel fourni par
// l'utilisateur — voir scripts/planning-historique-verifier-noms.ts pour la
// vérification préalable des noms).
//
// Ne réimplémente RIEN du pipeline de planification : ce script se connecte
// en admin et appelle les VRAIES routes API (POST .../jobs, GET .../jobs/:id,
// POST .../publier), semaine après semaine et dans l'ordre chronologique,
// exactement comme le ferait un administrateur depuis l'écran Planification.
// C'est ce qui garantit que l'historique (diversité des khôlleurs,
// équilibrage des horaires, alternance LV1/LV2) est calculé correctement
// semaine après semaine, et que le nouveau solveur (avec la contrainte
// d'alternance) est exercé pour de vrai plutôt que contourné.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE_URL = process.env.PREPASTAN_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@prepastan.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme";

type LigneSource = {
  date: string; // "YYYY-MM-DD"
  discipline: string;
  kholleurs: { kholleur_nom: string; nombreEleves: number; heureDebut: string | null }[];
  referent_nom: string | null;
};

type QuotaLigne = {
  jourSemaine: number;
  disciplineId: string;
  kholleurId: string;
  nombreEleves: number;
  heureDebut: string;
  salleId: string;
  referentId: string;
};

type JobSemaine = {
  classeNom: "L1" | "L2";
  semaine: number; // numéro de semaine ISO, unique dans sa plage (39-52 ou 1-15) donc sans ambiguïté
  dateDebutSemaine: string;
  quotas: QuotaLigne[];
};

function normaliser(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, "")
    .trim();
}

function isoWeekInfo(dateStr: string): { isoWeek: number; monday: string; jourSemaine: number } {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const jourISO = (d.getUTCDay() + 6) % 7; // 0=lundi..6=dimanche
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - jourISO);
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const isoYear = thursday.getUTCFullYear();
  const jan1 = Date.UTC(isoYear, 0, 1);
  const isoWeek = Math.ceil(((thursday.getTime() - jan1) / 86400000 + 1) / 7);
  return { isoWeek, monday: monday.toISOString().slice(0, 10), jourSemaine: jourISO + 1 };
}

// ---------- Authentification (cookie de session NextAuth) ----------
// `headers.get("set-cookie")` n'est pas fiable selon la version de Node
// (renvoie parfois null même quand le cookie est bien présent) : on utilise
// systématiquement `getSetCookie()`, qui renvoie la liste complète.
async function connexionAdmin(): Promise<string> {
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  if (!csrfRes.ok) {
    throw new Error(
      `Impossible de joindre ${BASE_URL}/api/auth/csrf (statut ${csrfRes.status}) — le serveur Next.js ` +
        `(npm run dev) est-il bien lancé et accessible sur ${BASE_URL} ?`
    );
  }
  const csrfCookie = csrfRes.headers.getSetCookie().find((c) => c.startsWith("next-auth.csrf-token="))?.split(";")[0];
  if (!csrfCookie) {
    throw new Error(
      `Aucun cookie CSRF reçu depuis ${BASE_URL}/api/auth/csrf — vérifiez que le serveur Next.js tourne bien ` +
        `à cette adresse (définissez PREPASTAN_URL si ce n'est pas http://localhost:3000).`
    );
  }
  const { csrfToken } = await csrfRes.json();

  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: csrfCookie },
    body: new URLSearchParams({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, csrfToken, json: "true" }),
    redirect: "manual",
  });
  const sessionCookie = loginRes.headers
    .getSetCookie()
    .find((c) => c.startsWith("next-auth.session-token="))
    ?.split(";")[0];
  if (!sessionCookie) throw new Error("Échec de connexion admin : vérifiez SEED_ADMIN_EMAIL/PASSWORD");
  return `${csrfCookie}; ${sessionCookie}`;
}

// ---------- Résolution des noms (khôlleur/référent) vers un compte ----------
async function construireResolveur() {
  const comptes = await prisma.utilisateur.findMany({
    where: { OR: [{ roles: { has: "KHOLLEUR" } }, { roles: { has: "PROFESSEUR_REFERENT" } }] },
    select: { id: true, nom: true, prenom: true },
  });
  const comptesNorm = comptes.map((c) => ({ ...c, nomNorm: normaliser(c.nom), prenomNorm: normaliser(c.prenom) }));
  const referents = await prisma.professeurReferent.findMany({ include: { classe: { select: { nom: true } } } });

  return function resoudre(nomBrut: string, classeNom: string): string {
    const tokens = normaliser(nomBrut).split(/\s+/).filter(Boolean);
    let candidats = comptesNorm.filter((c) => {
      if (!c.nomNorm) return false;
      const nomTokens = c.nomNorm.split(/\s+/).filter(Boolean);
      return (
        nomTokens.every((t) => tokens.includes(t)) &&
        (!c.prenomNorm || tokens.some((t) => c.prenomNorm.startsWith(t) || t.startsWith(c.prenomNorm)))
      );
    });
    if (candidats.length > 1) {
      const idsLiesAClasse = new Set(
        referents.filter((r) => r.classe.nom === classeNom).map((r) => r.utilisateurId)
      );
      const filtres = candidats.filter((c) => idsLiesAClasse.has(c.id));
      if (filtres.length === 1) candidats = filtres;
    }
    if (candidats.length !== 1) {
      throw new Error(`Nom non résolu de façon unique pour ${classeNom} : "${nomBrut}" (${candidats.length} candidat(s))`);
    }
    return candidats[0].id;
  };
}

// ---------- Attribution des salles (pool dédié par classe, sans chevauchement) ----------
function creerAllocateurSalles(classeNom: string, sallesExistantes: Map<string, string>) {
  const occupation = new Map<string, { salleId: string; finMinutes: number }[]>(); // date -> occupations
  let compteur = 0;

  return async function attribuer(date: string, debutMinutes: number, finMinutes: number): Promise<string> {
    const liste = occupation.get(date) ?? [];
    for (const occ of liste) {
      if (occ.finMinutes <= debutMinutes) {
        occ.finMinutes = finMinutes;
        return occ.salleId;
      }
    }
    compteur++;
    const nom = `${classeNom} - Salle ${compteur}`;
    let salleId = sallesExistantes.get(nom);
    if (!salleId) {
      const salle = await prisma.salle.upsert({ where: { nom }, update: {}, create: { nom } });
      salleId = salle.id;
      sallesExistantes.set(nom, salleId);
    }
    liste.push({ salleId, finMinutes });
    occupation.set(date, liste);
    return salleId;
  };
}

const DUREE_CRENEAU_MINUTES = 20;
function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

async function construireJobs(): Promise<JobSemaine[]> {
  const disciplines = await prisma.discipline.findMany();
  const disciplineParNom = new Map(disciplines.map((d) => [d.nom, d.id]));
  const resoudreNom = await construireResolveur();
  const sallesExistantes = new Map((await prisma.salle.findMany()).map((s) => [s.nom, s.id]));
  const classesExistantes = await prisma.classe.findMany();
  const classeIdParNomTemp = new Map(classesExistantes.map((c) => [c.nom, c.id]));
  const referentsExistants = await prisma.professeurReferent.findMany();

  // Quelques lignes du fichier source n'indiquent pas de référent (case
  // vide) : on retombe sur le référent déjà connu pour cette (classe,
  // discipline) depuis l'import précédent (Bdd_Google_App_JS.xlsx).
  function referentParDefaut(classeNom: string, disciplineId: string): string | null {
    const classeId = classeIdParNomTemp.get(classeNom);
    const trouve = referentsExistants.find((r) => r.classeId === classeId && r.disciplineId === disciplineId);
    return trouve?.utilisateurId ?? null;
  }

  const jobs: JobSemaine[] = [];

  for (const [fichier, classeNom] of [
    ["planning-historique-L1.json", "L1"],
    ["planning-historique-L2.json", "L2"],
  ] as const) {
    const lignes: LigneSource[] = JSON.parse(readFileSync(join(__dirname, fichier), "utf-8"));
    const parSemaine = new Map<number, { dateDebutSemaine: string; lignes: (LigneSource & { jourSemaine: number })[] }>();

    for (const l of lignes) {
      const { isoWeek, monday, jourSemaine } = isoWeekInfo(l.date);
      const groupe = parSemaine.get(isoWeek) ?? { dateDebutSemaine: monday, lignes: [] };
      groupe.lignes.push({ ...l, jourSemaine });
      parSemaine.set(isoWeek, groupe);
    }

    for (const [semaine, { dateDebutSemaine, lignes: lignesSemaine }] of [...parSemaine.entries()].sort(
      (a, b) => a[0] - b[0]
    )) {
      const allouerSalle = creerAllocateurSalles(classeNom, sallesExistantes);
      const quotas: QuotaLigne[] = [];
      for (const l of lignesSemaine) {
        const disciplineId = disciplineParNom.get(l.discipline);
        if (!disciplineId) throw new Error(`Discipline inconnue : "${l.discipline}"`);
        const referentId = l.referent_nom
          ? resoudreNom(l.referent_nom, classeNom)
          : referentParDefaut(classeNom, disciplineId);
        if (!referentId) throw new Error(`Référent manquant pour ${classeNom} ${l.date} ${l.discipline}`);
        for (const k of l.kholleurs) {
          const heureDebut = k.heureDebut ?? "14:00";
          const kholleurId = resoudreNom(k.kholleur_nom, classeNom);
          const debut = minutes(heureDebut);
          const fin = debut + k.nombreEleves * DUREE_CRENEAU_MINUTES;
          const salleId = await allouerSalle(l.date, debut, fin);
          quotas.push({
            jourSemaine: l.jourSemaine,
            disciplineId,
            kholleurId,
            nombreEleves: k.nombreEleves,
            heureDebut,
            salleId,
            referentId,
          });
        }
      }
      jobs.push({ classeNom, semaine, dateDebutSemaine, quotas });
    }
  }

  // Ordre chronologique RÉEL, indispensable pour que l'historique (charge
  // des khôlleurs, diversité, alternance LV1/LV2) se construise dans le bon
  // sens semaine après semaine. Un simple tri par numéro de semaine ISO
  // serait faux ici : les semaines 39-52 (2025) précèdent les semaines 1-15
  // (2026), et L1/L2 doivent être entrelacées (un khôlleur peut intervenir
  // dans les deux classes la même semaine calendaire).
  jobs.sort((a, b) => a.dateDebutSemaine.localeCompare(b.dateDebutSemaine));
  return jobs;
}

async function main() {
  console.log("Construction des jobs à partir des fichiers sources...");
  const jobs = await construireJobs();
  console.log(`${jobs.length} semaines à générer (L1+L2 confondues).\n`);

  if (process.env.DRY_RUN === "1") {
    for (const j of jobs) {
      console.log(`${j.classeNom} semaine ${j.semaine} (${j.dateDebutSemaine}) : ${j.quotas.length} quotas`);
    }
    return;
  }

  const classes = await prisma.classe.findMany({ where: { nom: { in: ["L1", "L2"] } } });
  const classeIdParNom = new Map(classes.map((c) => [c.nom, c.id]));

  const cookie = await connexionAdmin();
  const resultats: { classe: string; semaine: number; statut: string; message?: string }[] = [];

  for (const job of jobs) {
    const classeId = classeIdParNom.get(job.classeNom);
    if (!classeId) throw new Error(`Classe ${job.classeNom} introuvable en base`);

    process.stdout.write(`${job.classeNom} semaine ${job.semaine} (${job.quotas.length} quotas)... `);

    const postRes = await fetch(`${BASE_URL}/api/admin/planification/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        classeId,
        semaine: job.semaine,
        dateDebutSemaine: job.dateDebutSemaine,
        quotas: job.quotas,
        forcerMalgreIndisponibilites: true,
        // Le fichier historique ne couvre pas toujours 100% de l'effectif
        // pour chaque discipline chaque semaine (absences non documentées,
        // révisions incomplètes) : on l'accepte tel quel plutôt que de
        // fabriquer des chiffres.
        permettreEffectifPartiel: true,
      }),
    });
    const postData = await postRes.json();
    if (!postRes.ok) {
      console.log(`ÉCHEC (soumission) : ${postData.error}`);
      resultats.push({ classe: job.classeNom, semaine: job.semaine, statut: "ECHEC_SOUMISSION", message: postData.error });
      continue;
    }

    const jobId = postData.jobId;
    let statut = "EN_COURS";
    let message: string | undefined;
    for (let tentative = 0; tentative < 60 && statut === "EN_COURS"; tentative++) {
      await new Promise((r) => setTimeout(r, 1000));
      const pollRes = await fetch(`${BASE_URL}/api/admin/planification/jobs/${jobId}`, { headers: { Cookie: cookie } });
      const pollData = await pollRes.json();
      statut = pollData.statut;
      message = pollData.message;
    }

    if (statut !== "SUCCES") {
      console.log(`${statut} : ${message ?? "?"}`);
      resultats.push({ classe: job.classeNom, semaine: job.semaine, statut, message });
      continue;
    }

    const publierRes = await fetch(`${BASE_URL}/api/admin/planification/${classeId}/${job.semaine}/publier`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    if (!publierRes.ok) {
      const err = await publierRes.json();
      console.log(`SUCCES mais échec publication : ${err.error}`);
      resultats.push({ classe: job.classeNom, semaine: job.semaine, statut: "ECHEC_PUBLICATION", message: err.error });
      continue;
    }

    console.log("OK (publié)");
    resultats.push({ classe: job.classeNom, semaine: job.semaine, statut: "SUCCES" });
  }

  const succes = resultats.filter((r) => r.statut === "SUCCES").length;
  const echecs = resultats.filter((r) => r.statut !== "SUCCES");
  console.log(`\n${succes}/${resultats.length} semaines générées et publiées avec succès.`);
  if (echecs.length > 0) {
    console.log("Échecs :");
    for (const e of echecs) console.log(`  - ${e.classe} semaine ${e.semaine} : ${e.statut} — ${e.message}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
