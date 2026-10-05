// Audit rétroactif des khôlles déjà publiées : pour chaque élève ayant
// passé plusieurs khôlles le même jour, vérifie que l'écart entre deux
// khôlles consécutives respecte la marge minimale configurée (voir
// ParametresApplication.margeMinutesEntreKholles et la contrainte dure
// correspondante dans services/planning-solver/app/solver.py), et calcule
// la dispersion (écart-type/variance) de l'écart entre les deux heures de
// khôlle d'un même jour — l'indicateur que l'objectif "minimiser la
// variance" du solveur cherche à réduire, mais ici recalculé exactement sur
// des données déjà réalisées (pas une approximation CP-SAT).
//
// Comme ce planning est déjà publié, la marge n'a jamais été appliquée au
// moment de la génération (champ introduit après coup) : ce script sert
// donc à mesurer l'ampleur du problème sur l'historique, pas à le corriger.
//
// Usage (depuis la racine du projet) :
//   npx tsx scripts/detecter-chevauchements-marge.ts [classeNom] [semaine] [margeMinutes]
//
// Les trois arguments sont optionnels :
//   - classeNom      : ne garder qu'une classe (ex. "L1"). Par défaut : toutes.
//   - semaine        : ne garder qu'une semaine (ex. 41). Par défaut : toutes.
//   - margeMinutes   : marge à tester, outrepasse ParametresApplication
//                      (utile pour simuler une marge qui n'a encore jamais
//                      été enregistrée). Par défaut : la valeur enregistrée
//                      (0 si aucune n'a jamais été définie).
//
// Exemple demandé : npx tsx scripts/detecter-chevauchements-marge.ts L1 41
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function moyenne(vs: number[]): number {
  return vs.reduce((a, b) => a + b, 0) / (vs.length || 1);
}
function variance(vs: number[]): number {
  const m = moyenne(vs);
  return moyenne(vs.map((v) => (v - m) ** 2));
}

type CreneauEleve = {
  eleveId: string;
  eleveNom: string;
  elevePrenom: string;
  classeNom: string;
  semaine: number;
  disciplineNom: string;
  date: string; // "YYYY-MM-DD"
  heureDebutPreparation: string;
  heureDebut: string;
  heureFin: string;
};

async function main() {
  const [classeNomFiltre, semaineFiltreStr, margeMinutesArg] = process.argv.slice(2);
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

  const creneaux: CreneauEleve[] = passages.map((p) => ({
    eleveId: p.eleve.id,
    eleveNom: p.eleve.nom,
    elevePrenom: p.eleve.prenom,
    classeNom: p.eleve.classe.nom,
    semaine: p.creneau.sessionKholle.semaine,
    disciplineNom: p.creneau.sessionKholle.discipline.nom,
    date: p.creneau.date.toISOString().slice(0, 10),
    // Créneaux antérieurs à l'introduction du champ (nullable) : on retombe
    // sur heureDebut, comme la vérification de conflit manuelle (voir
    // src/app/api/admin/planification/creneaux/[id]/route.ts).
    heureDebutPreparation: p.creneau.heureDebutPreparation ?? p.creneau.heureDebut,
    heureDebut: p.creneau.heureDebut,
    heureFin: p.creneau.heureFin,
  }));

  const parEleveEtJour = new Map<string, CreneauEleve[]>();
  for (const c of creneaux) {
    const cle = `${c.eleveId}|${c.date}`;
    const liste = parEleveEtJour.get(cle) ?? [];
    liste.push(c);
    parEleveEtJour.set(cle, liste);
  }

  type Violation = { c: CreneauEleve; precedent: CreneauEleve; gap: number };
  const violations: Violation[] = [];
  const ecartsDeuxKholles: {
    premiere: CreneauEleve;
    deuxieme: CreneauEleve;
    ecart: number;
    // Au sens littéral de "chevauchement" sur les deux khôlles elles-mêmes
    // (hors préparation) : fin de la 1re - début de la 2e. Positif = les
    // deux khôlles se chevauchent réellement ; négatif = le nombre de
    // minutes qui les sépare, sans chevauchement.
    finPremiereMoinsDebutDeuxieme: number;
  }[] = [];

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

    // Écart "première khôlle vs deuxième" : seulement pour les jours à
    // EXACTEMENT deux khôlles (voir docstring de solver.py — au-delà de
    // deux, "la première" et "la deuxième" ne désignent plus une paire
    // unique).
    if (triee.length === 2) {
      ecartsDeuxKholles.push({
        premiere: triee[0],
        deuxieme: triee[1],
        ecart: minutes(triee[1].heureDebut) - minutes(triee[0].heureDebut),
        finPremiereMoinsDebutDeuxieme: minutes(triee[0].heureFin) - minutes(triee[1].heureDebut),
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
      "négatif = minutes d'écart sans chevauchement)"
  );
  if (ecartsDeuxKholles.length === 0) {
    console.log("Aucun élève n'a passé exactement deux khôlles le même jour sur ce périmètre.");
  } else {
    const triee = [...ecartsDeuxKholles].sort(
      (a, b) => a.premiere.date.localeCompare(b.premiere.date) || a.premiere.eleveNom.localeCompare(b.premiere.eleveNom)
    );
    for (const { premiere, deuxieme, ecart, finPremiereMoinsDebutDeuxieme } of triee) {
      console.log(
        `  ${premiere.elevePrenom} ${premiere.eleveNom} (${premiere.classeNom}, semaine ${premiere.semaine}) — ${premiere.date} : ` +
          `${premiere.disciplineNom} ${premiere.heureDebut}-${premiere.heureFin} puis ` +
          `${deuxieme.disciplineNom} ${deuxieme.heureDebut}-${deuxieme.heureFin} ` +
          `=> écart ${ecart} min ; fin1-début2 = ${finPremiereMoinsDebutDeuxieme} min`
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
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
