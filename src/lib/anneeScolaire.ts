// L'année scolaire est pilotée par un sélecteur global dans le menu du
// haut (cookie ANNEE_SCOLAIRE_COOKIE), plutôt que d'être redemandée à
// chaque création de classe. Les libellés proposés ("2026-2027", etc.) sont
// calculés à la volée à partir de la date du jour, pas stockés en dur.

export const ANNEE_SCOLAIRE_COOKIE = "anneeScolaireCourante";
const NOMBRE_ANNEES_PROPOSEES = 6; // l'année en cours + 5 suivantes

// Une année scolaire commence en août : avant août, on est encore dans
// l'année scolaire qui a commencé l'année civile précédente.
export function anneeScolaireCourante(maintenant: Date = new Date()): string {
  const anneeDebut = maintenant.getMonth() >= 7 ? maintenant.getFullYear() : maintenant.getFullYear() - 1;
  return `${anneeDebut}-${anneeDebut + 1}`;
}

export function anneesScolairesProposees(maintenant: Date = new Date()): string[] {
  const [premiereAnnee] = anneeScolaireCourante(maintenant).split("-").map(Number);
  return Array.from({ length: NOMBRE_ANNEES_PROPOSEES }, (_, i) => `${premiereAnnee + i}-${premiereAnnee + i + 1}`);
}
