// Fusionne les comptes kholleur/référent en double dans la base de DÉMO
// (même personne réelle présente sous plusieurs lignes Utilisateur en
// production, avec des emails réels différents — copy-roster-to-demo.mjs
// leur donne alors des emails synthétiques distincts, avec un suffixe
// numérique à partir de la 2e occurrence d'un même nom+prénom normalisés).
// Nécessaire avant de rejouer l'historique réel (voir
// planning-historique-importer.mjs) : sa résolution de noms échoue dès
// qu'un nom correspond à plusieurs comptes à la fois.
//
// Pour chaque groupe de comptes partageant le même nom+prénom normalisés,
// garde celui qui a le plus de rôles (à égalité, celui dont l'email n'a
// pas de suffixe numérique), reporte dessus tout ce que portaient les
// autres (référents, compétences, disponibilités), puis les supprime.
//
// Usage (depuis /root/PrepaStan sur le VPS) :
//   docker compose -f docker-compose.demo.yml exec app-demo mkdir -p /app/prisma/tmp-import
//   docker compose -f docker-compose.demo.yml cp scripts/fusionner-doublons-demo.mjs app-demo:/app/prisma/tmp-import/
//   docker compose -f docker-compose.demo.yml exec app-demo node /app/prisma/tmp-import/fusionner-doublons-demo.mjs
//
// Garde-fou : refuse de tourner si DATABASE_URL ne contient pas "db-demo"
// (même logique que copy-roster-to-demo.mjs).
import { PrismaClient } from "@prisma/client";

const targetUrl = process.env.DATABASE_URL;
if (!targetUrl || !targetUrl.includes("db-demo")) {
  console.error(`DATABASE_URL suspect, doit contenir "db-demo" : ${targetUrl}`);
  process.exit(1);
}

const prisma = new PrismaClient();

const DIACRITIQUES = new RegExp("[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]", "g");
function normaliser(s) {
  return s.normalize("NFD").replace(DIACRITIQUES, "").toUpperCase().trim();
}

const SUFFIXE_NUMERIQUE = /\d+@/;
function choisirGarde(liste) {
  return [...liste].sort((a, b) => {
    if (b.roles.length !== a.roles.length) return b.roles.length - a.roles.length;
    const aSuffixe = SUFFIXE_NUMERIQUE.test(a.email) ? 1 : 0;
    const bSuffixe = SUFFIXE_NUMERIQUE.test(b.email) ? 1 : 0;
    if (aSuffixe !== bSuffixe) return aSuffixe - bSuffixe;
    return a.email.localeCompare(b.email);
  })[0];
}

async function main() {
  const comptes = await prisma.utilisateur.findMany({
    where: { OR: [{ roles: { has: "KHOLLEUR" } }, { roles: { has: "PROFESSEUR_REFERENT" } }] },
    select: { id: true, email: true, nom: true, prenom: true, roles: true },
  });
  const groupes = new Map();
  for (const c of comptes) {
    const cle = normaliser(c.nom) + "|" + normaliser(c.prenom);
    const liste = groupes.get(cle) ?? [];
    liste.push(c);
    groupes.set(cle, liste);
  }
  const doublons = [...groupes.entries()].filter(([, v]) => v.length > 1);
  console.log(`${doublons.length} groupe(s) de doublons à fusionner.`);

  for (const [cle, liste] of doublons) {
    const garde = choisirGarde(liste);
    const autres = liste.filter((c) => c.id !== garde.id);
    console.log(`${cle} : garde ${garde.email} [${garde.roles}], fusionne ${autres.map((a) => a.email).join(", ")}`);

    await prisma.$transaction(async (tx) => {
      for (const doublon of autres) {
        for (const r of await tx.professeurReferent.findMany({ where: { utilisateurId: doublon.id } })) {
          await tx.professeurReferent.upsert({
            where: {
              classeId_disciplineId_utilisateurId: {
                classeId: r.classeId,
                disciplineId: r.disciplineId,
                utilisateurId: garde.id,
              },
            },
            update: {},
            create: { classeId: r.classeId, disciplineId: r.disciplineId, utilisateurId: garde.id },
          });
        }
        for (const c of await tx.competence.findMany({ where: { kholleurId: doublon.id } })) {
          await tx.competence.upsert({
            where: { kholleurId_disciplineId: { kholleurId: garde.id, disciplineId: c.disciplineId } },
            update: {},
            create: { kholleurId: garde.id, disciplineId: c.disciplineId },
          });
        }
        await tx.disponibilite.updateMany({ where: { kholleurId: doublon.id }, data: { kholleurId: garde.id } });
        await tx.professeurReferent.deleteMany({ where: { utilisateurId: doublon.id } });
        await tx.competence.deleteMany({ where: { kholleurId: doublon.id } });
        await tx.utilisateur.delete({ where: { id: doublon.id } });
      }
    });
  }

  console.log("\nFusion terminée.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
