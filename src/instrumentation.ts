// Hook de démarrage du serveur Next.js (exécuté une fois au lancement du
// processus, y compris en build "standalone" — voir Dockerfile). Sert ici à
// planifier la vérification périodique de l'invitation du jour même
// (kholleurs) et du rappel de validation (référents), sans avoir à ajouter
// un service de cron séparé au docker-compose de production.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { envoyerInvitationsJourMemeEnAttente, envoyerRappelsValidationReferentEnAttente } = await import(
    "@/lib/rappelsNotation"
  );

  // 15 min : assez fin pour détecter le passage de 9h (heure de Paris, voir
  // envoyerInvitationsJourMemeEnAttente) sans attendre inutilement — ce
  // n'est pas l'horaire précis de cet appel qui empêche un double envoi,
  // mais le garde-fou "déjà envoyé aujourd'hui" (RappelJourMemeEnvoye), donc
  // vérifier plus souvent ne crée aucun risque de doublon. Le rappel
  // référent, bâti sur le même principe de garde-fou par (session,
  // référent), en profite aussi : il réagit désormais plus vite qu'avec
  // l'ancien intervalle de 6h, sans changement de son propre comportement
  // (délai configurable dans Paramètres, au plus un envoi par session).
  const INTERVALLE_MS = 15 * 60 * 1000;

  // Deux try/catch séparés : un échec sur l'un des deux rappels (ex. erreur
  // base de données ponctuelle) ne doit jamais empêcher l'autre de tourner.
  async function verifier() {
    try {
      const { envoyes } = await envoyerInvitationsJourMemeEnAttente();
      if (envoyes > 0) {
        console.log(`[invitations-jour-meme] ${envoyes} email(s) envoyé(s) aux kholleurs`);
      }
    } catch (err) {
      console.error("[invitations-jour-meme] échec de la vérification (kholleurs) :", err);
    }

    try {
      const { envoyes } = await envoyerRappelsValidationReferentEnAttente();
      if (envoyes > 0) {
        console.log(`[rappels-notation] ${envoyes} email(s) de rappel envoyé(s) aux référents`);
      }
    } catch (err) {
      console.error("[rappels-notation] échec de la vérification (référents) :", err);
    }
  }

  verifier();
  setInterval(verifier, INTERVALLE_MS);
}
