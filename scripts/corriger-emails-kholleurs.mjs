// Corrige les emails des khôlleurs en base à partir de la liste de
// référence scripts/kholleurs-emails-corrects.json (nom, prénom, email
// réel), et fusionne au passage les comptes en double détectés pour une
// même personne (même nom/prénom normalisés — typiquement : un ancien
// compte avec l'email erroné et un second compte déjà créé avec le bon
// email). La fusion transfère TOUTES les données réelles rattachées à un
// compte khôlleur (créneaux, compétences, disponibilités, référent de
// session, jobs de planification lancés, grilles validées, rappels de
// notation envoyés) vers le compte conservé, choisi comme celui ayant le
// plus de données réelles (à égalité, le plus ancien) — jamais au hasard.
//
// Rapprochement par (nom, prénom) normalisés (casse/accents ignorés) sur
// les Utilisateur ayant le rôle KHOLLEUR — PAS par email, puisque ce sont
// justement les emails à corriger. Un utilisateur non trouvé, ou un
// conflit d'email avec une personne DIFFÉRENTE (pas un doublon), est
// signalé et ignoré plutôt que traité au hasard.
//
// Mode par défaut : SIMULATION uniquement (aucune écriture), affiche le
// plan complet. Ajouter APPLY=1 pour appliquer réellement (fusions puis
// corrections d'email). Idempotent : rejouable sans risque, les comptes
// déjà fusionnés/corrigés ne réapparaissent pas dans le plan suivant.
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

async function scoreUtilisateur(id) {
  const [creneaux, competences, referents, disponibilites, sessionsReferent, jobsLances, validations] = await Promise.all([
    prisma.creneau.count({ where: { kholleurId: id } }),
    prisma.competence.count({ where: { kholleurId: id } }),
    prisma.professeurReferent.count({ where: { utilisateurId: id } }),
    prisma.disponibilite.count({ where: { kholleurId: id } }),
    prisma.sessionKholle.count({ where: { referentId: id } }),
    prisma.planificationJob.count({ where: { lanceParId: id } }),
    prisma.validationGrille.count({ where: { kholleurId: id } }),
  ]);
  return creneaux + competences + referents + disponibilites + sessionsReferent + jobsLances + validations;
}

// Transfère TOUTES les données réelles de `perdant` vers `garde`, puis
// supprime `perdant`. Doit tourner dans une transaction : si une des
// étapes échoue (ex. Eleve déjà lié des deux côtés), rien n'est appliqué.
async function fusionner(tx, garde, perdant) {
  for (const c of await tx.competence.findMany({ where: { kholleurId: perdant.id } })) {
    await tx.competence.upsert({
      where: { kholleurId_disciplineId: { kholleurId: garde.id, disciplineId: c.disciplineId } },
      update: {},
      create: { kholleurId: garde.id, disciplineId: c.disciplineId },
    });
  }
  await tx.competence.deleteMany({ where: { kholleurId: perdant.id } });

  for (const r of await tx.professeurReferent.findMany({ where: { utilisateurId: perdant.id } })) {
    await tx.professeurReferent.upsert({
      where: { classeId_disciplineId_utilisateurId: { classeId: r.classeId, disciplineId: r.disciplineId, utilisateurId: garde.id } },
      update: {},
      create: { classeId: r.classeId, disciplineId: r.disciplineId, utilisateurId: garde.id },
    });
  }
  await tx.professeurReferent.deleteMany({ where: { utilisateurId: perdant.id } });

  await tx.disponibilite.updateMany({ where: { kholleurId: perdant.id }, data: { kholleurId: garde.id } });
  await tx.creneau.updateMany({ where: { kholleurId: perdant.id }, data: { kholleurId: garde.id } });
  await tx.sessionKholle.updateMany({ where: { referentId: perdant.id }, data: { referentId: garde.id } });
  await tx.planificationJob.updateMany({ where: { lanceParId: perdant.id }, data: { lanceParId: garde.id } });

  for (const v of await tx.validationGrille.findMany({ where: { kholleurId: perdant.id } })) {
    const existeDejaChezGarde = await tx.validationGrille.findUnique({
      where: { kholleurId_sessionKholleId: { kholleurId: garde.id, sessionKholleId: v.sessionKholleId } },
    });
    if (existeDejaChezGarde) {
      await tx.validationGrille.delete({ where: { id: v.id } });
    } else {
      await tx.validationGrille.update({ where: { id: v.id }, data: { kholleurId: garde.id } });
    }
  }

  for (const r of await tx.rappelNotationEnvoye.findMany({ where: { kholleurId: perdant.id } })) {
    const existeDejaChezGarde = await tx.rappelNotationEnvoye.findUnique({
      where: { sessionKholleId_kholleurId: { sessionKholleId: r.sessionKholleId, kholleurId: garde.id } },
    });
    if (existeDejaChezGarde) {
      await tx.rappelNotationEnvoye.delete({ where: { id: r.id } });
    } else {
      await tx.rappelNotationEnvoye.update({ where: { id: r.id }, data: { kholleurId: garde.id } });
    }
  }

  const eleveLie = await tx.eleve.findUnique({ where: { utilisateurId: perdant.id } });
  if (eleveLie) {
    const gardeAUnEleve = await tx.eleve.findUnique({ where: { utilisateurId: garde.id } });
    if (gardeAUnEleve) {
      throw new Error(
        `${perdant.prenom} ${perdant.nom} (id ${perdant.id}) et ${garde.prenom} ${garde.nom} (id ${garde.id}) ont chacun un compte Élève lié — fusion impossible automatiquement.`
      );
    }
    await tx.eleve.update({ where: { utilisateurId: perdant.id }, data: { utilisateurId: garde.id } });
  }

  await tx.utilisateur.delete({ where: { id: perdant.id } });
}

async function main() {
  const reference = JSON.parse(readFileSync(join(__dirname, "kholleurs-emails-corrects.json"), "utf-8"));

  // Tous les utilisateurs (pas seulement les khôlleurs) : l'email est
  // unique sur TOUTE la table, un référent/admin/élève peut très bien
  // détenir déjà l'email cible (doublon de compte, rôles cumulés...).
  const tousLesUtilisateurs = await prisma.utilisateur.findMany({
    select: { id: true, nom: true, prenom: true, email: true },
  });
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

  let dejaCorrect = 0;
  const nonTrouves = [];
  const conflits = [];
  const fusions = []; // { ref, garde, perdants: [...] }
  const aAppliquer = []; // { utilisateur, emailAvant, emailApres }

  for (const ref of reference) {
    const cle = `${normaliser(ref.nom)}|${normaliser(ref.prenom)}`;
    let candidats = parCle.get(cle) ?? [];

    if (candidats.length === 0) {
      nonTrouves.push(ref);
      continue;
    }

    // Doublons détectés directement (plusieurs comptes KHOLLEUR pour le
    // même nom/prénom) : décidés par score de données réelles ci-dessous,
    // avec les autres candidats comme "perdants" à fusionner.
    let garde = candidats[0];
    let perdants = candidats.slice(1);

    // Doublon détecté indirectement : l'email cible est déjà détenu par
    // quelqu'un du même nom/prénom (compte pas forcément marqué KHOLLEUR,
    // ex. rôle référent uniquement) — même logique de fusion.
    const autrePorteur = tousLesUtilisateurs.find(
      (u) => !candidats.some((c) => c.id === u.id) && u.email.toLowerCase() === ref.email.toLowerCase()
    );
    if (autrePorteur) {
      const memePersonne = normaliser(autrePorteur.nom) === normaliser(ref.nom) && normaliser(autrePorteur.prenom) === normaliser(ref.prenom);
      if (memePersonne) {
        perdants = [...perdants, autrePorteur];
      } else {
        conflits.push({ ref, garde, autrePorteur });
        continue;
      }
    }

    if (perdants.length > 0) {
      const scores = await Promise.all([garde, ...perdants].map((u) => scoreUtilisateur(u.id)));
      let meilleurIndex = 0;
      for (let i = 1; i < scores.length; i++) {
        if (scores[i] > scores[meilleurIndex]) meilleurIndex = i;
      }
      const tous = [garde, ...perdants];
      garde = tous[meilleurIndex];
      perdants = tous.filter((_, i) => i !== meilleurIndex);
      fusions.push({ ref, garde, perdants, scores: tous.map((u, i) => ({ utilisateur: u, score: scores[i] })) });
    }

    if (garde.email.toLowerCase() === ref.email.toLowerCase()) {
      dejaCorrect++;
      continue;
    }
    aAppliquer.push({ utilisateur: garde, emailAvant: garde.email, emailApres: ref.email });
  }

  console.log(`=== Plan (${APPLY ? "APPLICATION RÉELLE" : "SIMULATION — aucune écriture"}) ===\n`);

  if (fusions.length > 0) {
    console.log(`--- ${fusions.length} fusion(s) de comptes en double ---`);
    for (const { ref, garde, perdants, scores } of fusions) {
      console.log(
        `${ref.prenom} ${ref.nom} : garde ${garde.email} (id ${garde.id}, score ${scores.find((s) => s.utilisateur.id === garde.id).score}), ` +
          `fusionne ${perdants.map((p) => `${p.email} (id ${p.id}, score ${scores.find((s) => s.utilisateur.id === p.id).score})`).join(", ")}`
      );
    }
    console.log();
  }

  console.log(`--- Corrections d'email ---`);
  for (const { utilisateur, emailAvant, emailApres } of aAppliquer) {
    console.log(`${utilisateur.prenom} ${utilisateur.nom} : ${emailAvant}  ->  ${emailApres}`);
  }
  console.log(`\n${aAppliquer.length} email(s) à corriger, ${dejaCorrect} déjà correct(s).`);

  if (nonTrouves.length > 0) {
    console.log(`\n${nonTrouves.length} khôlleur(s) de la liste introuvable(s) en base (nom/prénom sans correspondance) :`);
    for (const r of nonTrouves) console.log(`  - ${r.prenom} ${r.nom} (${r.email})`);
  }
  if (conflits.length > 0) {
    console.log(`\n${conflits.length} conflit(s) d'email avec une personne DIFFÉRENTE — à traiter manuellement :`);
    for (const { ref, garde, autrePorteur } of conflits) {
      console.log(`  - ${ref.prenom} ${ref.nom} (id ${garde.id}) vers ${ref.email}, déjà porté par ${autrePorteur.prenom} ${autrePorteur.nom} (id ${autrePorteur.id})`);
    }
  }

  if (!APPLY) {
    console.log("\nAucune écriture effectuée (mode simulation). Relancer avec APPLY=1 pour appliquer ce plan.");
    return;
  }

  for (const { garde, perdants } of fusions) {
    for (const perdant of perdants) {
      await prisma.$transaction((tx) => fusionner(tx, garde, perdant));
    }
  }

  // Écriture en deux temps : d'abord un email temporaire unique pour
  // chaque compte corrigé (libère les emails cibles qui seraient encore
  // détenus par un autre compte lui-même en cours de correction), puis
  // l'email final — jamais de collision possible avec la contrainte
  // unique, quel que soit l'ordre ou les chaînes entre corrections.
  for (const { utilisateur } of aAppliquer) {
    await prisma.utilisateur.update({
      where: { id: utilisateur.id },
      data: { email: `tmp-correction-${utilisateur.id}@invalid.local` },
    });
  }
  for (const { utilisateur, emailApres } of aAppliquer) {
    await prisma.utilisateur.update({ where: { id: utilisateur.id }, data: { email: emailApres } });
  }
  console.log(`\n${fusions.length} fusion(s) et ${aAppliquer.length} email(s) corrigé(s) en base.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
