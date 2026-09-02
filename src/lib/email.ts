import { Resend } from "resend";
import { MODELES_EMAIL_PAR_DEFAUT, remplacerPlaceholders } from "@/lib/modelesEmail";

// Sans clé configurée, on ne bloque jamais l'application pour un email : on
// logue et on continue (utile en développement local sans compte Resend).
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Tant que le domaine d'envoi n'est pas vérifié sur Resend, seul
// `onboarding@resend.dev` fonctionne, et uniquement vers l'adresse du compte
// Resend lui-même — voir https://resend.com/docs/dashboard/domains/introduction.
const EXPEDITEUR = process.env.RESEND_FROM_EMAIL ?? "PrepaStan <onboarding@resend.dev>";

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
    await resend.emails.send({
      from: EXPEDITEUR,
      to: destinataire,
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
        <p>Connectez-vous à PrepaStan pour saisir les notes et appréciations.</p>
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
    await resend.emails.send({
      from: EXPEDITEUR,
      to: destinataire,
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
    await resend.emails.send({
      from: EXPEDITEUR,
      to: destinataire,
      subject: `PrepaStan — Grilles validées : ${disciplineNom}, ${classeNom} semaine ${semaine}`,
      html: `
        ${corps}
        <p>Classe ${classeNom} — ${disciplineNom} — semaine ${semaine}.</p>
        <p>Connectez-vous à PrepaStan pour valider la session.</p>
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
    await resend.emails.send({
      from: EXPEDITEUR,
      to: destinataire,
      subject: `PrepaStan — Note disponible : ${disciplineNom}, ${classeNom} semaine ${semaine}`,
      html: `
        ${corps}
        <p>Classe ${classeNom} — ${disciplineNom} — semaine ${semaine}.</p>
        <p>Connectez-vous à PrepaStan pour la consulter.</p>
      `,
    });
  } catch (err) {
    console.error(`Échec de l'envoi de l'email de note disponible à ${destinataire} :`, err);
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
    await resend.emails.send({
      from: EXPEDITEUR,
      to: destinataire,
      subject: `PrepaStan — Rappel : notes à saisir (${disciplineNom}, ${classeNom} semaine ${semaine})`,
      html: `
        <p>Bonjour ${nomKholleur},</p>
        <p>Les notes et appréciations de vos khôlles de ${disciplineNom} pour la classe ${classeNom}
        (semaine ${semaine}) n'ont pas encore été saisies.</p>
        <p>Connectez-vous à PrepaStan pour compléter votre grille de notation dès que possible.</p>
      `,
    });
  } catch (err) {
    console.error(`Échec de l'envoi de l'email de rappel à ${destinataire} :`, err);
  }
}
