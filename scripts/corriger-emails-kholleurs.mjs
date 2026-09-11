// Corrige les emails des khôlleurs en base à partir de la liste de
// référence scripts/kholleurs-emails-corrects.json (nom, prénom, email
// réel), pour remplacer des emails erronés actuellement en base.
//
// Rapprochement par (nom, prénom) normalisés (casse/accents ignorés) sur
// les Utilisateur ayant le rôle KHOLLEUR — PAS par email, puisque ce sont
// justement les emails à corriger. Un utilisateur non trouvé, trouvé en
// double (ambigu), ou dont l'email cible est déjà utilisé par quelqu'un
// d'autre (contrainte unique) est signalé et ignoré plutôt que corrigé au
// hasard.
//
// Mode par défaut : SIMULATION uniquement (aucune écriture), affiche le
// plan complet. Ajouter APPLY=1 pour appliquer réellement les correctifs.
//
// Usage (depuis /root/PrepaStan sur le VPS, DATABASE_URL déjà positionné
// sur la base concernée — prod ou démo selon le conteneur ciblé) :
//   docker compose -f docker-compose.prod.yml exec app mkdir -p /app/prisma/tmp-import
//   docker compose -f docker-compose.prod.yml cp scripts/corriger-emails-kholleurs.mjs app:/app/prisma/tmp-import/
//   docker compose -f docker-compose.prod.yml cp scripts/kholleurs-emails-corrects.json app:/app/prisma/tmp-import/
//   docker compose -f docker-compose.prod.yml exec app node /app/prisma/tmp-import/corriger-emails-kholleurs.mjs
//   # Après vérification du plan affiché :
//   docker compose -f docker-compose.prod.yml exec -e APPLY=1 app node /app/prisma/tmp-import/corriger-emails-kholleurs.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

const REGEX_DIACRITIQUES = new RegExp("[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]", "g");
function normaliser(texte) {
  return texte
    .normalize("NFD")
    .replace(REGEX_DIACRITIQUES, "")
    .toLowerCase()
    .trim();
}

const APPLY = process.env.APPLY === "1";

async function main() {
  const reference = JSON.parse(readFileSync(join(__dirname, "kholleurs-emails-corrects.json"), "utf-8"));

  const kholleurs = await prisma.utilisateur.findMany({
    where: { roles: { has: "KHOLLEUR" } },
    select: { id: true, nom: true, prenom: true, email: true },
  });

  const parCle = new Map();
  for (const k of kholleurs) {
    const cle = `${normaliser(k.nom)}|${normaliser(k.prenom)}`;
    const liste = parCle.get(cle) ?? [];
    liste.push(k);
    parCle.set(cle, liste);
  }

  let aCorreger = 0;
  let dejaCorrect = 0;
  const nonTrouves = [];
  const ambigus = [];
  const conflits = [];
  const aAppliquer = [];

  for (const ref of reference) {
    const cle = `${normaliser(ref.nom)}|${normaliser(ref.prenom)}`;
    const candidats = parCle.get(cle) ?? [];

    if (candidats.length === 0) {
      nonTrouves.push(ref);
      continue;
    }
    if (candidats.length > 1) {
      ambigus.push({ ref, candidats });
      continue;
    }

    const utilisateur = candidats[0];
    if (utilisateur.email.toLowerCase() === ref.email.toLowerCase()) {
      dejaCorrect++;
      continue;
    }

    // L'email cible appartient déjà à un AUTRE utilisateur (contrainte
    // unique) : on ne peut pas écraser sans risquer de casser ce compte-là.
    const autrePorteur = kholleurs.find(
      (k) => k.id !== utilisateur.id && k.email.toLowerCase() === ref.email.toLowerCase()
    );
    if (autrePorteur) {
      conflits.push({ ref, utilisateur, autrePorteur });
      continue;
    }

    aCorreger++;
    aAppliquer.push({ utilisateur, emailAvant: utilisateur.email, emailApres: ref.email });
  }

  console.log(`=== Plan (${APPLY ? "APPLICATION RÉELLE" : "SIMULATION — aucune écriture"}) ===\n`);
  for (const { utilisateur, emailAvant, emailApres } of aAppliquer) {
    console.log(`${utilisateur.prenom} ${utilisateur.nom} : ${emailAvant}  ->  ${emailApres}`);
  }
  console.log(`\n${aCorreger} email(s) à corriger, ${dejaCorrect} déjà correct(s).`);

  if (nonTrouves.length > 0) {
    console.log(`\n${nonTrouves.length} khôlleur(s) de la liste introuvable(s) en base (nom/prénom sans correspondance) :`);
    for (const r of nonTrouves) console.log(`  - ${r.prenom} ${r.nom} (${r.email})`);
  }
  if (ambigus.length > 0) {
    console.log(`\n${ambigus.length} correspondance(s) ambiguë(s) (plusieurs comptes même nom/prénom) — à traiter manuellement :`);
    for (const { ref, candidats } of ambigus) {
      console.log(`  - ${ref.prenom} ${ref.nom} : ${candidats.map((c) => `${c.email} (id ${c.id})`).join(", ")}`);
    }
  }
  if (conflits.length > 0) {
    console.log(`\n${conflits.length} conflit(s) d'email (email cible déjà utilisé par un autre compte) — à traiter manuellement :`);
    for (const { ref, utilisateur, autrePorteur } of conflits) {
      console.log(
        `  - ${ref.prenom} ${ref.nom} (id ${utilisateur.id}) vers ${ref.email}, déjà porté par ${autrePorteur.prenom} ${autrePorteur.nom} (id ${autrePorteur.id})`
      );
    }
  }

  if (!APPLY) {
    console.log("\nAucune écriture effectuée (mode simulation). Relancer avec APPLY=1 pour appliquer ce plan.");
    return;
  }

  for (const { utilisateur, emailApres } of aAppliquer) {
    await prisma.utilisateur.update({ where: { id: utilisateur.id }, data: { email: emailApres } });
  }
  console.log(`\n${aAppliquer.length} email(s) corrigé(s) en base.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
