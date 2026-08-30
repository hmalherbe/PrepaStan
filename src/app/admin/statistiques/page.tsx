import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatistiquesView } from "@/components/admin/StatistiquesView";

// Même calcul que rangHoraire() dans jobs/route.ts et _rang_horaire() côté
// solveur (solver.py) : un nombre d'autant plus élevé que le créneau
// commence tard dans la journée, pour donner un score comparable d'une
// discipline/semaine à l'autre plutôt qu'un simple seuil "tardif".
function rangHoraire(heureDebut: string): number {
  return Number(heureDebut.split(":")[0]);
}

function moyenne(vs: number[]): number {
  return vs.reduce((a, b) => a + b, 0) / (vs.length || 1);
}

function ecartType(vs: number[]): number {
  const m = moyenne(vs);
  return Math.sqrt(moyenne(vs.map((v) => (v - m) ** 2)));
}

export default async function StatistiquesPage({
  searchParams,
}: {
  searchParams: Promise<{ classeId?: string }>;
}) {
  await requirePageSession(["ADMIN"]);
  const { classeId: classeIdParam } = await searchParams;

  const classes = await prisma.classe.findMany({ orderBy: { nom: "asc" } });
  const classe = classeIdParam ? classes.find((c) => c.id === classeIdParam) : classes[0];

  if (!classe) {
    return (
      <main className="container">
        <h1>Statistiques</h1>
        <p>Aucune classe créée pour le moment.</p>
      </main>
    );
  }

  const passages = await prisma.passage.findMany({
    where: {
      eleve: { classeId: classe.id },
      creneau: { sessionKholle: { statut: { not: "PLANIFICATION" } } },
    },
    select: {
      eleveId: true,
      eleve: { select: { nom: true, prenom: true, lv1Id: true, lv2Id: true } },
      creneau: {
        select: {
          heureDebut: true,
          kholleurId: true,
          kholleur: { select: { nom: true, prenom: true } },
          date: true,
          sessionKholle: {
            select: { semaine: true, disciplineId: true, discipline: { select: { nom: true, estLangueVivante: true } } },
          },
        },
      },
    },
  });

  // ---------- Élève × Khôlleur × Discipline (nb de passages) ----------
  const cleParTrio = new Map<
    string,
    { eleveNom: string; kholleurNom: string; disciplineNom: string; nbPassages: number }
  >();
  for (const p of passages) {
    const cle = `${p.eleveId}|${p.creneau.kholleurId}|${p.creneau.sessionKholle.disciplineId}`;
    const existant = cleParTrio.get(cle);
    if (existant) {
      existant.nbPassages++;
    } else {
      cleParTrio.set(cle, {
        eleveNom: `${p.eleve.prenom} ${p.eleve.nom}`,
        kholleurNom: `${p.creneau.kholleur.prenom} ${p.creneau.kholleur.nom}`,
        disciplineNom: p.creneau.sessionKholle.discipline.nom,
        nbPassages: 1,
      });
    }
  }
  const detailEleveKholleur = [...cleParTrio.values()].sort((a, b) => a.eleveNom.localeCompare(b.eleveNom));

  // ---------- Score horaire moyen par élève ----------
  const rangsParEleve = new Map<string, { nom: string; rangs: number[] }>();
  for (const p of passages) {
    const entry = rangsParEleve.get(p.eleveId) ?? { nom: `${p.eleve.prenom} ${p.eleve.nom}`, rangs: [] };
    entry.rangs.push(rangHoraire(p.creneau.heureDebut));
    rangsParEleve.set(p.eleveId, entry);
  }
  const scoreParEleve = [...rangsParEleve.entries()]
    .map(([id, { nom, rangs }]) => ({
      id,
      nom,
      moyenne: moyenne(rangs),
      nbPassages: rangs.length,
    }))
    .sort((a, b) => b.moyenne - a.moyenne);
  // Écart-type entre élèves : plus il est bas, plus les heures de passage
  // sont réparties de façon homogène d'un élève à l'autre sur l'année.
  const ecartTypeScoreHoraire = ecartType(scoreParEleve.map((s) => s.moyenne));

  // ---------- Charge par khôlleur (nombre de créneaux) ----------
  const chargeParKholleur = new Map<string, { nom: string; nbCreneaux: number }>();
  for (const p of passages) {
    const entry = chargeParKholleur.get(p.creneau.kholleurId) ?? {
      nom: `${p.creneau.kholleur.prenom} ${p.creneau.kholleur.nom}`,
      nbCreneaux: 0,
    };
    entry.nbCreneaux++;
    chargeParKholleur.set(p.creneau.kholleurId, entry);
  }
  const chargeKholleurs = [...chargeParKholleur.values()].sort((a, b) => b.nbCreneaux - a.nbCreneaux);

  // ---------- Diversité des khôlleurs par discipline ----------
  const parEleveDiscipline = new Map<string, Set<string>>();
  const compteParEleveDiscipline = new Map<string, number>();
  const disciplineParCle = new Map<string, string>();
  for (const p of passages) {
    const cle = `${p.eleveId}|${p.creneau.sessionKholle.disciplineId}`;
    const set = parEleveDiscipline.get(cle) ?? new Set<string>();
    set.add(p.creneau.kholleurId);
    parEleveDiscipline.set(cle, set);
    compteParEleveDiscipline.set(cle, (compteParEleveDiscipline.get(cle) ?? 0) + 1);
    disciplineParCle.set(cle, p.creneau.sessionKholle.discipline.nom);
  }
  const tauxParDiscipline = new Map<string, number[]>();
  for (const [cle, total] of compteParEleveDiscipline) {
    if (total < 2) continue;
    const discipline = disciplineParCle.get(cle)!;
    const taux = parEleveDiscipline.get(cle)!.size / total;
    const liste = tauxParDiscipline.get(discipline) ?? [];
    liste.push(taux);
    tauxParDiscipline.set(discipline, liste);
  }
  const diversiteDisciplines = [...tauxParDiscipline.entries()]
    .map(([discipline, taux]) => ({
      discipline,
      // Écart-type calculé sur les taux individuels élève par élève (pas sur
      // la moyenne des disciplines) : indique si la diversité des khôlleurs
      // est homogène entre élèves dans cette discipline, ou si certains sont
      // nettement moins bien lotis que d'autres.
      tauxMoyen: moyenne(taux),
      ecartType: ecartType(taux),
    }))
    .sort((a, b) => a.tauxMoyen - b.tauxMoyen);

  // ---------- Alternance LV1/LV2 (uniquement pour les élèves avec LV1+LV2) ----------
  const elevesLV = new Map<string, { lv1: string; lv2: string }>();
  for (const p of passages) {
    if (!p.eleve.lv1Id || !p.eleve.lv2Id) continue;
    elevesLV.set(p.eleveId, { lv1: p.eleve.lv1Id, lv2: p.eleve.lv2Id });
  }
  let alternance: { pourcentage: number; alternees: number; total: number } | null = null;
  if (elevesLV.size > 0) {
    const passagesLangueParEleve = new Map<string, { date: Date; type: "LV1" | "LV2" }[]>();
    for (const p of passages) {
      const info = elevesLV.get(p.eleveId);
      if (!info) continue;
      const disciplineId = p.creneau.sessionKholle.disciplineId;
      if (disciplineId !== info.lv1 && disciplineId !== info.lv2) continue;
      const liste = passagesLangueParEleve.get(p.eleveId) ?? [];
      liste.push({ date: p.creneau.date, type: disciplineId === info.lv1 ? "LV1" : "LV2" });
      passagesLangueParEleve.set(p.eleveId, liste);
    }
    let alternees = 0;
    let total = 0;
    for (const liste of passagesLangueParEleve.values()) {
      const triee = [...liste].sort((a, b) => a.date.getTime() - b.date.getTime());
      for (let i = 1; i < triee.length; i++) {
        total++;
        if (triee[i].type !== triee[i - 1].type) alternees++;
      }
    }
    alternance = { pourcentage: total > 0 ? (alternees / total) * 100 : 0, alternees, total };
  }

  return (
    <main className="container">
      <h1>Statistiques</h1>
      <StatistiquesView
        classes={classes.map((c) => ({ id: c.id, nom: c.nom }))}
        classeIdActuelle={classe.id}
        nbEleves={rangsParEleve.size}
        nbKholleurs={chargeParKholleur.size}
        nbPassages={passages.length}
        scoreParEleve={scoreParEleve}
        ecartTypeScoreHoraire={ecartTypeScoreHoraire}
        chargeKholleurs={chargeKholleurs}
        diversiteDisciplines={diversiteDisciplines}
        detailEleveKholleur={detailEleveKholleur}
        alternance={alternance}
      />
    </main>
  );
}
