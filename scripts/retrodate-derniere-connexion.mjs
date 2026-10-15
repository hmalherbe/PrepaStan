// Rétro-date Utilisateur.derniereConnexion (introduit après coup, voir son
// commentaire dans schema.prisma) à partir d'activités passées qui prouvent
// une connexion authentifiée antérieure à la mise en place de ce suivi :
//   - Khôlleur  : la plus récente entre Note.dateSaisie (saisie d'une note,
//                 nécessite d'être connecté comme ce khôlleur précis — voir
//                 /api/passages/[passageId]/note) et
//                 ValidationGrille.dateValidation (grille validée).
//   - Référent  : ValidationReferent.dateValidation (session validée —
//                 ValidationReferent.professeurReferentId stocke en réalité
//                 l'id Utilisateur du référent connecté, malgré son nom, voir
//                 /api/referent/sessions/[sessionId]/valider).
//
// Ne touche jamais un compte qui a déjà une derniereConnexion renseignée
// (jamais un compte étudiant/admin non plus : aucune action équivalente en
// base ne prouve leur connexion). Rejouable sans risque : un compte déjà
// mis à jour est ignoré au prochain lancement.
//
// Usage (depuis /root/PrepaStan sur le VPS, sans rebuild — passé par
// l'entrée standard du process node déjà présent dans le conteneur) :
//   docker compose -f docker-compose.prod.yml exec -T app node < scripts/retrodate-derniere-connexion.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function plusRecente(...dates) {
  const valides = dates.filter((d) => d instanceof Date);
  if (valides.length === 0) return null;
  return new Date(Math.max(...valides.map((d) => d.getTime())));
}

async function main() {
  let maj = 0;

  const kholleurs = await prisma.utilisateur.findMany({
    where: { roles: { has: "KHOLLEUR" }, derniereConnexion: null },
    select: { id: true, nom: true, prenom: true },
  });
  for (const k of kholleurs) {
    const [derniereNote, derniereValidation] = await Promise.all([
      prisma.note.findFirst({
        where: { dateSaisie: { not: null }, passage: { creneau: { kholleurId: k.id } } },
        orderBy: { dateSaisie: "desc" },
        select: { dateSaisie: true },
      }),
      prisma.validationGrille.findFirst({
        where: { kholleurId: k.id, statut: "VALIDE", dateValidation: { not: null } },
        orderBy: { dateValidation: "desc" },
        select: { dateValidation: true },
      }),
    ]);
    const derniereConnexion = plusRecente(derniereNote?.dateSaisie, derniereValidation?.dateValidation);
    if (!derniereConnexion) continue;
    await prisma.utilisateur.update({ where: { id: k.id }, data: { derniereConnexion } });
    console.log(`  ${k.prenom} ${k.nom} (kholleur) -> ${derniereConnexion.toISOString()}`);
    maj += 1;
  }

  const referents = await prisma.utilisateur.findMany({
    where: { roles: { has: "PROFESSEUR_REFERENT" }, derniereConnexion: null },
    select: { id: true, nom: true, prenom: true },
  });
  for (const r of referents) {
    const derniereValidation = await prisma.validationReferent.findFirst({
      where: { professeurReferentId: r.id, statut: "VALIDE", dateValidation: { not: null } },
      orderBy: { dateValidation: "desc" },
      select: { dateValidation: true },
    });
    if (!derniereValidation?.dateValidation) continue;
    await prisma.utilisateur.update({
      where: { id: r.id },
      data: { derniereConnexion: derniereValidation.dateValidation },
    });
    console.log(`  ${r.prenom} ${r.nom} (référent) -> ${derniereValidation.dateValidation.toISOString()}`);
    maj += 1;
  }

  console.log(`\n${maj} compte(s) rétrodaté(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
