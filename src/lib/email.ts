import { Resend } from "resend";
import { MODELES_EMAIL_PAR_DEFAUT, remplacerPlaceholders } from "@/lib/modelesEmail";
import { prisma } from "@/lib/prisma";

// Sans clé configurée, on ne bloque jamais l'application pour un email : on
// logue et on continue (utile en développement local sans compte Resend).
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Tant que le domaine d'envoi n'est pas vérifié sur Resend, seul
// `onboarding@resend.dev` fonctionne, et uniquement vers l'adresse du compte
// Resend lui-même — voir https://resend.com/docs/dashboard/domains/introduction.
const EXPEDITEUR = process.env.RESEND_FROM_EMAIL ?? "PrepaStan <onboarding@resend.dev>";

// Même variable que /api/auth/mot-de-passe-oublie et activationCompte.ts
// pour construire un lien absolu — mais sans repli sur l'URL de la requête
// ici (les fonctions ci-dessous n'ont pas accès à `req`, voir leurs appelants
// dans l'historique, ex. src/app/api/referent/sessions/[sessionId]/valider).
// Si NEXTAUTH_URL n'est pas configurée, "PrepaStan" reste du texte simple
// plutôt que de pointer vers un lien cassé.
const LIEN_PREPASTAN = process.env.NEXTAUTH_URL
  ? `<a href="${process.env.NEXTAUTH_URL}">PrepaStan</a>`
  : "PrepaStan";

// Resend impose une limite de 10 requêtes/seconde PAR ÉQUIPE, tous
// environnements et tous types d'email confondus (voir
// https://resend.com/docs/api-reference/rate-limit) — au-delà, elle
// répond 429, jamais retentée par les appelants ci-dessous (chacun logue
// l'échec en console et abandonne, par design, pour ne jamais faire
// planter l'opération déclenchante). Sans limiteur, publier un planning à
// plus d'une dizaine d'étudiants perdait ainsi silencieusement toutes les
// convocations au-delà de la dizaine envoyée dans la même seconde
// (constaté en démo : 10 convocations reçues sur 29 envoyées d'un coup).
// Espacer chaque appel d'au moins INTERVALLE_MIN_MS (avec une marge sous
// 1000/10 = 100ms) ramène n'importe quelle rafale à un débit soutenable,
// quelle que soit la fonction d'envoi appelante — y compris plusieurs
// déclenchées en parallèle (ex. une publication de planning en même temps
// qu'un rappel automatique), puisque c'est ici, dans l'unique point de
// passage vers Resend, et non dans chaque boucle d'envoi en masse.
// Réservation de créneau : lecture puis écriture de prochainCreneauDisponible
// entièrement synchrones (aucun await entre les deux), donc jamais de
// concurrence possible même si reserverCreneauResend() est appelée de
// nombreuses fois "en même temps" (Promise.allSettled sur un gros tableau) —
// chaque appel repart toujours du dernier créneau réservé par le précédent.
const INTERVALLE_MIN_MS = 110;
let prochainCreneauDisponible = 0;

function reserverCreneauResend(): Promise<void> {
  const maintenant = Date.now();
  const debut = Math.max(maintenant, prochainCreneauDisponible);
  prochainCreneauDisponible = debut + INTERVALLE_MIN_MS;
  const attente = debut - maintenant;
  return attente > 0 ? new Promise((resolve) => setTimeout(resolve, attente)) : Promise.resolve();
}

// Point de passage UNIQUE de tous les envois (quel que soit le rôle
// destinataire — kholleur, étudiant, référent, admin) : permet le mode test
// (Paramètres) qui redirige tout vers une même adresse, sans avoir à
// toucher chacune des fonctions d'envoi ci-dessous. Le destinataire réel
// est préfixé dans le sujet pour rester traçable même en mode test. Appelé
// seulement une fois `resend` vérifié non nul par l'appelant (voir le garde
// `if (!resend) {...}` au début de chaque fonction ci-dessous).
async function envoyerViaResend({
  destinataire,
  subject,
  html,
}: {
  destinataire: string;
  subject: string;
  html: string;
}): Promise<void> {
  const parametres = await prisma.parametresApplication.findUnique({ where: { id: "singleton" } });
  const modeTest = parametres?.modeTestEmail && parametres.emailModeTest;

  await reserverCreneauResend();
  await resend!.emails.send({
    from: EXPEDITEUR,
    to: modeTest ? parametres!.emailModeTest! : destinataire,
    subject: modeTest ? `[TEST — destinataire réel : ${destinataire}] ${subject}` : subject,
    html,
  });
}

export type CreneauEmail = {
  date: Date;
  heureDebut: string;
  heureFin: string;
  disciplineNom: string;
  salleNom: string;
  eleves: string[];
};

function formaterDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

// Le corps personnalisable (Paramètres) est du texte brut saisi dans une
// simple textarea, jamais du HTML : on échappe les caractères spéciaux puis
// on convertit les retours à la ligne, plutôt que d'injecter tel quel dans
// l'email (qui casserait sinon le rendu si l'admin tape un "<" ou "&").
function corpsPersonnaliseEnHtml(corps: string): string {
  const echappe = corps
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return echappe
    .split("\n\n")
    .map((paragraphe) => `<p>${paragraphe.replaceAll("\n", "<br>")}</p>`)
    .join("");
}

function resoudreCorps(
  modelePersonnalise: string | null | undefined,
  defaut: string,
  destinataire: { nom: string; prenom: string }
): string {
  const modele = modelePersonnalise?.trim() ? modelePersonnalise : defaut;
  return corpsPersonnaliseEnHtml(remplacerPlaceholders(modele, destinataire));
}

// Envoie au kholleur le récapitulatif de ses créneaux pour la semaine qui
// vient d'être publiée. N'échoue jamais bruyamment : une erreur d'envoi est
// juste loguée, pour ne pas empêcher la publication du planning côté admin.
export async function envoyerEmailPublicationPlanning({
  destinataire,
  nomKholleur,
  prenomKholleur,
  classeNom,
  semaine,
  creneaux,
  corpsPersonnalise,
}: {
  destinataire: string;
  nomKholleur: string;
  prenomKholleur: string;
  classeNom: string;
  semaine: number;
  creneaux: CreneauEmail[];
  corpsPersonnalise?: string | null;
}): Promise<void> {
  if (!resend) {
    console.warn(`RESEND_API_KEY non configuré : email de publication non envoyé à ${destinataire}`);
    return;
  }

  const lignes = creneaux
    .map(
      (c) =>
        `<tr><td>${formaterDate(c.date)}</td><td>${c.heureDebut}-${c.heureFin}</td>` +
        `<td>${c.disciplineNom}</td><td>${c.salleNom}</td><td>${c.eleves.join(", ")}</td></tr>`
    )
    .join("");

  const corps = resoudreCorps(corpsPersonnalise, MODELES_EMAIL_PAR_DEFAUT.KHOLLEUR, {
    nom: nomKholleur,
    prenom: prenomKholleur,
  });

  try {
    await envoyerViaResend({
      destinataire,
      subject: `PrepaStan — Planning ${classeNom} semaine ${semaine} publié`,
      html: `
        ${corps}
        <p>Voici le planning de la classe ${classeNom} (semaine ${semaine}) :</p>
        <table cellpadding="6" style="border-collapse: collapse;">
          <thead>
            <tr style="text-align:left;">
              <th>Jour</th><th>Horaire</th><th>Discipline</th><th>Salle</th><th>Élèves</th>
            </tr>
          </thead>
          <tbody>${lignes}</tbody>
        </table>
        <p>Connectez-vous à ${LIEN_PREPASTAN} pour saisir les notes et appréciations.</p>
      `,
    });
  } catch (err) {
    console.error(`Échec de l'envoi de l'email de publication à ${destinataire} :`, err);
  }
}

// Mot de passe oublié, tous rôles confondus (kholleur, référent, élève,
// admin). Le lien contient le token en clair (jamais stocké en base, voir
// TokenReinitialisationMotDePasse). N'échoue jamais bruyamment, comme les
// autres emails ci-dessus.
export async function envoyerEmailReinitialisationMotDePasse({
  destinataire,
  nomUtilisateur,
  lien,
}: {
  destinataire: string;
  nomUtilisateur: string;
  lien: string;
}): Promise<void> {
  if (!resend) {
    console.warn(`RESEND_API_KEY non configuré : email de réinitialisation non envoyé à ${destinataire}`);
    return;
  }

  try {
    await envoyerViaResend({
      destinataire,
      subject: "PrepaStan — Réinitialisation de votre mot de passe",
      html: `
        <p>Bonjour ${nomUtilisateur},</p>
        <p>Vous avez demandé la réinitialisation de votre mot de passe PrepaStan.
        Cliquez sur le lien ci-dessous pour en choisir un nouveau (valable 1 heure) :</p>
        <p><a href="${lien}">${lien}</a></p>
        <p>Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email :
        votre mot de passe actuel reste inchangé.</p>
      `,
    });
  } catch (err) {
    console.error(`Échec de l'envoi de l'email de réinitialisation à ${destinataire} :`, err);
  }
}

// Construction pure (sujet + HTML), séparée de l'envoi : réutilisée telle
// quelle par /api/admin/envoi-identifiants/apercu pour prévisualiser le
// rendu exact d'un email d'activation sans jamais l'envoyer — utile
// notamment en démo, où les adresses synthétiques (ex. @demo.prepastan.local)
// ne peuvent de toute façon recevoir aucun email réel (voir RESEND_API_KEY,
// volontairement absente de .env.demo).
export function construireEmailActivationCompte({
  destinataire,
  nomUtilisateur,
  lien,
}: {
  destinataire: string;
  nomUtilisateur: string;
  lien: string;
}): { subject: string; html: string } {
  return {
    subject: "PrepaStan — Activez votre compte",
    html: `
        <p>Bonjour ${nomUtilisateur},</p>
        <p>Un compte PrepaStan vient d'être créé pour vous, avec cette adresse (${destinataire}).
        Cliquez sur le lien ci-dessous pour choisir votre mot de passe (valable 7 jours) :</p>
        <p><a href="${lien}">${lien}</a></p>
        <p>Si vous ne vous attendiez pas à cet email, vous pouvez l'ignorer.</p>
      `,
  };
}

// Premier email reçu par un compte fraîchement créé (ajout individuel ou
// import CSV) : pas de mot de passe en clair, un lien à usage unique (7
// jours, voir DUREE_VALIDITE_TOKEN_ACTIVATION_MS) vers la même page que
// "mot de passe oublié", où la personne choisit elle-même son mot de passe
// avant sa toute première connexion. N'échoue jamais bruyamment, comme les
// autres emails ci-dessus.
export async function envoyerEmailActivationCompte({
  destinataire,
  nomUtilisateur,
  lien,
}: {
  destinataire: string;
  nomUtilisateur: string;
  lien: string;
}): Promise<void> {
  if (!resend) {
    console.warn(`RESEND_API_KEY non configuré : email d'activation non envoyé à ${destinataire}`);
    return;
  }

  const { subject, html } = construireEmailActivationCompte({ destinataire, nomUtilisateur, lien });

  try {
    await envoyerViaResend({ destinataire, subject, html });
  } catch (err) {
    console.error(`Échec de l'envoi de l'email d'activation à ${destinataire} :`, err);
  }
}

// Notifie un professeur référent que tous les kholleurs de sa session ont
// validé leur grille de notation : il peut désormais valider la session à
// son tour (voir /api/kholleur/sessions/[sessionId]/valider, qui détecte ce
// moment). N'échoue jamais bruyamment, comme les autres emails ci-dessus.
export async function envoyerEmailGrillesValidees({
  destinataire,
  nomReferent,
  prenomReferent,
  classeNom,
  disciplineNom,
  semaine,
  corpsPersonnalise,
}: {
  destinataire: string;
  nomReferent: string;
  prenomReferent: string;
  classeNom: string;
  disciplineNom: string;
  semaine: number;
  corpsPersonnalise?: string | null;
}): Promise<void> {
  if (!resend) {
    console.warn(`RESEND_API_KEY non configuré : email de grilles validées non envoyé à ${destinataire}`);
    return;
  }

  const corps = resoudreCorps(corpsPersonnalise, MODELES_EMAIL_PAR_DEFAUT.REFERENT, {
    nom: nomReferent,
    prenom: prenomReferent,
  });

  try {
    await envoyerViaResend({
      destinataire,
      subject: `PrepaStan — Grilles validées : ${disciplineNom}, ${classeNom} semaine ${semaine}`,
      html: `
        ${corps}
        <p>Classe ${classeNom} — ${disciplineNom} — semaine ${semaine}.</p>
        <p>Connectez-vous à ${LIEN_PREPASTAN} pour valider la session.</p>
      `,
    });
  } catch (err) {
    console.error(`Échec de l'envoi de l'email de grilles validées à ${destinataire} :`, err);
  }
}

// Notifie un élève que sa note et son appréciation sont disponibles, une
// fois la session clôturée par le professeur référent (voir
// /api/referent/sessions/[sessionId]/valider). N'envoyé qu'aux élèves ayant
// un compte de connexion (Eleve.utilisateurId non nul). N'échoue jamais
// bruyamment, comme les autres emails ci-dessus.
export async function envoyerEmailNoteDisponible({
  destinataire,
  nomEleve,
  prenomEleve,
  classeNom,
  disciplineNom,
  semaine,
  corpsPersonnalise,
}: {
  destinataire: string;
  nomEleve: string;
  prenomEleve: string;
  classeNom: string;
  disciplineNom: string;
  semaine: number;
  corpsPersonnalise?: string | null;
}): Promise<void> {
  if (!resend) {
    console.warn(`RESEND_API_KEY non configuré : email de note disponible non envoyé à ${destinataire}`);
    return;
  }

  const corps = resoudreCorps(corpsPersonnalise, MODELES_EMAIL_PAR_DEFAUT.ELEVE, {
    nom: nomEleve,
    prenom: prenomEleve,
  });

  try {
    await envoyerViaResend({
      destinataire,
      subject: `PrepaStan — Note disponible : ${disciplineNom}, ${classeNom} semaine ${semaine}`,
      html: `
        ${corps}
        <p>Classe ${classeNom} — ${disciplineNom} — semaine ${semaine}.</p>
        <p>Connectez-vous à ${LIEN_PREPASTAN} pour la consulter.</p>
      `,
    });
  } catch (err) {
    console.error(`Échec de l'envoi de l'email de note disponible à ${destinataire} :`, err);
  }
}

export type CreneauConvocationEmail = {
  date: Date;
  // Absente pour les créneaux créés avant l'introduction de ce champ (voir
  // Creneau.heureDebutPreparation côté schema.prisma) : on retombe alors sur
  // heureDebut, comme partout ailleurs dans l'appli.
  heureDebutPreparation: string | null;
  heureDebut: string;
  heureFin: string;
  disciplineNom: string;
  salleNom: string;
  kholleurNom: string;
};

// Convoque un élève à sa/ses khôlle(s) de la semaine qui vient d'être
// publiée (voir /api/admin/planification/[classeId]/[semaine]/publier) :
// jour, heure de début de préparation, heure de passage, discipline,
// kholleur, salle — tout ce qu'il lui faut pour s'y présenter sans avoir à
// se connecter. N'envoyé qu'aux élèves ayant un compte de connexion (comme
// envoyerEmailNoteDisponible). Pas de corps personnalisable (contrairement
// aux emails ci-dessus) : le contenu est entièrement factuel, rien à
// reformuler par l'admin. N'échoue jamais bruyamment, comme les autres
// emails ci-dessus.
export async function envoyerEmailConvocationKholle({
  destinataire,
  nomEleve,
  prenomEleve,
  classeNom,
  semaine,
  creneaux,
}: {
  destinataire: string;
  nomEleve: string;
  prenomEleve: string;
  classeNom: string;
  semaine: number;
  creneaux: CreneauConvocationEmail[];
}): Promise<void> {
  if (!resend) {
    console.warn(`RESEND_API_KEY non configuré : email de convocation non envoyé à ${destinataire}`);
    return;
  }

  const lignes = creneaux
    .map(
      (c) =>
        `<tr><td>${formaterDate(c.date)}</td><td>${c.heureDebutPreparation ?? c.heureDebut}</td>` +
        `<td>${c.heureDebut}-${c.heureFin}</td><td>${c.disciplineNom}</td><td>${c.kholleurNom}</td>` +
        `<td>${c.salleNom}</td></tr>`
    )
    .join("");

  try {
    await envoyerViaResend({
      destinataire,
      subject: `PrepaStan — Convocation : khôlle(s) ${classeNom} semaine ${semaine}`,
      html: `
        <p>Bonjour ${prenomEleve} ${nomEleve},</p>
        <p>Voici votre convocation à la khôlle de la semaine ${semaine} (classe ${classeNom}) :</p>
        <table cellpadding="6" style="border-collapse: collapse;">
          <thead>
            <tr style="text-align:left;">
              <th>Jour</th><th>Début préparation</th><th>Passage</th><th>Discipline</th><th>Khôlleur</th><th>Salle</th>
            </tr>
          </thead>
          <tbody>${lignes}</tbody>
        </table>
        <p>Pensez à vous présenter dès le début de votre préparation.</p>
      `,
    });
  } catch (err) {
    console.error(`Échec de l'envoi de l'email de convocation à ${destinataire} :`, err);
  }
}

// Rappel envoyé à un kholleur qui n'a pas encore validé sa grille de
// notation pour une session déjà khôllée, passé le délai configuré dans
// Paramètres (voir src/lib/rappelsNotation.ts). N'échoue jamais bruyamment,
// comme envoyerEmailPublicationPlanning ci-dessus.
export async function envoyerEmailRappelNotation({
  destinataire,
  nomKholleur,
  classeNom,
  disciplineNom,
  semaine,
}: {
  destinataire: string;
  nomKholleur: string;
  classeNom: string;
  disciplineNom: string;
  semaine: number;
}): Promise<void> {
  if (!resend) {
    console.warn(`RESEND_API_KEY non configuré : email de rappel non envoyé à ${destinataire}`);
    return;
  }

  try {
    await envoyerViaResend({
      destinataire,
      subject: `PrepaStan — Rappel : notes à saisir (${disciplineNom}, ${classeNom} semaine ${semaine})`,
      html: `
        <p>Bonjour ${nomKholleur},</p>
        <p>Les notes et appréciations de vos khôlles de ${disciplineNom} pour la classe ${classeNom}
        (semaine ${semaine}) n'ont pas encore été saisies.</p>
        <p>Connectez-vous à ${LIEN_PREPASTAN} pour compléter votre grille de notation dès que possible.</p>
      `,
    });
  } catch (err) {
    console.error(`Échec de l'envoi de l'email de rappel à ${destinataire} :`, err);
  }
}
