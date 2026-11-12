// Diagnostic ponctuel (lecture seule) : pour une (classe, semaine), montre
// pour chaque créneau la discipline, le kholleur réellement affecté (nom,
// prénom, email) — et cherche séparément un utilisateur par nom de famille
// (ex. pour vérifier l'adresse email réellement enregistrée pour une
// personne précise, et si elle a des créneaux cette semaine-là). Sert à
// expliquer un email de publication parti vers une adresse inattendue : soit
// l'adresse est bien celle enregistrée pour le kholleur réellement affecté
// (quelqu'un d'autre que prévu), soit l'adresse enregistrée pour la
// personne attendue est elle-même erronée.
//
// Usage (depuis /root/PrepaStan sur le VPS) :
//   docker compose -f docker-compose.prod.yml exec -T \
//     -e CLASSE=L2 -e SEMAINE=47 -e NOM=Cruciani \
//     app node < scripts/diagnostiquer-destinataire-email-kholleur.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const classeNomFiltre = process.env.CLASSE;
  const semaineFiltre = process.env.SEMAINE ? Number(process.env.SEMAINE) : undefined;
  const nomFiltre = process.env.NOM;
  if (!classeNomFiltre || semaineFiltre === undefined) {
    console.log("Usage : CLASSE=<nom> SEMAINE=<numéro> [NOM=<nom de famille>] requis.");
    return;
  }

  const creneaux = await prisma.creneau.findMany({
    where: { sessionKholle: { classe: { nom: classeNomFiltre }, semaine: semaineFiltre } },
    select: {
      date: true,
      heureDebut: true,
      heureFin: true,
      kholleurId: true,
      kholleur: { select: { id: true, nom: true, prenom: true, email: true } },
      sessionKholle: { select: { statut: true, discipline: { select: { nom: true } } } },
    },
    orderBy: [{ date: "asc" }, { heureDebut: "asc" }],
  });

  console.log(`=== Créneaux ${classeNomFiltre}, semaine ${semaineFiltre} (${creneaux.length}) ===\n`);
  const parKholleur = new Map();
  for (const c of creneaux) {
    const cle = c.kholleurId;
    const liste = parKholleur.get(cle) ?? { kholleur: c.kholleur, lignes: [] };
    liste.lignes.push(c);
    parKholleur.set(cle, liste);
  }
  for (const { kholleur, lignes } of parKholleur.values()) {
    console.log(`  ${kholleur.prenom} ${kholleur.nom} <${kholleur.email}> (id=${kholleur.id})`);
    for (const l of lignes) {
      console.log(
        `    - ${l.date.toISOString().slice(0, 10)} ${l.heureDebut}-${l.heureFin} ${l.sessionKholle.discipline.nom} [${l.sessionKholle.statut}]`
      );
    }
  }

  if (nomFiltre) {
    console.log(`\n=== Comptes utilisateur dont le nom contient "${nomFiltre}" ===`);
    const utilisateurs = await prisma.utilisateur.findMany({
      where: { nom: { contains: nomFiltre, mode: "insensitive" } },
      select: { id: true, nom: true, prenom: true, email: true, roles: true },
    });
    if (utilisateurs.length === 0) {
      console.log("  Aucun compte trouvé avec ce nom.");
    }
    for (const u of utilisateurs) {
      console.log(`  ${u.prenom} ${u.nom} <${u.email}> — rôles: ${u.roles.join(", ")} (id=${u.id})`);
      const sesCreneaux = await prisma.creneau.findMany({
        where: {
          kholleurId: u.id,
          sessionKholle: { classe: { nom: classeNomFiltre }, semaine: semaineFiltre },
        },
        select: { date: true, sessionKholle: { select: { discipline: { select: { nom: true } } } } },
      });
      if (sesCreneaux.length === 0) {
        console.log(`    -> Aucun créneau pour ${classeNomFiltre} semaine ${semaineFiltre}.`);
      } else {
        for (const c of sesCreneaux) {
          console.log(
            `    -> créneau le ${c.date.toISOString().slice(0, 10)} en ${c.sessionKholle.discipline.nom}`
          );
        }
      }
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
