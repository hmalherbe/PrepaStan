// Remplit note et appréciation aléatoires (mais cohérentes entre elles) pour
// chaque passage encore sans note, sur TOUTES les semaines déjà générées
// dans l'environnement de DÉMO — pour disposer de données à afficher dans
// un futur module statistiques (notes par matière et par kholleur).
//
// Idempotent par construction : ne touche jamais un Passage qui a déjà une
// Note (voir le filtre `note: null` ci-dessous), donc rejouable sans risque
// après une nouvelle génération de semaines, sans écraser des notes déjà
// saisies (réelles ou précédemment tirées au sort).
//
// Usage (depuis /root/PrepaStan sur le VPS) :
//   docker compose -f docker-compose.demo.yml exec app-demo mkdir -p /app/prisma/tmp-import
//   docker compose -f docker-compose.demo.yml cp scripts/generer-notes-aleatoires-demo.mjs app-demo:/app/prisma/tmp-import/
//   docker compose -f docker-compose.demo.yml exec app-demo node /app/prisma/tmp-import/generer-notes-aleatoires-demo.mjs
//
// Garde-fou : refuse de tourner si DATABASE_URL ne contient pas "db-demo".
import { PrismaClient } from "@prisma/client";

const targetUrl = process.env.DATABASE_URL;
if (!targetUrl || !targetUrl.includes("db-demo")) {
  console.error(`DATABASE_URL suspect, doit contenir "db-demo" : ${targetUrl}`);
  process.exit(1);
}

const prisma = new PrismaClient();

// Appréciations par tranche de note, pour rester cohérent avec la valeur
// tirée au sort plutôt que du texte totalement décorrélé.
const APPRECIATIONS = [
  { min: 16, textes: ["Excellent travail, continuez ainsi !", "Très bonne prestation, maîtrise remarquable.", "Brillant, rien à redire."] },
  { min: 14, textes: ["Bon travail, quelques points à approfondir.", "Bonne prestation d'ensemble.", "Solide, continuez sur cette voie."] },
  { min: 12, textes: ["Correct, mais des lacunes à combler.", "Travail satisfaisant, peut encore progresser.", "Assez bien, manque de précision par moments."] },
  { min: 10, textes: ["Moyen, des efforts sont nécessaires.", "Insuffisamment approfondi, à retravailler.", "Résultat moyen, revoir certains points clés."] },
  { min: 0, textes: ["Insuffisant, revoir les bases sérieusement.", "Beaucoup de lacunes, un travail de fond est nécessaire.", "Prestation fragile, ne pas se décourager mais travailler davantage."] },
];

function noteAleatoire() {
  // Approximation d'une loi normale (somme de 3 tirages uniformes),
  // centrée ~12.5, arrondie au demi-point, bornée [2, 20] — plus réaliste
  // qu'une note uniforme sur toute l'échelle.
  const brut = ((Math.random() + Math.random() + Math.random()) / 3 - 0.5) * 10 + 12.5;
  const borne = Math.max(2, Math.min(20, brut));
  return Math.round(borne * 2) / 2;
}

function appreciationPour(valeur) {
  const tranche = APPRECIATIONS.find((t) => valeur >= t.min);
  const textes = tranche.textes;
  return textes[Math.floor(Math.random() * textes.length)];
}

async function main() {
  const passages = await prisma.passage.findMany({
    where: { note: null },
    select: { id: true, creneau: { select: { date: true } } },
  });

  console.log(`${passages.length} passage(s) sans note trouvé(s).`);

  let n = 0;
  for (const p of passages) {
    const valeur = noteAleatoire();
    await prisma.note.create({
      data: {
        passageId: p.id,
        valeur,
        appreciation: appreciationPour(valeur),
        dateSaisie: p.creneau.date,
      },
    });
    n += 1;
    if (n % 100 === 0) console.log(`${n}/${passages.length}...`);
  }

  console.log(`\n${n} note(s) créée(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
