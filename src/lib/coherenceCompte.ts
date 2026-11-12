import { prisma } from "@/lib/prisma";

// Une même personne (même nom + prénom) doit toujours avoir le même email,
// qu'elle soit khôlleur, professeur référent, ou les deux — sinon elle se
// retrouve avec deux comptes de connexion séparés au lieu d'un seul compte
// à deux rôles (voir scripts/fusionner-comptes-doublon.mjs, qui a servi à
// corriger un cas réel : Sandrine CRUCIANI avait un compte khôlleur créé
// avec un email différent de son compte référent existant). Comparaison du
// nom/prénom insensible à la casse et aux espaces superflus ; `excluUtilisateurId`
// exclut le compte lui-même lors d'une modification (sans quoi il se
// détecterait toujours comme son propre doublon).
//
// Retourne le compte existant si son email diffère de celui proposé (donc
// un conflit à signaler), ou null s'il n'y a pas de conflit (aucun compte
// trouvé sous ce nom, ou même email déjà).
export async function compteExistantAvecEmailDifferent(
  nom: string,
  prenom: string,
  emailPropose: string,
  excluUtilisateurId?: string
): Promise<{ id: string; email: string } | null> {
  const existant = await prisma.utilisateur.findFirst({
    where: {
      nom: { equals: nom.trim(), mode: "insensitive" },
      prenom: { equals: prenom.trim(), mode: "insensitive" },
      ...(excluUtilisateurId ? { id: { not: excluUtilisateurId } } : {}),
    },
    select: { id: true, email: true },
  });
  if (existant && existant.email.toLowerCase() !== emailPropose.trim().toLowerCase()) {
    return existant;
  }
  return null;
}

// Message d'erreur standard pour les 409 ci-dessus, et pour les lignes
// d'import CSV concernées — toujours la même formulation, nommant l'email
// à réutiliser plutôt que de laisser imaginer un autre problème.
export function messageCompteEmailDifferent(nom: string, prenom: string, emailExistant: string): string {
  return (
    `Un compte existe déjà pour ${prenom} ${nom} avec l'adresse ${emailExistant} : ` +
    `utilisez cette même adresse pour que cette personne garde un seul compte (khôlleur et référent cumulés).`
  );
}

// Inverse du cas ci-dessus : un email déjà pris par un compte d'une AUTRE
// personne (nom/prénom différents). Sans ce garde-fou, la création/import
// d'un khôlleur ou référent dont l'email correspond par erreur (coquille,
// copier-coller) au compte de quelqu'un d'autre fusionnait silencieusement
// les rôles sur ce compte existant au lieu de signaler le conflit — l'admin
// avait alors l'impression que « rien ne s'était passé » (aucun nouveau
// compte créé, et le compte existant modifié sans que son nom/email
// n'apparaisse changé).
export function memePersonne(nom1: string, prenom1: string, nom2: string, prenom2: string): boolean {
  return (
    nom1.trim().toLowerCase() === nom2.trim().toLowerCase() &&
    prenom1.trim().toLowerCase() === prenom2.trim().toLowerCase()
  );
}

export function messageEmailDejaPrisParAutrePersonne(nomExistant: string, prenomExistant: string): string {
  return (
    `L'adresse email saisie est déjà utilisée par un autre compte : ${prenomExistant} ${nomExistant}. ` +
    `Utilisez une adresse email différente.`
  );
}
