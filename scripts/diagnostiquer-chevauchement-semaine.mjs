// Diagnostic ponctuel (lecture seule) : contrairement à
// scripts/detecter-chevauchements-marge.mjs, qui ne regarde QUE les
// sessions déjà publiées (statut != PLANIFICATION), celui-ci regarde TOUTES
// les sessions d'une (classe, semaine) donnée, brouillon inclus — utile pour
// un chevauchement repéré sur l'écran de relecture avant publication (où le
// brouillon d'une discipline peut chevaucher une autre discipline déjà
// publiée la même semaine). Indique aussi, pour chaque passage, si une note
// a déjà été saisie (déterminant pour choisir la méthode de correction : une
// régénération supprime les notes en cascade).
//
// Usage (depuis /root/PrepaStan sur le VPS) :
//   docker compose -f docker-compose.prod.yml exec -T \
//     -e CLASSE=L1 -e SEMAINE=46 \
//     app node < scripts/diagnostiquer-chevauchement-semaine.mjs
//
// (remplacer -f docker-compose.prod.yml / app par -f docker-compose.demo.yml
// / app-demo pour la démo)
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function minutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

async function main() {
  const classeNomFiltre = process.env.CLASSE;
  const semaineFiltre = process.env.SEMAINE ? Number(process.env.SEMAINE) : undefined;
  if (!classeNomFiltre || semaineFiltre === undefined) {
    console.log("Usage : CLASSE=<nom> SEMAINE=<numéro> requis.");
    return;
  }

  const passages = await prisma.passage.findMany({
    where: {
      eleve: { classe: { nom: classeNomFiltre } },
      creneau: { sessionKholle: { semaine: semaineFiltre } },
    },
    include: {
      eleve: { select: { nom: true, prenom: true } },
      note: { select: { valeur: true, appreciation: true } },
      creneau: {
        select: {
          date: true,
          heureDebutPreparation: true,
          heureDebut: true,
          heureFin: true,
          kholleurId: true,
          sessionKholle: { select: { statut: true, discipline: { select: { nom: true } } } },
        },
      },
    },
  });

  console.log(`${passages.length} passage(s) trouvé(s) pour ${classeNomFiltre}, semaine ${semaineFiltre}.\n`);

  const parEleveEtJour = new Map();
  for (const p of passages) {
    const cle = `${p.eleveId}|${p.creneau.date.toISOString().slice(0, 10)}`;
    const liste = parEleveEtJour.get(cle) ?? [];
    liste.push(p);
    parEleveEtJour.set(cle, liste);
  }

  let nbChevauchements = 0;
  let nbAvecNote = 0;

  for (const liste of [...parEleveEtJour.values()].sort(
    (a, b) => a[0].eleve.nom.localeCompare(b[0].eleve.nom) || a[0].creneau.date - b[0].creneau.date
  )) {
    if (liste.length < 2) continue;
    const triee = [...liste].sort((a, b) => minutes(a.creneau.heureDebut) - minutes(b.creneau.heureDebut));

    for (let i = 1; i < triee.length; i++) {
      const precedent = triee[i - 1];
      const courant = triee[i];
      const debutOccupationCourant = minutes(courant.creneau.heureDebutPreparation ?? courant.creneau.heureDebut);
      const gap = debutOccupationCourant - minutes(precedent.creneau.heureFin);
      if (gap < 0) {
        nbChevauchements++;
        const noteStatut = (p) =>
          p.note?.valeur != null || p.note?.appreciation ? "NOTE DÉJÀ SAISIE" : "pas de note";
        if (precedent.note?.valeur != null || precedent.note?.appreciation || courant.note?.valeur != null || courant.note?.appreciation) {
          nbAvecNote++;
        }
        console.log(
          `  ${courant.eleve.prenom} ${courant.eleve.nom} — ${courant.creneau.date.toISOString().slice(0, 10)} : ` +
            `${precedent.creneau.sessionKholle.discipline.nom} [${precedent.creneau.sessionKholle.statut}] ` +
            `${precedent.creneau.heureDebut}-${precedent.creneau.heureFin} (${noteStatut(precedent)}) puis ` +
            `${courant.creneau.sessionKholle.discipline.nom} [${courant.creneau.sessionKholle.statut}] ` +
            `prépa dès ${courant.creneau.heureDebutPreparation ?? courant.creneau.heureDebut} ` +
            `${courant.creneau.heureDebut}-${courant.creneau.heureFin} (${noteStatut(courant)}) ` +
            `=> chevauchement de ${-gap} min`
        );
      }
    }
  }

  console.log(
    `\n${nbChevauchements} chevauchement(s) détecté(s)` +
      (nbChevauchements > 0 ? `, dont ${nbAvecNote} impliquant un passage déjà noté.` : ".")
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
