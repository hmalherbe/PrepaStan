// Diagnostic ponctuel (lecture seule) : reconstitue, à partir des créneaux
// déjà en base (brouillon ou publiés), les lignes de quota équivalentes
// (jour, discipline, kholleur, salle, heure de début de la 1re préparation,
// nombre d'élèves) pour une (classe, semaine) donnée — pratique pour
// ressaisir à l'identique sur l'écran "Générer le planning" avant de relancer
// une génération (ex. après correction d'un chevauchement entre disciplines).
//
// Usage (depuis /root/PrepaStan sur le VPS) :
//   docker compose -f docker-compose.prod.yml exec -T \
//     -e CLASSE=L1 -e SEMAINE=46 \
//     app node < scripts/reconstituer-quotas-semaine.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function minutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const JOURS = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

async function main() {
  const classeNomFiltre = process.env.CLASSE;
  const semaineFiltre = process.env.SEMAINE ? Number(process.env.SEMAINE) : undefined;
  if (!classeNomFiltre || semaineFiltre === undefined) {
    console.log("Usage : CLASSE=<nom> SEMAINE=<numéro> requis.");
    return;
  }

  const creneaux = await prisma.creneau.findMany({
    where: {
      sessionKholle: { classe: { nom: classeNomFiltre }, semaine: semaineFiltre },
    },
    select: {
      date: true,
      heureDebutPreparation: true,
      heureDebut: true,
      salleId: true,
      salle: { select: { nom: true } },
      kholleurId: true,
      kholleur: { select: { nom: true, prenom: true } },
      sessionKholle: { select: { statut: true, disciplineId: true, discipline: { select: { nom: true } } } },
      _count: { select: { passages: true } },
    },
  });

  const groupes = new Map();
  for (const c of creneaux) {
    const cle = `${c.sessionKholle.disciplineId}|${c.kholleurId}|${c.salleId}|${c.date.toISOString().slice(0, 10)}`;
    const g = groupes.get(cle) ?? {
      disciplineNom: c.sessionKholle.discipline.nom,
      disciplineId: c.sessionKholle.disciplineId,
      statut: c.sessionKholle.statut,
      kholleurNom: `${c.kholleur.prenom} ${c.kholleur.nom}`,
      kholleurId: c.kholleurId,
      salleNom: c.salle.nom,
      salleId: c.salleId,
      date: c.date,
      premierePrepMinutes: Infinity,
      nombreEleves: 0,
    };
    const debutPrep = minutes(c.heureDebutPreparation ?? c.heureDebut);
    g.premierePrepMinutes = Math.min(g.premierePrepMinutes, debutPrep);
    g.nombreEleves += c._count.passages;
    groupes.set(cle, g);
  }

  const heureDe = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  console.log(`Quotas reconstitués pour ${classeNomFiltre}, semaine ${semaineFiltre} :\n`);
  for (const g of [...groupes.values()].sort((a, b) => a.date - b.date || a.disciplineNom.localeCompare(b.disciplineNom))) {
    const jourSemaine = ((g.date.getUTCDay() + 6) % 7) + 1; // 0=dimanche -> 7
    console.log(
      `  [${g.statut}] ${JOURS[jourSemaine]} (${g.date.toISOString().slice(0, 10)}) — ${g.disciplineNom} — ` +
        `kholleur: ${g.kholleurNom} — salle: ${g.salleNom} — heureDebut (1re préparation): ${heureDe(g.premierePrepMinutes)} — ` +
        `nombreEleves: ${g.nombreEleves}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
