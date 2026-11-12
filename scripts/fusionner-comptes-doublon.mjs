// Fusionne deux comptes Utilisateur réellement attribués à la même
// personne (ex. un compte khôlleur créé séparément du compte professeur
// référent, au lieu d'un seul compte à deux rôles comme la normale — voir
// scripts/diagnostiquer-doublon-compte.mjs pour objectiver la situation
// avant de lancer ceci) : reporte tout ce qui est accroché à ID_SUPPRIMER
// vers ID_GARDER (créneaux, compétences, disponibilités, vivier référent,
// grilles/validations, rappels déjà envoyés), fusionne les rôles, puis
// supprime le compte devenu vide. Ne touche jamais à l'email ni au mot de
// passe d'ID_GARDER : la personne garde ses identifiants habituels,
// seulement enrichis des données de l'autre compte.
//
// Simulation par défaut (aucune écriture) ; ajouter APPLY=1 pour exécuter
// réellement, dans une seule transaction (tout ou rien).
//
// Usage (depuis /root/PrepaStan sur le VPS) :
//   docker compose -f docker-compose.prod.yml exec -T \
//     -e ID_GARDER=xxxxx -e ID_SUPPRIMER=yyyyy \
//     app node < scripts/fusionner-comptes-doublon.mjs
//   # puis, une fois le résultat vérifié :
//   docker compose -f docker-compose.prod.yml exec -T \
//     -e ID_GARDER=xxxxx -e ID_SUPPRIMER=yyyyy -e APPLY=1 \
//     app node < scripts/fusionner-comptes-doublon.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const idGarder = process.env.ID_GARDER;
  const idSupprimer = process.env.ID_SUPPRIMER;
  const appliquer = process.env.APPLY === "1";

  if (!idGarder || !idSupprimer) {
    console.log("Usage : ID_GARDER=<id> ID_SUPPRIMER=<id> [APPLY=1] requis.");
    return;
  }
  if (idGarder === idSupprimer) {
    console.log("ID_GARDER et ID_SUPPRIMER sont identiques, rien à fusionner.");
    return;
  }

  const [garder, supprimer] = await Promise.all([
    prisma.utilisateur.findUnique({ where: { id: idGarder } }),
    prisma.utilisateur.findUnique({ where: { id: idSupprimer } }),
  ]);
  if (!garder || !supprimer) {
    console.log("Au moins un des deux identifiants est introuvable.");
    return;
  }

  console.log(
    `Fusion : ${supprimer.prenom} ${supprimer.nom} <${supprimer.email}> (${idSupprimer}) ` +
      `-> ${garder.prenom} ${garder.nom} <${garder.email}> (${idGarder})\n`
  );

  const [creneaux, competences, disponibilites, referent, validationGrilles, rappelsNotation] = await Promise.all([
    prisma.creneau.findMany({ where: { kholleurId: idSupprimer }, select: { id: true } }),
    prisma.competence.findMany({ where: { kholleurId: idSupprimer }, select: { disciplineId: true } }),
    prisma.disponibilite.findMany({ where: { kholleurId: idSupprimer }, select: { id: true } }),
    prisma.professeurReferent.findMany({ where: { utilisateurId: idSupprimer }, select: { id: true, classeId: true, disciplineId: true } }),
    prisma.validationGrille.findMany({ where: { kholleurId: idSupprimer }, select: { sessionKholleId: true } }),
    prisma.rappelNotationEnvoye.findMany({ where: { kholleurId: idSupprimer }, select: { sessionKholleId: true } }),
  ]);
  const [validationReferent, sessionsEnVigueur, rappelsValidationReferent] = await Promise.all([
    prisma.validationReferent.findMany({ where: { professeurReferentId: idSupprimer }, select: { sessionKholleId: true } }),
    prisma.sessionKholle.findMany({ where: { referentId: idSupprimer }, select: { id: true } }),
    prisma.rappelValidationReferentEnvoye.findMany({ where: { referentId: idSupprimer }, select: { sessionKholleId: true } }),
  ]);

  // Pour chaque table à unicité composite impliquant l'id à fusionner,
  // vérifie qu'ID_GARDER n'a pas déjà une ligne équivalente — sans quoi le
  // simple changement d'id violerait la contrainte d'unicité plutôt que de
  // fusionner proprement (ex. les deux comptes ont par erreur déjà la même
  // compétence). Signalé mais pas bloquant pour les autres migrations : ce
  // doublon-de-doublon serait alors simplement supprimé avec le compte.
  // Les deux requêtes ci-dessous court-circuitent sur liste vide plutôt que
  // de passer OR: [] à Prisma (sémantique d'un OR vide non garantie), ce
  // qui serait de toute façon le cas le plus fréquent (pas de doublon-de-
  // doublon).
  const competencesDejaChezGarder =
    competences.length === 0
      ? []
      : await prisma.competence.findMany({
          where: { kholleurId: idGarder, disciplineId: { in: competences.map((c) => c.disciplineId) } },
          select: { disciplineId: true },
        });
  const referentsDejaChezGarder =
    referent.length === 0
      ? []
      : await prisma.professeurReferent.findMany({
          where: {
            utilisateurId: idGarder,
            OR: referent.map((r) => ({ classeId: r.classeId, disciplineId: r.disciplineId })),
          },
          select: { classeId: true, disciplineId: true },
        });

  console.log("Seraient reportés vers le compte conservé :");
  console.log(`  Créneaux (kholleur)             : ${creneaux.length}`);
  console.log(
    `  Compétences                      : ${competences.length}` +
      (competencesDejaChezGarder.length > 0 ? ` (dont ${competencesDejaChezGarder.length} déjà présentes, ignorées)` : "")
  );
  console.log(`  Disponibilités                   : ${disponibilites.length}`);
  console.log(
    `  ProfesseurReferent (vivier)      : ${referent.length}` +
      (referentsDejaChezGarder.length > 0 ? ` (dont ${referentsDejaChezGarder.length} déjà présentes, ignorées)` : "")
  );
  console.log(`  ValidationGrille (kholleur)      : ${validationGrilles.length}`);
  console.log(`  ValidationReferent               : ${validationReferent.length}`);
  console.log(`  SessionKholle.referentId         : ${sessionsEnVigueur.length}`);
  console.log(`  RappelNotationEnvoye             : ${rappelsNotation.length}`);
  console.log(`  RappelValidationReferentEnvoye   : ${rappelsValidationReferent.length}`);
  const rolesFusionnes = [...new Set([...garder.roles, ...supprimer.roles])];
  console.log(`  Rôles finaux du compte conservé  : ${rolesFusionnes.join(", ")} (actuels : ${garder.roles.join(", ")})`);
  console.log(`\nPuis suppression du compte ${idSupprimer} (<${supprimer.email}>).`);

  if (!appliquer) {
    console.log("\nSimulation uniquement (APPLY non défini) : aucune écriture effectuée.");
    return;
  }

  await prisma.$transaction([
    prisma.creneau.updateMany({ where: { kholleurId: idSupprimer }, data: { kholleurId: idGarder } }),
    prisma.competence.deleteMany({
      where: { kholleurId: idSupprimer, disciplineId: { in: competencesDejaChezGarder.map((c) => c.disciplineId) } },
    }),
    prisma.competence.updateMany({ where: { kholleurId: idSupprimer }, data: { kholleurId: idGarder } }),
    prisma.disponibilite.updateMany({ where: { kholleurId: idSupprimer }, data: { kholleurId: idGarder } }),
    prisma.professeurReferent.deleteMany({
      where: {
        utilisateurId: idSupprimer,
        OR: referentsDejaChezGarder.map((r) => ({ classeId: r.classeId, disciplineId: r.disciplineId })),
      },
    }),
    prisma.professeurReferent.updateMany({ where: { utilisateurId: idSupprimer }, data: { utilisateurId: idGarder } }),
    prisma.validationGrille.updateMany({ where: { kholleurId: idSupprimer }, data: { kholleurId: idGarder } }),
    prisma.validationReferent.updateMany({
      where: { professeurReferentId: idSupprimer },
      data: { professeurReferentId: idGarder },
    }),
    prisma.sessionKholle.updateMany({ where: { referentId: idSupprimer }, data: { referentId: idGarder } }),
    prisma.rappelNotationEnvoye.updateMany({ where: { kholleurId: idSupprimer }, data: { kholleurId: idGarder } }),
    prisma.rappelValidationReferentEnvoye.updateMany({
      where: { referentId: idSupprimer },
      data: { referentId: idGarder },
    }),
    prisma.utilisateur.update({ where: { id: idGarder }, data: { roles: rolesFusionnes } }),
    prisma.utilisateur.delete({ where: { id: idSupprimer } }),
  ]);

  console.log("\nFusion effectuée.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
