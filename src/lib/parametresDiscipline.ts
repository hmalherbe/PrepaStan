// Valeurs par défaut quand aucune ligne ParametreDiscipline n'existe encore
// pour une (classe, discipline) — ex. une discipline tout juste assignée à
// une classe. Reproduit la convention observée sur les plannings existants
// (30 min de préparation / 20 min de khôlle pour une matière non langue,
// 20/20 pour une langue vivante) ; l'admin peut ensuite ajuster au cas par
// cas depuis l'écran Paramètres (ex. certaines classes khôllent Économie/
// Entretien sur 25 min).
export function dureesParDefaut(estLangueVivante: boolean): {
  dureePreparationMinutes: number;
  dureeKholleMinutes: number;
} {
  return estLangueVivante
    ? { dureePreparationMinutes: 20, dureeKholleMinutes: 20 }
    : { dureePreparationMinutes: 30, dureeKholleMinutes: 20 };
}
