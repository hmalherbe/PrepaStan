// Diagnostic ponctuel (lecture seule) : pour deux identifiants de compte
// Utilisateur (soupçonnés d'être deux comptes distincts pour la même
// personne), compte les lignes qui pointent vers chacun dans toutes les
// tables concernées (créneaux, grilles, validations, compétences,
// disponibilités, vivier référent...) — sert à préparer une fusion sûre en
// sachant précisément ce qu'il faudrait reporter de l'un vers l'autre avant
// de supprimer le doublon.
//
// Usage (depuis /root/PrepaStan sur le VPS) :
//   docker compose -f docker-compose.prod.yml exec -T \
//     -e ID1=xxxxx -e ID2=yyyyy \
//     app node < scripts/diagnostiquer-doublon-compte.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function compter(id) {
  const [
    utilisateur,
    creneaux,
    competences,
    disponibilites,
    professeurReferent,
    validationGrilles,
    validationReferent,
    sessionsEnVigueur,
    tokens,
    rappelsNotation,
    rappelsValidationReferent,
    jobsLances,
  ] = await Promise.all([
    prisma.utilisateur.findUnique({ where: { id } }),
    prisma.creneau.count({ where: { kholleurId: id } }),
    prisma.competence.count({ where: { kholleurId: id } }),
    prisma.disponibilite.count({ where: { kholleurId: id } }),
    prisma.professeurReferent.count({ where: { utilisateurId: id } }),
    prisma.validationGrille.count({ where: { kholleurId: id } }),
    prisma.validationReferent.count({ where: { professeurReferentId: id } }),
    prisma.sessionKholle.count({ where: { referentId: id } }),
    prisma.tokenReinitialisationMotDePasse.count({ where: { utilisateurId: id } }),
    prisma.rappelNotationEnvoye.count({ where: { kholleurId: id } }),
    prisma.rappelValidationReferentEnvoye.count({ where: { referentId: id } }),
    prisma.planificationJob.count({ where: { lanceParId: id } }),
  ]);

  return {
    utilisateur,
    creneaux,
    competences,
    disponibilites,
    professeurReferent,
    validationGrilles,
    validationReferent,
    sessionsEnVigueur,
    tokens,
    rappelsNotation,
    rappelsValidationReferent,
    jobsLances,
  };
}

async function main() {
  const id1 = process.env.ID1;
  const id2 = process.env.ID2;
  if (!id1 || !id2) {
    console.log("Usage : ID1=<id> ID2=<id> requis.");
    return;
  }

  for (const id of [id1, id2]) {
    const r = await compter(id);
    if (!r.utilisateur) {
      console.log(`\n=== ${id} : INTROUVABLE ===`);
      continue;
    }
    const u = r.utilisateur;
    console.log(`\n=== ${id} : ${u.prenom} ${u.nom} <${u.email}> — rôles: ${u.roles.join(", ")} ===`);
    console.log(`  Créneaux (kholleur)             : ${r.creneaux}`);
    console.log(`  Compétences                      : ${r.competences}`);
    console.log(`  Disponibilités                   : ${r.disponibilites}`);
    console.log(`  ProfesseurReferent (vivier)      : ${r.professeurReferent}`);
    console.log(`  ValidationGrille (kholleur)      : ${r.validationGrilles}`);
    console.log(`  ValidationReferent               : ${r.validationReferent}`);
    console.log(`  SessionKholle.referentId (semaine en vigueur) : ${r.sessionsEnVigueur}`);
    console.log(`  TokenReinitialisationMotDePasse  : ${r.tokens}`);
    console.log(`  RappelNotationEnvoye             : ${r.rappelsNotation}`);
    console.log(`  RappelValidationReferentEnvoye   : ${r.rappelsValidationReferent}`);
    console.log(`  PlanificationJob lancés (admin)  : ${r.jobsLances}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
