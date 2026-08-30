// Statistiques de vérification sur les plannings L1/L2 générés par
// scripts/planning-historique-importer.ts : équirépartition des horaires de
// passage, diversité des khôlleurs vus par élève, et alternance LV1/LV2
// semaine après semaine (L1 uniquement, élèves ayant une LV1 ET une LV2).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function moyenne(vs: number[]): number {
  return vs.reduce((a, b) => a + b, 0) / (vs.length || 1);
}
function ecartType(vs: number[]): number {
  const m = moyenne(vs);
  return Math.sqrt(moyenne(vs.map((v) => (v - m) ** 2)));
}
function stats(vs: number[], label: string) {
  if (vs.length === 0) {
    console.log(`  ${label} : aucune donnée`);
    return;
  }
  console.log(
    `  ${label} : moyenne=${moyenne(vs).toFixed(2)}  écart-type=${ecartType(vs).toFixed(2)}  ` +
      `min=${Math.min(...vs)}  max=${Math.max(...vs)}  (n=${vs.length})`
  );
}

const SEUIL_TARDIF = "17:00";

async function main() {
  const passages = await prisma.passage.findMany({
    where: { eleve: { classe: { nom: { in: ["L1", "L2"] } } }, creneau: { sessionKholle: { statut: { not: "PLANIFICATION" } } } },
    include: {
      eleve: {
        select: {
          id: true,
          nom: true,
          prenom: true,
          lv1Id: true,
          lv2Id: true,
          classe: { select: { nom: true } },
        },
      },
      creneau: {
        select: {
          heureDebut: true,
          kholleurId: true,
          date: true,
          sessionKholle: {
            select: { disciplineId: true, semaine: true, discipline: { select: { nom: true, estLangueVivante: true } } },
          },
        },
      },
    },
  });

  console.log(`${passages.length} passages au total (L1+L2, hors brouillons).\n`);

  // ---------- 1. Équirépartition des horaires de passage ----------
  console.log("=== 1. Équirépartition des heures de passage ===");
  console.log("(nombre de créneaux tardifs >= 17h reçus par élève sur toute la période)");
  for (const classeNom of ["L1", "L2"]) {
    const parEleve = new Map<string, number>();
    const totalParEleve = new Map<string, number>();
    for (const p of passages) {
      if (p.eleve.classe.nom !== classeNom) continue;
      totalParEleve.set(p.eleve.id, (totalParEleve.get(p.eleve.id) ?? 0) + 1);
      if (p.creneau.heureDebut >= SEUIL_TARDIF) {
        parEleve.set(p.eleve.id, (parEleve.get(p.eleve.id) ?? 0) + 1);
      }
    }
    const valeurs = [...totalParEleve.keys()].map((id) => parEleve.get(id) ?? 0);
    stats(valeurs, `${classeNom} — créneaux tardifs par élève`);
  }

  // ---------- 2. Diversité des khôlleurs vus par élève ----------
  console.log("\n=== 2. Diversité des khôlleurs par élève (par discipline) ===");
  console.log("(taux = nb khôlleurs distincts / nb passages ; 1.00 = jamais deux fois le même,");
  console.log(" uniquement pour les couples élève/discipline avec au moins 2 passages)");
  for (const classeNom of ["L1", "L2"]) {
    const parEleveDiscipline = new Map<string, Set<string>>();
    const compteParEleveDiscipline = new Map<string, number>();
    for (const p of passages) {
      if (p.eleve.classe.nom !== classeNom) continue;
      const cle = `${p.eleve.id}|${p.creneau.sessionKholle.disciplineId}`;
      const set = parEleveDiscipline.get(cle) ?? new Set<string>();
      set.add(p.creneau.kholleurId);
      parEleveDiscipline.set(cle, set);
      compteParEleveDiscipline.set(cle, (compteParEleveDiscipline.get(cle) ?? 0) + 1);
    }
    const taux: number[] = [];
    for (const [cle, total] of compteParEleveDiscipline) {
      if (total < 2) continue;
      taux.push(parEleveDiscipline.get(cle)!.size / total);
    }
    stats(taux, `${classeNom} — taux de diversité khôlleur/discipline`);
  }

  // ---------- 3. Alternance LV1/LV2 (L1 uniquement) ----------
  console.log("\n=== 3. Alternance LV1/LV2 semaine après semaine (L1) ===");
  const elevesLV = new Map<string, { lv1: string; lv2: string; nom: string; prenom: string }>();
  for (const p of passages) {
    if (p.eleve.classe.nom !== "L1" || !p.eleve.lv1Id || !p.eleve.lv2Id) continue;
    elevesLV.set(p.eleve.id, { lv1: p.eleve.lv1Id, lv2: p.eleve.lv2Id, nom: p.eleve.nom, prenom: p.eleve.prenom });
  }
  const passagesLangueParEleve = new Map<string, { date: Date; semaine: number; type: "LV1" | "LV2" }[]>();
  // Pour chaque semaine, quelles disciplines "langue" ont été khôllées cette
  // semaine-là dans la classe (tous élèves confondus) : nécessaire pour
  // distinguer une répétition "forcée" (une seule langue proposée cette
  // semaine, aucun choix possible) d'une répétition évitable (les deux
  // étaient proposées et le solveur a quand même reproduit le même type).
  const disciplinesOffertesParSemaine = new Map<number, Set<string>>();
  for (const p of passages) {
    if (p.eleve.classe.nom !== "L1" || !p.creneau.sessionKholle.discipline.estLangueVivante) continue;
    const semaine = p.creneau.sessionKholle.semaine;
    const set = disciplinesOffertesParSemaine.get(semaine) ?? new Set<string>();
    set.add(p.creneau.sessionKholle.disciplineId);
    disciplinesOffertesParSemaine.set(semaine, set);
  }

  for (const p of passages) {
    const info = elevesLV.get(p.eleve.id);
    if (!info) continue;
    const disciplineId = p.creneau.sessionKholle.disciplineId;
    if (disciplineId !== info.lv1 && disciplineId !== info.lv2) continue;
    const type = disciplineId === info.lv1 ? "LV1" : "LV2";
    const liste = passagesLangueParEleve.get(p.eleve.id) ?? [];
    liste.push({ date: p.creneau.date, semaine: p.creneau.sessionKholle.semaine, type });
    passagesLangueParEleve.set(p.eleve.id, liste);
  }

  let transitions = 0;
  let alternees = 0;
  let repeteesForcees = 0; // une seule langue offerte cette semaine-là : pas un vrai choix
  let repeteesEvitables = 0; // les deux étaient offertes : véritable manquement à l'alternance
  const detailParEleve: { nom: string; sequence: string; repeteesEvitables: number }[] = [];
  for (const [eleveId, liste] of passagesLangueParEleve) {
    const info = elevesLV.get(eleveId)!;
    const triee = [...liste].sort((a, b) => a.date.getTime() - b.date.getTime());
    let repeteesEvitablesEleve = 0;
    for (let i = 1; i < triee.length; i++) {
      transitions++;
      if (triee[i].type !== triee[i - 1].type) {
        alternees++;
        continue;
      }
      const offertes = disciplinesOffertesParSemaine.get(triee[i].semaine) ?? new Set();
      const choixPossible = offertes.has(info.lv1) && offertes.has(info.lv2);
      if (choixPossible) {
        repeteesEvitables++;
        repeteesEvitablesEleve++;
      } else {
        repeteesForcees++;
      }
    }
    detailParEleve.push({
      nom: `${info.prenom} ${info.nom}`,
      sequence: triee.map((t) => `${t.type}(S${t.semaine})`).join(" → "),
      repeteesEvitables: repeteesEvitablesEleve,
    });
  }

  console.log(`${passagesLangueParEleve.size} élève(s) L1 avec LV1+LV2 ayant passé au moins une langue.`);
  console.log(`${transitions} transition(s) semaine-à-semaine observée(s) au total :`);
  console.log(`  alternées (LV1<->LV2)         : ${alternees} (${((alternees / (transitions || 1)) * 100).toFixed(1)}%)`);
  console.log(
    `  répétées mais FORCÉES (pas de choix cette semaine-là) : ${repeteesForcees} ` +
      `(${((repeteesForcees / (transitions || 1)) * 100).toFixed(1)}%)`
  );
  console.log(
    `  répétées ÉVITABLES (les deux langues étaient proposées) : ${repeteesEvitables} ` +
      `(${((repeteesEvitables / (transitions || 1)) * 100).toFixed(1)}%)`
  );
  console.log(
    `\n=> Sur les transitions où un vrai choix existait (${alternees + repeteesEvitables}), ` +
      `${(((alternees) / (alternees + repeteesEvitables || 1)) * 100).toFixed(1)}% ont correctement alterné.`
  );

  const elevesAvecRepetitionEvitable = detailParEleve.filter((d) => d.repeteesEvitables > 0);
  if (elevesAvecRepetitionEvitable.length > 0) {
    console.log(`\nÉlèves ayant eu une répétition ÉVITABLE (${elevesAvecRepetitionEvitable.length}) :`);
    for (const d of elevesAvecRepetitionEvitable) {
      console.log(`  ${d.nom} : ${d.sequence}`);
    }
  } else {
    console.log("\nAucune répétition évitable : quand un choix existait, l'alternance a toujours été respectée.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
