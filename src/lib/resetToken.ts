import crypto from "crypto";

export const DUREE_VALIDITE_TOKEN_MS = 60 * 60 * 1000; // 1 heure

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
