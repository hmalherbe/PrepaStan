import { MODELES_EMAIL_PAR_DEFAUT, remplacerPlaceholders } from "@/lib/modelesEmail";
import { prisma } from "@/lib/prisma";

// Sans clé configurée, on ne bloque jamais l'application pour un email : on
// logue et on continue (utile en développement local sans compte Brevo).
const BREVO_API_KEY = process.env.BREVO_API_KEY;

// "Nom <email>" — l'adresse doit appartenir à un domaine vérifié dans Brevo
// (Senders, Domains & Dedicated IPs → Domains, vérification par DNS), sans
// quoi l'envoi échoue (voir le contrôle de `reponse.ok` dans envoyerViaBrevo
// ci-dessous). Contrairement à Resend, cette adresse n'a pas besoin d'être
// réellement consultée : seul le domaine est vérifié, pas chaque boîte.
const EXPEDITEUR = process.env.BREVO_FROM_EMAIL ?? "PrepaStan <contact@prepastan.fr>";

// Adresse où atterrissent les réponses à nos emails (ex. un étudiant qui
// répond à sa convocation) — distincte de l'expéditeur ci-dessus. Simple
// en-tête email standard, sans aucune configuration ni vérification côté
// Brevo : optionnelle (pas d'en-tête Reply-To du tout si absente).
const REPONDRE_A = process.env.EMAIL_REPLY_TO;

// Même variable que /api/auth/mot-de-passe-oublie et activationCompte.ts
// pour construire un lien absolu — mais sans repli sur l'URL de la requête
// ici (les fonctions ci-dessous n'ont pas accès à `req`, voir leurs appelants
// dans l'historique, ex. src/app/api/referent/sessions/[sessionId]/valider).
// Si NEXTAUTH_URL n'est pas configurée, "PrepaStan" reste du texte simple
// plutôt que de pointer vers un lien cassé.
const LIEN_PREPASTAN = process.env.NEXTAUTH_URL
  ? `<a href="${process.env.NEXTAUTH_URL}">PrepaStan</a>`
  : "PrepaStan";

// Limite de débit prudente et volontairement conservatrice : Brevo autorise
// un débit par seconde nettement plus élevé que l'ancienne limite dure de
// Resend (10 req/s), mais les chiffres exacts varient selon la source — et
// cette marge ne coûte rien, le débit réel de cette appli ne dépassant
// jamais quelques dizaines d'emails d'un coup (publication d'un planning à
// une classe entière). Espacer chaque appel d'au moins INTERVALLE_MIN_MS
// ramène n'importe quelle rafale à un débit soutenable, quelle que soit la
// fonction d'envoi appelante — y compris plusieurs déclenchées en parallèle
// (ex. une publication de planning en même temps qu'un rappel automatique),
// puisque c'est ici, dans l'unique point de passage vers Brevo, et non dans
// chaque boucle d'envoi en masse.
// Réservation de créneau : lecture puis écriture de prochainCreneauDisponible
// entièrement synchrones (aucun await entre les deux), donc jamais de
// concurrence possible même si reserverCreneauEnvoi() est appelée de
// nombreuses fois "en même temps" (Promise.allSettled sur un gros tableau) —
// chaque appel repart toujours du dernier créneau réservé par le précédent.
const INTERVALLE_MIN_MS = 110;
let prochainCreneauDisponible = 0;

function reserverCreneauEnvoi(): Promise<void> {
  const maintenant = Date.now();
  const debut = Math.max(maintenant, prochainCreneauDisponible);
  prochainCreneauDisponible = debut + INTERVALLE_MIN_MS;
  const attente = debut - maintenant;
  return attente > 0 ? new Promise((resolve) => setTimeout(resolve, attente)) : Promise.resolve();
}

// "Nom <email>" -> { name, email } attendu par l'API Brevo (deux champs
// séparés, contrairement au Resend précédent qui acceptait la chaîne telle
// quelle). Sans "<...>" dans la valeur, le nom est simplement omis.
function analyserExpediteur(valeur: string): { name?: string; email: string } {
  const correspondance = valeur.match(/^(.*)<(.+)>$/);
  if (!correspondance) return { email: valeur.trim() };
  const nom = correspondance[1].trim();
  return { name: nom || undefined, email: correspondance[2].trim() };
}

// Point de passage UNIQUE de tous les envois (quel que soit le rôle
// destinataire — kholleur, étudiant, référent, admin) : permet le mode test
// (Paramètres) qui redirige tout vers une même adresse, sans avoir à
// toucher chacune des fonctions d'envoi ci-dessous. Le destinataire réel
// est préfixé dans le sujet pour rester traçable même en mode test. Appelé
// seulement une fois `BREVO_API_KEY` vérifiée définie par l'appelant (voir
// le garde `if (!BREVO_API_KEY) {...}` au début de chaque fonction
// ci-dessous).
async function envoyerViaBrevo({
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

  await reserverCreneauEnvoi();
  const reponse = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": BREVO_API_KEY!,
    },
    body: JSON.stringify({
      sender: analyserExpediteur(EXPEDITEUR),
      to: [{ email: modeTest ? parametres!.emailModeTest! : destinataire }],
      ...(REPONDRE_A ? { replyTo: { email: REPONDRE_A } } : {}),
      subject: modeTest ? `[TEST — destinataire réel : ${destinataire}] ${subject}` : subject,
      htmlContent: html,
    }),
  });
  // L'API REST de Brevo renvoie un vrai code HTTP non-2xx en cas de refus
  // (ex. 402 pour un quota journalier/mensuel dépassé, 400 pour un domaine
  // non vérifié) — un simple contrôle de `reponse.ok` suffit donc ici,
  // contrairement au SDK Resend utilisé auparavant qui ne levait JAMAIS
  // d'exception pour un refus côté API (uniquement pour une panne réseau),
  // laissant chaque refus passer totalement inaperçu malgré le try/catch de
  // chaque fonction d'envoi ci-dessous (bug corrigé ici à l'occasion de
  // cette migration).
  if (!reponse.ok) {
    const corps = await reponse.text();
    throw new Error(`Brevo a refusé l'envoi (${reponse.status}) : ${corps}`);
  }
}

// Journalise un échec d'envoi : console (comme avant) + une ligne en base
// (EchecEnvoiEmail), consultable sur /admin/suivi plutôt que de rester
// enfoui dans les logs du conteneur. Volontairement séparée de l'appel à
// envoyerViaBrevo ci-dessus : chaque fonction d'envoi ci-dessous reste seule
// à connaître son propre `type` et son `contexte` (classe/semaine/
// discipline le cas échéant). N'aggrave jamais l'échec d'origine si
// l'écriture en base échoue à son tour (ex. base momentanément
// injoignable) : simple log de secours, jamais relancé vers l'appelant.
async function enregistrerEchecEnvoi({
  type,
  destinataire,
  contexte,
  erreur,
}: {
  type: string;
  destinataire: string;
  contexte?: string;
  erreur: unknown;
}): Promise<void> {
  const message = erreur instanceof Error ? erreur.message : String(erreur);
  console.error(
    `Échec de l'envoi de l'email (${type}) à ${destinataire}${contexte ? ` [${contexte}]` : ""} :`,
    erreur
  );
  try {
    await prisma.echecEnvoiEmail.create({ data: { type, destinataire, contexte: contexte ?? null, erreur: message } });
  } catch (err) {
    console.error("Échec de l'enregistrement en base de l'échec d'envoi ci-dessus :", err);
  }
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
  if (!BREVO_API_KEY) {
    console.warn(`BREVO_API_KEY non configuré : email de publication non envoyé à ${destinataire}`);
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
    await envoyerViaBrevo({
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
    await enregistrerEchecEnvoi({
      type: "publication_planning",
      destinataire,
      contexte: `${classeNom} semaine ${semaine}`,
      erreur: err,
    });
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
  if (!BREVO_API_KEY) {
    console.warn(`BREVO_API_KEY non configuré : email de réinitialisation non envoyé à ${destinataire}`);
    return;
  }

  try {
    await envoyerViaBrevo({
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
    await enregistrerEchecEnvoi({ type: "reinitialisation_mot_de_passe", destinataire, erreur: err });
  }
}

// Construction pure (sujet + HTML), séparée de l'envoi : réutilisée telle
// quelle par /api/admin/envoi-identifiants/apercu pour prévisualiser le
// rendu exact d'un email d'activation sans jamais l'envoyer — utile
// notamment en démo, où les adresses synthétiques (ex. @demo.prepastan.local)
// ne peuvent de toute façon recevoir aucun email réel (voir BREVO_API_KEY,
// volontairement absente de .env.demo).
export function construireEmailActivationCompte({
  prenom,
  nom,
  lien,
}: {
  prenom: string;
  nom: string;
  lien: string;
}): { subject: string; html: string } {
  return {
    subject: "Bienvenue sur votre espace de gestion des Khôlles Prepa D1 Droit - Economie - Stanislas",
    html: `
        <p>Bonjour ${prenom} ${nom},</p>
        <p>Bienvenue sur votre espace de gestion des khôlles !</p>
        <p>Un compte personnel a été créé à votre intention. Il vous permettra de recevoir par mail vos
        plannings de khôlles, les notifications et de saisir puis valider vos notes et commentaires, qui
        seront ensuite transmis aux professeurs référents et aux étudiants.</p>
        <p>Pour accéder à votre espace personnel, nous vous invitons à définir votre mot de passe en
        cliquant sur le lien ci-dessous :</p>
        <p><a href="${lien}">${lien}</a></p>
        <p>Ce lien est valable pendant 7 jours.</p>
        <p>Nous vous souhaitons une agréable prise en main de cet outil.</p>
        <p>Bien cordialement,<br>L'équipe de la prépa D1 Droit-Économie</p>
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
  prenom,
  nom,
  lien,
}: {
  destinataire: string;
  prenom: string;
  nom: string;
  lien: string;
}): Promise<void> {
  if (!BREVO_API_KEY) {
    console.warn(`BREVO_API_KEY non configuré : email d'activation non envoyé à ${destinataire}`);
    return;
  }

  const { subject, html } = construireEmailActivationCompte({ prenom, nom, lien });

  try {
    await envoyerViaBrevo({ destinataire, subject, html });
  } catch (err) {
    await enregistrerEchecEnvoi({ type: "activation_compte", destinataire, erreur: err });
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
  if (!BREVO_API_KEY) {
    console.warn(`BREVO_API_KEY non configuré : email de grilles validées non envoyé à ${destinataire}`);
    return;
  }

  const corps = resoudreCorps(corpsPersonnalise, MODELES_EMAIL_PAR_DEFAUT.REFERENT, {
    nom: nomReferent,
    prenom: prenomReferent,
  });

  try {
    await envoyerViaBrevo({
      destinataire,
      subject: `PrepaStan — Grilles validées : ${disciplineNom}, ${classeNom} semaine ${semaine}`,
      html: `
        ${corps}
        <p>Classe ${classeNom} — ${disciplineNom} — semaine ${semaine}.</p>
        <p>Connectez-vous à ${LIEN_PREPASTAN} pour valider la session.</p>
      `,
    });
  } catch (err) {
    await enregistrerEchecEnvoi({
      type: "grilles_validees",
      destinataire,
      contexte: `${disciplineNom}, ${classeNom} semaine ${semaine}`,
      erreur: err,
    });
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
  if (!BREVO_API_KEY) {
    console.warn(`BREVO_API_KEY non configuré : email de note disponible non envoyé à ${destinataire}`);
    return;
  }

  const corps = resoudreCorps(corpsPersonnalise, MODELES_EMAIL_PAR_DEFAUT.ELEVE, {
    nom: nomEleve,
    prenom: prenomEleve,
  });

  try {
    await envoyerViaBrevo({
      destinataire,
      subject: `PrepaStan — Note disponible : ${disciplineNom}, ${classeNom} semaine ${semaine}`,
      html: `
        ${corps}
        <p>Classe ${classeNom} — ${disciplineNom} — semaine ${semaine}.</p>
        <p>Connectez-vous à ${LIEN_PREPASTAN} pour la consulter.</p>
      `,
    });
  } catch (err) {
    await enregistrerEchecEnvoi({
      type: "note_disponible",
      destinataire,
      contexte: `${disciplineNom}, ${classeNom} semaine ${semaine}`,
      erreur: err,
    });
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
  if (!BREVO_API_KEY) {
    console.warn(`BREVO_API_KEY non configuré : email de convocation non envoyé à ${destinataire}`);
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
    await envoyerViaBrevo({
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
    await enregistrerEchecEnvoi({
      type: "convocation",
      destinataire,
      contexte: `${classeNom} semaine ${semaine}`,
      erreur: err,
    });
  }
}

// Invitation envoyée au kholleur le matin même de sa khôlle, une fois par
// jour (voir envoyerInvitationsJourMemeEnAttente dans
// src/lib/rappelsNotation.ts), listant toutes ses khôlles du jour — qu'il
// khôlle une seule fois ou plusieurs fois dans la journée, sur une ou
// plusieurs disciplines/classes. N'échoue jamais bruyamment, comme
// envoyerEmailPublicationPlanning ci-dessus.
export async function envoyerEmailInvitationNotationJourMeme({
  destinataire,
  nomKholleur,
  creneaux,
}: {
  destinataire: string;
  nomKholleur: string;
  creneaux: CreneauEmail[];
}): Promise<void> {
  if (!BREVO_API_KEY) {
    console.warn(`BREVO_API_KEY non configuré : email d'invitation (jour même) non envoyé à ${destinataire}`);
    return;
  }

  const lignes = creneaux
    .map(
      (c) =>
        `<tr><td>${c.heureDebut}-${c.heureFin}</td><td>${c.disciplineNom}</td>` +
        `<td>${c.salleNom}</td><td>${c.eleves.join(", ")}</td></tr>`
    )
    .join("");

  try {
    await envoyerViaBrevo({
      destinataire,
      subject: "PrepaStan — Vous khôllez aujourd'hui",
      html: `
        <p>Bonjour ${nomKholleur},</p>
        <p>Vous donnez khôlle aujourd'hui :</p>
        <table cellpadding="6" style="border-collapse: collapse;">
          <thead>
            <tr style="text-align:left;">
              <th>Horaire</th><th>Discipline</th><th>Salle</th><th>Élèves</th>
            </tr>
          </thead>
          <tbody>${lignes}</tbody>
        </table>
        <p>Pensez à saisir les notes et appréciations sur ${LIEN_PREPASTAN} une fois chaque khôlle terminée.</p>
      `,
    });
  } catch (err) {
    await enregistrerEchecEnvoi({ type: "invitation_jour_meme", destinataire, erreur: err });
  }
}
