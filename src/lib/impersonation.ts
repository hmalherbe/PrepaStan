import { encode } from "next-auth/jwt";
import type { Role } from "@prisma/client";

// Même détermination que NextAuth lui-même (useSecureCookies, dérivé de
// NEXTAUTH_URL) — voir aussi baseUrlDepuisRequete dans activationCompte.ts
// pour la même logique appliquée ailleurs. Calculée explicitement ici
// plutôt que déduite de la requête en cours (ex. via l'en-tête
// X-Forwarded-Proto), pour ne jamais se tromper de nom de cookie selon que
// Caddy transmette ou non ce détail au conteneur app.
export const COOKIE_SECURISE = process.env.NEXTAUTH_URL?.startsWith("https://") ?? true;

export const NOM_COOKIE_SESSION = COOKIE_SECURISE
  ? "__Secure-next-auth.session-token"
  : "next-auth.session-token";

// Même durée que la session par défaut de NextAuth (30 jours) : une prise
// de main n'a pas de raison d'expirer plus vite qu'une connexion normale.
const DUREE_SESSION_SECONDES = 30 * 24 * 60 * 60;

type UtilisateurPourToken = {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  roles: Role[];
};

// Fabrique et encode un JWT de session NextAuth pour "utilisateur", avec le
// même format que celui produit par authorize()+jwt() lors d'une connexion
// normale (voir auth.ts) — mais signé directement ici, sans mot de passe de
// CET utilisateur, puisque c'est tout l'intérêt de la prise de main admin.
// impersonatorId, s'il est fourni, marque la session comme une prise de
// main : id du VRAI compte admin, lu par le callback session() de auth.ts
// pour afficher le bandeau "revenir à mon compte" (voir NavBar.tsx).
export async function creerCookieSession(
  utilisateur: UtilisateurPourToken,
  impersonatorId?: string
): Promise<{ nom: string; valeur: string; options: { httpOnly: true; secure: boolean; sameSite: "lax"; path: string; maxAge: number } }> {
  const valeur = await encode({
    token: {
      sub: utilisateur.id,
      id: utilisateur.id,
      email: utilisateur.email,
      nom: utilisateur.nom,
      prenom: utilisateur.prenom,
      roles: utilisateur.roles,
      impersonatorId,
    },
    secret: process.env.NEXTAUTH_SECRET!,
    maxAge: DUREE_SESSION_SECONDES,
  });

  return {
    nom: NOM_COOKIE_SESSION,
    valeur,
    options: {
      httpOnly: true,
      secure: COOKIE_SECURISE,
      sameSite: "lax",
      path: "/",
      maxAge: DUREE_SESSION_SECONDES,
    },
  };
}

// Page de destination la plus pertinente pour chaque rôle, utilisée après
// le démarrage d'une prise de main (voir
// /api/admin/impersonation/demarrer) : priorité khôlleur > référent >
// étudiant si la personne cumule plusieurs rôles (ordre arbitraire mais
// cohérent avec NavBar.tsx, qui liste les rôles dans cet ordre).
export function pageDestination(roles: Role[]): string {
  if (roles.includes("KHOLLEUR")) return "/kholleur/sessions";
  if (roles.includes("PROFESSEUR_REFERENT")) return "/referent/sessions";
  if (roles.includes("ELEVE")) return "/eleve/notes";
  return "/";
}
