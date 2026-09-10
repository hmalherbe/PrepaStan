// Copie le "roster" (référentiel de personnes/classes) depuis la
// production vers l'environnement de démo, SANS les sessions de khôlle
// (SessionKholle/Creneau/Passage/Note/validations/PlanificationJob), pour
// repartir d'une base réaliste avant de simuler une année complète.
//
// Volontairement PAS exécuté comme un fichier présent dans le conteneur
// (le Dockerfile ne copie pas scripts/ dans l'image de production, voir
// son commentaire sur le build "standalone" de Next.js) : on le passe par
// l'entrée standard du process node qui tourne déjà dans le conteneur
// app-demo, depuis le checkout git sur l'hôte.
//
// Usage (depuis /root/PrepaStan sur le VPS ; PROD_DB_PASSWORD = le mot de
// passe de la vraie base de prod, celui de DB_PASSWORD dans .env) :
//
//   docker compose -f docker-compose.demo.yml exec -T \
//     -e SOURCE_DATABASE_URL="postgresql://prepastan:PROD_DB_PASSWORD@db:5432/prepastan?schema=public" \
//     app-demo node < scripts/copy-roster-to-demo.mjs
//
// Précondition : la base de démo (db-demo) doit être vide de roster (pas de
// classe/discipline/salle déjà créée à la main sous le même nom) — ce
// script copie en réutilisant les mêmes id que la prod (upsert par id, donc
// rejouable sans risque pour rafraîchir la démo), mais Discipline.nom,
// Salle.nom et AnneeScolaire.libelle sont uniques : un nom déjà pris sous
// un autre id ferait échouer la création.
//
// Anonymisation : emails synthétiques (jamais les vrais, voir DOMAINE_DEMO
// ci-dessous) en conservant nom/prénom réels pour un rendu réaliste ; mot
// de passe unique réinitialisé pour tous les comptes copiés (jamais le vrai
// hash de prod, voir MOT_DE_PASSE_DEMO) ; coordonnées des étudiants
// (email de contact, téléphone, Parcoursup, établissement d'origine) mises
// à null, sans rapport avec le compte de connexion et inutiles pour
// simuler un planning. Les comptes ADMIN-only ne sont pas copiés (la démo
// garde le sien, créé séparément) ; un compte cumulant ADMIN et un autre
// rôle (ex. kholleur) est copié sans le rôle ADMIN.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const sourceUrl = process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.DATABASE_URL;

if (!sourceUrl) {
  console.error("SOURCE_DATABASE_URL manquant (voir le commentaire en tête de ce script).");
  process.exit(1);
}
if (!targetUrl || !targetUrl.includes("db-demo")) {
  // Garde-fou : évite d'écrire par erreur dans la prod si les variables
  // d'environnement sont mal configurées. DATABASE_URL (la cible, celle du
  // conteneur dans lequel ce script tourne) doit pointer vers "db-demo".
  console.error(`DATABASE_URL (cible) suspect, doit contenir "db-demo" : ${targetUrl}`);
  process.exit(1);
}
if (sourceUrl.includes("db-demo") || sourceUrl === targetUrl) {
  console.error("SOURCE_DATABASE_URL pointe vers db-demo ou est identique à la cible — vérifiez les variables.");
  process.exit(1);
}

const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
const target = new PrismaClient({ datasources: { db: { url: targetUrl } } });

const DOMAINE_DEMO = "demo.prepastan.local";
const MOT_DE_PASSE_DEMO = "demo1234";

const DIACRITIQUES = new RegExp("[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]", "g");

function normaliser(texte) {
  return texte
    .normalize("NFD")
    .replace(DIACRITIQUES, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

// Copie générique "1 ligne source = 1 ligne cible, même id" pour les
// tables sans transformation particulière (id exclu du SET de l'update,
// pour ne jamais tenter de le modifier).
async function copierParId(delegate, rows) {
  for (const row of rows) {
    const { id, ...donnees } = row;
    await delegate.upsert({ where: { id }, update: donnees, create: row });
  }
  return rows.length;
}

async function main() {
  const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE_DEMO, 12);

  const annees = await source.anneeScolaire.findMany();
  console.log(`${await copierParId(target.anneeScolaire, annees)} année(s) scolaire(s)`);

  const disciplines = await source.discipline.findMany();
  console.log(`${await copierParId(target.discipline, disciplines)} discipline(s)`);

  const salles = await source.salle.findMany();
  console.log(`${await copierParId(target.salle, salles)} salle(s)`);

  // ---------- Utilisateurs (kholleurs / référents / élèves connectés) ----------
  const utilisateurs = await source.utilisateur.findMany();
  const emailsUtilises = new Set();
  const emailParId = new Map(); // sert aussi de "cet id a bien été copié" pour les tables suivantes
  for (const u of utilisateurs) {
    const rolesSansAdmin = u.roles.filter((r) => r !== "ADMIN");
    if (rolesSansAdmin.length === 0) continue; // comptes admin-only ignorés (la démo a le sien)

    const base = normaliser(`${u.prenom}.${u.nom}`) || "utilisateur";
    let email = `${base}@${DOMAINE_DEMO}`;
    let n = 2;
    while (emailsUtilises.has(email)) {
      email = `${base}${n}@${DOMAINE_DEMO}`;
      n += 1;
    }
    emailsUtilises.add(email);
    emailParId.set(u.id, email);

    await target.utilisateur.upsert({
      where: { id: u.id },
      update: { email, nom: u.nom, prenom: u.prenom, roles: rolesSansAdmin, password: motDePasseHash },
      create: { id: u.id, email, nom: u.nom, prenom: u.prenom, roles: rolesSansAdmin, password: motDePasseHash },
    });
  }
  console.log(`${emailParId.size} utilisateur(s) (comptes admin-only exclus)`);

  const classes = await source.classe.findMany();
  console.log(`${await copierParId(target.classe, classes)} classe(s)`);

  const classeDisciplines = await source.classeDiscipline.findMany();
  console.log(`${await copierParId(target.classeDiscipline, classeDisciplines)} association(s) classe/discipline`);

  const parametres = await source.parametreDiscipline.findMany();
  console.log(`${await copierParId(target.parametreDiscipline, parametres)} paramètre(s) de discipline`);

  // ---------- Étudiants ----------
  const eleves = await source.eleve.findMany();
  for (const e of eleves) {
    const utilisateurId = e.utilisateurId && emailParId.has(e.utilisateurId) ? e.utilisateurId : null;
    const donnees = {
      nom: e.nom,
      prenom: e.prenom,
      classeId: e.classeId,
      utilisateurId,
      lv1Id: e.lv1Id,
      lv2Id: e.lv2Id,
      emailContact: null,
      telephone: null,
      numeroParcoursup: null,
      etablissementOrigine: null,
    };
    await target.eleve.upsert({ where: { id: e.id }, update: donnees, create: { id: e.id, ...donnees } });
  }
  console.log(`${eleves.length} étudiant(s)`);

  // ---------- Compétences (kholleur × discipline) ----------
  const competences = await source.competence.findMany();
  let nbCompetences = 0;
  for (const c of competences) {
    if (!emailParId.has(c.kholleurId)) continue; // kholleur admin-only exclu plus haut
    await target.competence.upsert({
      where: { kholleurId_disciplineId: { kholleurId: c.kholleurId, disciplineId: c.disciplineId } },
      update: {},
      create: c,
    });
    nbCompetences += 1;
  }
  console.log(`${nbCompetences} compétence(s)`);

  // ---------- Référents (classe × discipline × utilisateur) ----------
  const referents = await source.professeurReferent.findMany();
  console.log(
    `${await copierParId(
      target.professeurReferent,
      referents.filter((r) => emailParId.has(r.utilisateurId))
    )} référent(s)`
  );

  // ---------- Disponibilités récurrentes ----------
  // Seulement les récurrentes (jourSemaine) : les ponctuelles (date précise)
  // sont attachées à de vraies dates passées, sans rapport avec l'année
  // simulée dans la démo.
  const disponibilites = await source.disponibilite.findMany({ where: { jourSemaine: { not: null } } });
  console.log(
    `${await copierParId(
      target.disponibilite,
      disponibilites.filter((d) => emailParId.has(d.kholleurId))
    )} disponibilité(s) récurrente(s)`
  );

  console.log(`\nTerminé. Mot de passe unique pour tous les comptes copiés : ${MOT_DE_PASSE_DEMO}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await source.$disconnect();
    await target.$disconnect();
  });
