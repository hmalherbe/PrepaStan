// Supprime les comptes Utilisateur de test créés en rafale le 30/08/2026
// avec un alias Gmail (hugues.malherbe+...@gmail.com) pour contourner la
// restriction du mode bac à sable Resend (qui ne livre qu'à l'adresse du
// compte Resend lui-même) — plus nécessaire depuis l'ajout de l'aperçu
// d'email sans envoi (voir /admin/envoi-identifiants). Confirmés orphelins
// en base le 2026-10-?? (aucune fiche Eleve ne pointe dessus, voir le
// diagnostic correspondant dans la conversation).
//
// Garde-fous avant suppression, par compte : email en alias
// hugues.malherbe+...@gmail.com, un SEUL rôle (ELEVE seul, ou
// PROFESSEUR_REFERENT seul — jamais les deux, ni KHOLLEUR, qui indiquerait
// un compte réellement utilisé), aucune fiche Eleve rattachée, et aucune
// donnée réelle attachée (compétences, disponibilités, vivier référent,
// référent effectif d'une session, créneaux, jobs de planification). Un
// compte qui ne remplit pas TOUTES ces conditions est signalé et laissé
// intact plutôt que supprimé au risque de perdre de vraies données.
//
// Mode par défaut : SIMULATION uniquement (aucune écriture), affiche le
// plan. Ajouter APPLY=1 pour supprimer réellement.
//
// Usage (depuis /root/PrepaStan sur le VPS) :
//   docker compose -f docker-compose.prod.yml exec -T app node < scripts/supprimer-comptes-alias-orphelins.mjs
//   docker compose -f docker-compose.prod.yml exec -T -e APPLY=1 app node < scripts/supprimer-comptes-alias-orphelins.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.env.APPLY === "1";

async function main() {
  const candidats = await prisma.utilisateur.findMany({
    where: { email: { contains: "hugues.malherbe+" }, eleve: null },
    select: { id: true, nom: true, prenom: true, email: true, roles: true },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
  });

  console.log(`${candidats.length} compte(s) candidat(s) (alias + aucune fiche élève).\n`);

  const aSupprimer = [];
  const ignores = [];

  for (const u of candidats) {
    const roleSeul = u.roles.length === 1 ? u.roles[0] : null;
    if (roleSeul !== "ELEVE" && roleSeul !== "PROFESSEUR_REFERENT") {
      ignores.push({ u, raison: `rôle(s) inattendu(s) : ${u.roles.join(", ")}` });
      continue;
    }
    const [competences, disponibilites, referentsMatiere, sessionsReferent, creneaux, planificationJobs] =
      await Promise.all([
        prisma.competence.count({ where: { kholleurId: u.id } }),
        prisma.disponibilite.count({ where: { kholleurId: u.id } }),
        prisma.professeurReferent.count({ where: { utilisateurId: u.id } }),
        prisma.sessionKholle.count({ where: { referentId: u.id } }),
        prisma.creneau.count({ where: { kholleurId: u.id } }),
        prisma.planificationJob.count({ where: { lanceParId: u.id } }),
      ]);
    const total = competences + disponibilites + referentsMatiere + sessionsReferent + creneaux + planificationJobs;
    if (total > 0) {
      ignores.push({ u, raison: `données réelles attachées (total ${total})` });
      continue;
    }
    aSupprimer.push(u);
  }

  console.log(`=== À supprimer (${aSupprimer.length}) ===`);
  for (const u of aSupprimer) {
    console.log(`  ${u.prenom} ${u.nom} — ${u.email}`);
  }

  if (ignores.length > 0) {
    console.log(`\n=== Ignoré(s), laissé(s) intact(s) (${ignores.length}) ===`);
    for (const { u, raison } of ignores) {
      console.log(`  ${u.prenom} ${u.nom} — ${u.email} : ${raison}`);
    }
  }

  if (!APPLY) {
    console.log("\nSimulation uniquement (APPLY=1 pour supprimer réellement).");
    return;
  }

  for (const u of aSupprimer) {
    await prisma.utilisateur.delete({ where: { id: u.id } });
  }
  console.log(`\n${aSupprimer.length} compte(s) supprimé(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
