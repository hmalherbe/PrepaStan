// Diagnostic ponctuel (lecture seule) : pour un khôlleur donné (par nom de
// famille, insensible à la casse), liste chacune de ses grilles validées
// avec le détail qui alimente /admin/statistiques/delai-validation (classe,
// discipline, semaine, dernier créneau de cette session, date de
// validation, délai calculé) — sert à comprendre un délai moyen
// anormalement élevé affiché sur cet écran, en remontant à la session
// précise qui le produit plutôt que de deviner depuis la seule moyenne.
//
// Usage (depuis /root/PrepaStan sur le VPS) :
//   docker compose -f docker-compose.prod.yml exec -T \
//     -e NOM=golli \
//     app node < scripts/diagnostiquer-delai-validation.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const nom = process.env.NOM;
  if (!nom) {
    console.log("Usage : NOM=<nom de famille, insensible à la casse> requis.");
    return;
  }

  const kholleurs = await prisma.utilisateur.findMany({
    where: { nom: { contains: nom, mode: "insensitive" } },
    select: { id: true, nom: true, prenom: true, email: true },
  });
  if (kholleurs.length === 0) {
    console.log(`Aucun compte dont le nom contient "${nom}".`);
    return;
  }

  for (const kholleur of kholleurs) {
    console.log(`\n=== ${kholleur.prenom} ${kholleur.nom} <${kholleur.email}> (${kholleur.id}) ===`);

    const validations = await prisma.validationGrille.findMany({
      where: { kholleurId: kholleur.id, statut: "VALIDE", dateValidation: { not: null } },
      select: {
        sessionKholleId: true,
        dateValidation: true,
        sessionKholle: {
          select: {
            semaine: true,
            classe: { select: { nom: true } },
            discipline: { select: { nom: true } },
          },
        },
      },
    });

    if (validations.length === 0) {
      console.log("  Aucune grille validée pour ce compte.");
      continue;
    }

    for (const v of validations) {
      const creneaux = await prisma.creneau.findMany({
        where: { sessionKholleId: v.sessionKholleId, kholleurId: kholleur.id },
        select: { date: true },
        orderBy: { date: "asc" },
      });
      if (creneaux.length === 0) {
        console.log(
          `  ${v.sessionKholle.classe.nom} — ${v.sessionKholle.discipline.nom} — semaine ${v.sessionKholle.semaine} : ` +
            `AUCUN CRÉNEAU RETROUVÉ pour ce kholleur dans cette session (anomalie — exclu du calcul de délai).`
        );
        continue;
      }
      const premier = creneaux[0].date;
      const dernier = creneaux[creneaux.length - 1].date;
      const delaiJours = (v.dateValidation.getTime() - dernier.getTime()) / (24 * 60 * 60 * 1000);
      console.log(
        `  ${v.sessionKholle.classe.nom} — ${v.sessionKholle.discipline.nom} — semaine ${v.sessionKholle.semaine} : ` +
          `créneau(x) du ${premier.toISOString().slice(0, 10)}` +
          (premier.getTime() !== dernier.getTime() ? ` au ${dernier.toISOString().slice(0, 10)}` : "") +
          `, validé le ${v.dateValidation.toISOString().slice(0, 10)} → délai ${delaiJours.toFixed(1)} jour(s)`
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
