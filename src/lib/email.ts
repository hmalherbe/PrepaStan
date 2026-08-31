import { Resend } from "resend";

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

// Envoie au kholleur le récapitulatif de ses créneaux pour la semaine qui
// vient d'être publiée. N'échoue jamais bruyamment : une erreur d'envoi est
// juste loguée, pour ne pas empêcher la publication du planning côté admin.
export async function envoyerEmailPublicationPlanning({
  destinataire,
  nomKholleur,
  classeNom,
  semaine,
  creneaux,
}: {
  destinataire: string;
  nomKholleur: string;
  classeNom: string;
  semaine: number;
  creneaux: CreneauEmail[];
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

  try {
    await resend.emails.send({
      from: EXPEDITEUR,
      to: destinataire,
      subject: `PrepaStan — Planning ${classeNom} semaine ${semaine} publié`,
      html: `
        <p>Bonjour ${nomKholleur},</p>
        <p>Le planning de la classe ${classeNom} (semaine ${semaine}) vient d'être publié.
        Voici vos créneaux :</p>
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
