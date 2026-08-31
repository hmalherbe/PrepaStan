// Hook de démarrage du serveur Next.js (exécuté une fois au lancement du
// processus, y compris en build "standalone" — voir Dockerfile). Sert ici à
// planifier la vérification périodique des rappels de notation, sans avoir
// à ajouter un service de cron séparé au docker-compose de production.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { envoyerRappelsNotationEnAttente } = await import("@/lib/rappelsNotation");

  const INTERVALLE_MS = 6 * 60 * 60 * 1000; // 6h : largement suffisant vu la granularité en jours du délai

  async function verifier() {
    try {
      const { envoyes } = await envoyerRappelsNotationEnAttente();
      if (envoyes > 0) {
        console.log(`[rappels-notation] ${envoyes} email(s) de rappel envoyé(s)`);
      }
    } catch (err) {
      console.error("[rappels-notation] échec de la vérification :", err);
    }
  }

  verifier();
  setInterval(verifier, INTERVALLE_MS);
}
