// Diagnostic EN LECTURE SEULE (aucune écriture) pour comprendre pourquoi
// certaines entrées de scripts/kholleurs-emails-corrects.json ne se
// rapprochent d'aucun compte KHOLLEUR en base via le rapprochement
// nom+prénom normalisés utilisé par corriger-emails-kholleurs.mjs.
//
// Pour chaque entrée non rapprochée exactement, cherche des candidats par
// NOM seul (normalisé) parmi les khôlleurs, et affiche leur prénom tel
// qu'il est réellement en base (souvent vide) — pour distinguer un simple
// prénom manquant d'un vrai nom différent (ex. doublement de nom de
// famille) ou d'une personne réellement absente de la base.
//
// Usage (depuis /root/PrepaStan sur le VPS) :
//   docker compose -f docker-compose.prod.yml exec app mkdir -p /app/prisma/tmp-import
//   docker compose -f docker-compose.prod.yml cp scripts/diagnostic-correspondance-emails.mjs app:/app/prisma/tmp-import/
//   docker compose -f docker-compose.prod.yml cp scripts/kholleurs-emails-corrects.json app:/app/prisma/tmp-import/
//   docker compose -f docker-compose.prod.yml exec app node /app/prisma/tmp-import/diagnostic-correspondance-emails.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

const REGEX_DIACRITIQUES = new RegExp("[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]", "g");
function normaliser(texte) {
  return (texte ?? "")
    .normalize("NFD")
    .replace(REGEX_DIACRITIQUES, "")
    .toLowerCase()
    .trim();
}

async function main() {
  const reference = JSON.parse(readFileSync(join(__dirname, "kholleurs-emails-corrects.json"), "utf-8"));
  const kholleurs = await prisma.utilisateur.findMany({
    where: { roles: { has: "KHOLLEUR" } },
    select: { id: true, nom: true, prenom: true, email: true },
  });

  const parNomPrenom = new Map();
  const parNomSeul = new Map();
  for (const k of kholleurs) {
    const cleComplete = `${normaliser(k.nom)}|${normaliser(k.prenom)}`;
    parNomPrenom.set(cleComplete, [...(parNomPrenom.get(cleComplete) ?? []), k]);
    const cleNom = normaliser(k.nom);
    parNomSeul.set(cleNom, [...(parNomSeul.get(cleNom) ?? []), k]);
  }

  let exact = 0;
  const prenomVideEnBase = [];
  const nomDifferent = [];
  const introuvable = [];

  for (const ref of reference) {
    const cleComplete = `${normaliser(ref.nom)}|${normaliser(ref.prenom)}`;
    if (parNomPrenom.has(cleComplete)) {
      exact++;
      continue;
    }
    const candidatsNomSeul = parNomSeul.get(normaliser(ref.nom)) ?? [];
    if (candidatsNomSeul.length > 0) {
      const tousPrenomVide = candidatsNomSeul.every((c) => !c.prenom || c.prenom.trim() === "");
      if (tousPrenomVide && candidatsNomSeul.length === 1) {
        prenomVideEnBase.push({ ref, candidat: candidatsNomSeul[0] });
      } else {
        nomDifferent.push({ ref, candidats: candidatsNomSeul });
      }
      continue;
    }

    // Nom composé/orthographe légèrement différente (ex. "BUSOT" en
    // référence vs "BUSOT-MOYA" en base) : nom exact absent, mais l'un
    // contient l'autre — à vérifier à l'oeil, jamais auto-appliqué.
    const refNomNorm = normaliser(ref.nom);
    const candidatsApprochants = kholleurs.filter((k) => {
      const kNomNorm = normaliser(k.nom);
      return kNomNorm.length > 0 && refNomNorm.length > 0 && (kNomNorm.includes(refNomNorm) || refNomNorm.includes(kNomNorm));
    });
    if (candidatsApprochants.length > 0) {
      nomDifferent.push({ ref, candidats: candidatsApprochants });
      continue;
    }

    introuvable.push(ref);
  }

  console.log(`${exact} correspondance(s) exacte(s) (nom+prénom).`);

  console.log(`\n${prenomVideEnBase.length} compte(s) avec le bon nom mais un PRÉNOM VIDE en base (candidat unique, sûr à corriger) :`);
  for (const { ref, candidat } of prenomVideEnBase) {
    console.log(`  - ${ref.prenom} ${ref.nom} -> id ${candidat.id}, email actuel ${candidat.email}`);
  }

  console.log(`\n${nomDifferent.length} nom trouvé mais situation ambiguë (plusieurs comptes, ou prénom non vide mais différent) — à vérifier à l'oeil :`);
  for (const { ref, candidats } of nomDifferent) {
    console.log(`  - Référence : ${ref.prenom} ${ref.nom} (${ref.email})`);
    for (const c of candidats) {
      console.log(`      candidat en base : nom="${c.nom}" prenom="${c.prenom}" email=${c.email} (id ${c.id})`);
    }
  }

  console.log(`\n${introuvable.length} vraiment introuvable(s) (aucun compte avec ce nom, même approximatif) :`);
  for (const r of introuvable) {
    console.log(`  - ${r.prenom} ${r.nom} (${r.email})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
