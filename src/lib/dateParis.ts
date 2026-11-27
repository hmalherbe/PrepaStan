// Utilitaires de date/heure en fuseau Europe/Paris, partagés par les
// rappels/invitations automatiques (rappelsNotation.ts) et le résumé
// hebdomadaire (resumeHebdomadaire.ts) — centralisés ici après avoir
// découvert le même bug dupliqué dans les deux fichiers : la locale
// "fr-FR" ajoute un suffixe (" h", ex. "08 h") au format heure seule selon
// la version d'ICU du runtime Node, qui cassait silencieusement
// Number(...) en NaN. Comme `NaN < 9` vaut toujours `false` en JS, la garde
// "pas avant telle heure" ne bloquait alors jamais rien, quelle que soit
// l'heure réelle — jamais remarqué car rien n'affichait cette valeur
// nulle part, jusqu'à un test explicite de son contenu. La locale "en-CA"
// ci-dessous n'est choisie que pour la forme du résultat (chiffres purs,
// jamais affichée à un utilisateur) ; un filtrage \D supplémentaire reste
// en sécurité au cas où une version d'ICU future y ajouterait, elle aussi,
// un texte imprévu.

// "Aujourd'hui" en heure de Paris, sous la forme d'une Date à minuit UTC —
// même convention que Creneau.date (un jour calendaire, pas un horodatage).
export function dateDuJourParis(maintenant: Date): Date {
  const [annee, mois, jour] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" })
    .format(maintenant)
    .split("-")
    .map(Number);
  return new Date(Date.UTC(annee, mois - 1, jour));
}

// Heure courante (0-23) à Paris, heure d'été/hiver déjà prise en compte par
// l'Intl API elle-même.
export function heureActuelleParis(maintenant: Date): number {
  const texte = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    hour12: false,
  }).format(maintenant);
  return Number(texte.replace(/\D/g, ""));
}
