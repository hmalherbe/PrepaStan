import { envoyerEmailActivationCompte } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { DUREE_VALIDITE_TOKEN_ACTIVATION_MS, genererToken, hasherToken } from "@/lib/resetToken";

// Appelé juste après la création d'un compte de connexion (ajout individuel
// ou import CSV — jamais sur un compte déjà existant, ex. email qui
// correspondait déjà à un kholleur). Crée le lien d'activation puis envoie
// l'email ; n'échoue jamais bruyamment (voir envoyerEmailActivationCompte)
// pour ne jamais faire échouer la création du compte elle-même à cause d'un
// souci d'email ou de base.
export async function envoyerActivationNouveauCompte({
  utilisateurId,
  email,
  prenom,
  baseUrl,
}: {
  utilisateurId: string;
  email: string;
  prenom: string;
  baseUrl: string;
}): Promise<void> {
  try {
    const token = genererToken();
    await prisma.tokenReinitialisationMotDePasse.create({
      data: {
        utilisateurId,
        tokenHash: hasherToken(token),
        expiration: new Date(Date.now() + DUREE_VALIDITE_TOKEN_ACTIVATION_MS),
      },
    });
    const lien = `${baseUrl}/reinitialiser-mot-de-passe?token=${token}`;
    await envoyerEmailActivationCompte({ destinataire: email, nomUtilisateur: prenom, lien });
  } catch (err) {
    console.error(`Échec de la création/envoi du lien d'activation pour ${email} :`, err);
  }
}

// Base d'URL pour construire un lien d'activation depuis une route API : la
// même logique que /api/auth/mot-de-passe-oublie (NEXTAUTH_URL en priorité,
// sinon l'origine de la requête elle-même).
export function baseUrlDepuisRequete(req: Request): string {
  return process.env.NEXTAUTH_URL ?? new URL(req.url).origin;
}
