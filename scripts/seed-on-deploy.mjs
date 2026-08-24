// Exécuté après le build sur Vercel (voir le script "vercel-build"). Le
// seed n'est lancé que si la variable d'environnement RUN_SEED=1 est
// définie, pour ne jamais l'exécuter par accident sur un déploiement qui
// contiendrait déjà de vraies données. Le seed lui-même est idempotent
// (upserts), donc le laisser activé pendant la phase de test ne duplique
// rien d'un déploiement à l'autre.
import { spawnSync } from "node:child_process";

if (process.env.RUN_SEED !== "1") {
  console.log("RUN_SEED non défini à 1 : seed ignoré.");
  process.exit(0);
}

console.log("RUN_SEED=1 : exécution du jeu de données de démonstration...");
const result = spawnSync("npx", ["tsx", "prisma/seed.ts"], { stdio: "inherit" });
process.exit(result.status ?? 1);
