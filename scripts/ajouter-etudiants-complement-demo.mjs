// Ajoute des étudiants fictifs à L1/L2 dans la base de DÉMO, pour combler
// l'écart entre l'effectif actuel (copié depuis la prod d'aujourd'hui) et
// l'effectif, plus grand, de l'époque couverte par l'historique réel rejoué
// (voir planning-historique-importer.mjs) — des étudiants sont partis
// depuis. Sans ces étudiants en plus, le contrôle "effectif incohérent"
// (voir /api/admin/planification/jobs) refuse une bonne partie des
// semaines historiques, dont les quotas dépassent l'effectif actuel.
//
// Nombres et langues choisis d'après l'analyse des fichiers sources : L1
// culmine à 29 (effectif actuel 27, +2), L2 à 25 la plupart du temps
// (effectif actuel 24, +1) sauf une semaine exceptionnelle à 36 qui reste
// hors de portée (traitée à part, voir la conversation). Les LV1 assignées
// sont une approximation (langues les plus utilisées dans l'historique) :
// suffisant pour la plupart des semaines, mais il peut rester quelques
// échecs ponctuels si une semaine donnée avait besoin d'une répartition de
// langues différente de celle-ci.
//
// Usage (depuis /root/PrepaStan sur le VPS) :
//   docker compose -f docker-compose.demo.yml cp scripts/ajouter-etudiants-complement-demo.mjs app-demo:/app/prisma/tmp-import/
//   docker compose -f docker-compose.demo.yml exec app-demo node /app/prisma/tmp-import/ajouter-etudiants-complement-demo.mjs
//
// Garde-fou : refuse de tourner si DATABASE_URL ne contient pas "db-demo".
import { PrismaClient } from "@prisma/client";

const targetUrl = process.env.DATABASE_URL;
if (!targetUrl || !targetUrl.includes("db-demo")) {
  console.error(`DATABASE_URL suspect, doit contenir "db-demo" : ${targetUrl}`);
  process.exit(1);
}

const prisma = new PrismaClient();

const AJOUTS = [
  { classeNom: "L1", nom: "Complément 1", lv1Nom: "Anglais" },
  { classeNom: "L1", nom: "Complément 2", lv1Nom: "Espagnol" },
  { classeNom: "L2", nom: "Complément 1", lv1Nom: "Anglais" },
];

async function main() {
  for (const a of AJOUTS) {
    const classe = await prisma.classe.findFirstOrThrow({ where: { nom: a.classeNom } });
    const lv1 = await prisma.discipline.findUniqueOrThrow({ where: { nom: a.lv1Nom } });
    const existant = await prisma.eleve.findFirst({ where: { nom: a.nom, prenom: "Démo", classeId: classe.id } });
    if (existant) {
      console.log(`Déjà présent : ${a.classeNom} / ${a.nom}`);
      continue;
    }
    await prisma.eleve.create({
      data: { nom: a.nom, prenom: "Démo", classeId: classe.id, lv1Id: lv1.id },
    });
    console.log(`Ajouté : ${a.classeNom} / ${a.nom} (LV1 ${a.lv1Nom})`);
  }
  console.log("\nTerminé.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
