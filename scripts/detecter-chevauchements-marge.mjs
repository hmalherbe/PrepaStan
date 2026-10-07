// Équivalent JS pur de detecter-chevauchements-marge.ts, pour exécution
// directe dans un conteneur app/app-demo de production : l'image ne contient
// pas tsx/typescript (devDependencies, absentes du build "standalone"), et
// `npx tsx` n'a pas d'accès réseau en écriture pour s'auto-installer
// (EACCES sur /home/nextjs). Comme pour scripts/copy-roster-to-demo.mjs, on
// passe donc ce fichier par l'entrée standard du process node déjà présent
// dans le conteneur, depuis le checkout git sur l'hôte :
//
//   docker compose -f docker-compose.demo.yml exec -T \
//     -e CLASSE=L2 -e SEMAINE=46 \
//     app-demo node < scripts/detecter-chevauchements-marge.mjs
//
// (remplacer -f docker-compose.demo.yml / app-demo par -f
// docker-compose.prod.yml / app pour la prod)
//
// Filtres, tous optionnels, via variables d'environnement :
//   - CLASSE        : ne garder qu'une classe (ex. "L2"). Par défaut : toutes.
//   - SEMAINE        : ne garder qu'une semaine (ex. 46). Par défaut : toutes.
//   - MARGE_MINUTES  : marge à tester, outrepasse ParametresApplication.
//
// Garder ce fichier synchronisé avec la version .ts (seule différence :
// pas d'annotations de type, et filtres lus depuis l'environnement plutôt
// que process.argv puisque ce dernier n'est pas accessible en mode stdin).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function minutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function moyenne(vs) {
  return vs.reduce((a, b) => a + b, 0) / (vs.length || 1);
}
function variance(vs) {
  const m = moyenne(vs);
  return moyenne(vs.map((v) => (v - m) ** 2));
}

async function main() {
  const classeNomFiltre = process.env.CLASSE || undefined;
  const semaineFiltreStr = process.env.SEMAINE || undefined;
  const margeMinutesArg = process.env.MARGE_MINUTES;
  const semaineFiltre = semaineFiltreStr ? Number(semaineFiltreStr) : undefined;

  const parametres = await prisma.parametresApplication.findUnique({ where: { id: "singleton" } });
  const marge = margeMinutesArg !== undefined ? Number(margeMinutesArg) : parametres?.margeMinutesEntreKholles ?? 0;

  const passages = await prisma.passage.findMany({
    where: {
      creneau: {
        sessionKholle: {
          statut: { not: "PLANIFICATION" }, // sessions déjà publiées/passées uniquement
          ...(classeNomFiltre ? { classe: { nom: classeNomFiltre } } : {}),
          ...(semaineFiltre !== undefined ? { semaine: semaineFiltre } : {}),
        },
      },
    },
    include: {
      eleve: { select: { id: true, nom: true, prenom: true, classe: { select: { nom: true } } } },
      creneau: {
        select: {
          date: true,
          heureDebutPreparation: true,
          heureDebut: true,
          heureFin: true,
          sessionKholle: { select: { semaine: true, discipline: { select: { nom: true } } } },
        },
      },
    },
  });

  if (passages.length === 0) {
    console.log("Aucune khôlle publiée ne correspond aux filtres demandés.");
    return;
  }

  const creneaux = passages.map((p) => ({
    eleveId: p.eleve.id,
    eleveNom: p.eleve.nom,
    elevePrenom: p.eleve.prenom,
    classeNom: p.eleve.classe.nom,
    semaine: p.creneau.sessionKholle.semaine,
    disciplineNom: p.creneau.sessionKholle.discipline.nom,
    date: p.creneau.date.toISOString().slice(0, 10),
    heureDebutPreparation: p.creneau.heureDebutPreparation ?? p.creneau.heureDebut,
    heureDebut: p.creneau.heureDebut,
    heureFin: p.creneau.heureFin,
  }));

  const parEleveEtJour = new Map();
  for (const c of creneaux) {
    const cle = `${c.eleveId}|${c.date}`;
    const liste = parEleveEtJour.get(cle) ?? [];
    liste.push(c);
    parEleveEtJour.set(cle, liste);
  }

  const violations = [];
  const ecartsDeuxKholles = [];

  for (const liste of parEleveEtJour.values()) {
    if (liste.length < 2) continue;
    const triee = [...liste].sort((a, b) => minutes(a.heureDebut) - minutes(b.heureDebut));

    for (let i = 1; i < triee.length; i++) {
      const precedent = triee[i - 1];
      const courant = triee[i];
      const gap = minutes(courant.heureDebutPreparation) - minutes(precedent.heureFin);
      if (gap < marge) {
        violations.push({ c: courant, precedent, gap });
      }
    }

    if (triee.length === 2) {
      ecartsDeuxKholles.push({
        premiere: triee[0],
        deuxieme: triee[1],
        ecart: minutes(triee[1].heureDebut) - minutes(triee[0].heureDebut),
        finPremiereMoinsDebutDeuxieme: minutes(triee[0].heureFin) - minutes(triee[1].heureDebut),
        debutPreparationDeuxiemeMoinsFinPremiere:
          minutes(triee[1].heureDebutPreparation) - minutes(triee[0].heureFin),
      });
    }
  }

  console.log(
    `Analyse : ${creneaux.length} passage(s) publié(s)` +
      (classeNomFiltre ? `, classe ${classeNomFiltre}` : "") +
      (semaineFiltre !== undefined ? `, semaine ${semaineFiltre}` : "") +
      ` — marge testée : ${marge} min.\n`
  );

  console.log(`=== Violations de la marge minimale (${marge} min) ===`);
  if (violations.length === 0) {
    console.log("Aucune violation détectée.");
  } else {
    violations.sort((a, b) => a.c.date.localeCompare(b.c.date) || a.c.eleveNom.localeCompare(b.c.eleveNom));
    for (const { c, precedent, gap } of violations) {
      console.log(
        `  ${c.elevePrenom} ${c.eleveNom} (${c.classeNom}, semaine ${c.semaine}) — ${c.date} : ` +
          `${precedent.disciplineNom} ${precedent.heureDebut}-${precedent.heureFin} puis ` +
          `${c.disciplineNom} ${c.heureDebut}-${c.heureFin} (préparation dès ${c.heureDebutPreparation}) ` +
          `=> écart réel ${gap} min < marge requise ${marge} min`
      );
    }
    console.log(`\n${violations.length} violation(s) sur ${parEleveEtJour.size} jour(s) élève à 2+ khôlles.`);
  }

  console.log("\n=== Écart entre les deux heures de khôlle d'un même jour, par étudiant ===");
  console.log(
    "(jours à exactement 2 khôlles ; écart = heureDebut 2e - heureDebut 1re ; " +
      "fin1-début2 = heureFin de la 1re - heureDebut de la 2e : positif = chevauchement réel des khôlles elles-mêmes, " +
      "négatif = minutes d'écart sans chevauchement ; " +
      "débutPrép2-fin1 = heureDebutPreparation de la 2e - heureFin de la 1re : positif = marge réelle avant que " +
      "la préparation de la 2e démarre, négatif = chevauchement avec la préparation)"
  );
  if (ecartsDeuxKholles.length === 0) {
    console.log("Aucun élève n'a passé exactement deux khôlles le même jour sur ce périmètre.");
  } else {
    const triee = [...ecartsDeuxKholles].sort(
      (a, b) => a.premiere.date.localeCompare(b.premiere.date) || a.premiere.eleveNom.localeCompare(b.premiere.eleveNom)
    );
    for (const {
      premiere,
      deuxieme,
      ecart,
      finPremiereMoinsDebutDeuxieme,
      debutPreparationDeuxiemeMoinsFinPremiere,
    } of triee) {
      console.log(
        `  ${premiere.elevePrenom} ${premiere.eleveNom} (${premiere.classeNom}, semaine ${premiere.semaine}) — ${premiere.date} : ` +
          `${premiere.disciplineNom} ${premiere.heureDebut}-${premiere.heureFin} puis ` +
          `${deuxieme.disciplineNom} (préparation dès ${deuxieme.heureDebutPreparation}) ${deuxieme.heureDebut}-${deuxieme.heureFin} ` +
          `=> écart ${ecart} min ; fin1-début2 = ${finPremiereMoinsDebutDeuxieme} min ; ` +
          `débutPrép2-fin1 = ${debutPreparationDeuxiemeMoinsFinPremiere} min`
      );
    }

    const valeurs = ecartsDeuxKholles.map((e) => e.ecart);
    const m = moyenne(valeurs);
    const v = variance(valeurs);
    console.log(
      `\n  n=${valeurs.length}  moyenne=${m.toFixed(1)} min  écart-type=${Math.sqrt(v).toFixed(1)} min  ` +
        `variance=${v.toFixed(1)}  min=${Math.min(...valeurs)}  max=${Math.max(...valeurs)}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
