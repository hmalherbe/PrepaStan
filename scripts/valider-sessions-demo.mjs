// Complète le circuit de validation (grilles kholleur -> validation
// référent -> session clôturée) pour toutes les sessions de la DÉMO dont
// les notes sont désormais complètes — reproduit exactement ce que font
// /api/kholleur/sessions/:id/valider puis /api/referent/sessions/:id/valider
// en conditions réelles, mais directement en base pour tout traiter d'un
// coup plutôt qu'un clic à la fois.
//
// Nécessaire après generer-notes-aleatoires-demo.mjs : remplir les notes ne
// suffit pas à les rendre visibles aux étudiants (voir
// src/app/eleve/notes/page.tsx) — seule une session dont la
// ValidationReferent est VALIDE les affiche, le reste montre "En attente".
//
// Une session est ignorée (jamais partiellement validée) si au moins un de
// ses passages n'a pas encore de note+valeur+appréciation complètes, ou si
// elle n'a pas de referentId renseigné (ne devrait pas arriver pour les
// semaines générées via /api/admin/planification/jobs, qui l'exige).
//
// Idempotent (upserts sur les clés uniques) : rejouable sans risque après
// une nouvelle génération de semaines ou un nouveau passage du script de
// notes aléatoires.
//
// Usage (depuis /root/PrepaStan sur le VPS) :
//   docker compose -f docker-compose.demo.yml exec app-demo mkdir -p /app/prisma/tmp-import
//   docker compose -f docker-compose.demo.yml cp scripts/valider-sessions-demo.mjs app-demo:/app/prisma/tmp-import/
//   docker compose -f docker-compose.demo.yml exec app-demo node /app/prisma/tmp-import/valider-sessions-demo.mjs
//
// Garde-fou : refuse de tourner si DATABASE_URL ne contient pas "db-demo".
import { PrismaClient } from "@prisma/client";

const targetUrl = process.env.DATABASE_URL;
if (!targetUrl || !targetUrl.includes("db-demo")) {
  console.error(`DATABASE_URL suspect, doit contenir "db-demo" : ${targetUrl}`);
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.sessionKholle.findMany({
    where: { statut: { not: "PLANIFICATION" } },
    select: {
      id: true,
      semaine: true,
      referentId: true,
      classe: { select: { nom: true } },
      discipline: { select: { nom: true } },
      creneaux: {
        select: {
          kholleurId: true,
          passages: { select: { note: { select: { valeur: true, appreciation: true } } } },
        },
      },
    },
  });

  let validees = 0;
  let ignoreesIncompletes = 0;
  let ignoreesSansReferent = 0;

  for (const s of sessions) {
    const kholleurIds = [...new Set(s.creneaux.map((c) => c.kholleurId))];
    const passages = s.creneaux.flatMap((c) => c.passages);
    const incomplet = passages.some(
      (p) => !p.note || p.note.valeur === null || !p.note.appreciation
    );
    if (incomplet) {
      ignoreesIncompletes += 1;
      continue;
    }
    if (!s.referentId) {
      ignoreesSansReferent += 1;
      console.log(`Ignorée (pas de référent) : ${s.classe.nom} semaine ${s.semaine} (${s.discipline.nom})`);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      for (const kholleurId of kholleurIds) {
        await tx.validationGrille.upsert({
          where: { kholleurId_sessionKholleId: { kholleurId, sessionKholleId: s.id } },
          update: { statut: "VALIDE", dateValidation: new Date() },
          create: { kholleurId, sessionKholleId: s.id, statut: "VALIDE", dateValidation: new Date() },
        });
      }
      await tx.validationReferent.upsert({
        where: { sessionKholleId: s.id },
        update: { statut: "VALIDE", dateValidation: new Date(), professeurReferentId: s.referentId },
        create: {
          sessionKholleId: s.id,
          professeurReferentId: s.referentId,
          statut: "VALIDE",
          dateValidation: new Date(),
        },
      });
      await tx.sessionKholle.update({ where: { id: s.id }, data: { statut: "CLOTUREE" } });
    });
    validees += 1;
  }

  console.log(
    `\n${validees} session(s) validée(s) et clôturée(s), ${ignoreesIncompletes} ignorée(s) (notes incomplètes), ` +
      `${ignoreesSansReferent} ignorée(s) (pas de référent).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
