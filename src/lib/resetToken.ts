import crypto from "crypto";

export const DUREE_VALIDITE_TOKEN_MS = 60 * 60 * 1000; // 1 heure
// Plus long que la réinitialisation classique : un lien d'activation envoyé
// à la création d'un compte (import CSV en masse, souvent en début d'année)
// doit rester valable même si la personne ne le consulte pas immédiatement.
export const DUREE_VALIDITE_TOKEN_ACTIVATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

// Le token en clair part dans le lien envoyé par email ; seul son hash est
// stocké en base (voir TokenReinitialisationMotDePasse) — un accès à la base
// ne suffit donc pas à réinitialiser un mot de passe à la place de
// quelqu'un.
export function genererToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hasherToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
