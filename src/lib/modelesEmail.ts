// Modèles de corps de mail personnalisables depuis Paramètres, un par rôle
// destinataire. Un modèle non renseigné (null en base) retombe sur le texte
// par défaut ci-dessous. Les placeholders sont remplacés au moment de
// l'envoi par le nom/prénom du destinataire réel (voir remplacerPlaceholders).
export const MODELES_EMAIL_PAR_DEFAUT = {
  KHOLLEUR:
    "Bonjour #Prénom #Nom,\n\nLe planning de la semaine qui vient vient d'être publié. Voici vos créneaux :",
  REFERENT:
    "Bonjour #Prénom #Nom,\n\nTous les kholleurs de la session ci-dessous ont validé leur grille de notation. Vous pouvez désormais valider la session.",
  ELEVE:
    "Bonjour #Prénom #Nom,\n\nVotre note et l'appréciation de votre dernière khôlle sont disponibles. Connectez-vous à PrepaStan pour les consulter.",
} as const;

export type RoleModeleEmail = keyof typeof MODELES_EMAIL_PAR_DEFAUT;

export function remplacerPlaceholders(texte: string, { nom, prenom }: { nom: string; prenom: string }): string {
  return texte.replaceAll("#Prénom", prenom).replaceAll("#Nom", nom);
}
