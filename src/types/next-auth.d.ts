import type { Role } from "@prisma/client";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id: string;
    roles: Role[];
    nom: string;
    prenom: string;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      roles: Role[];
      nom: string;
      prenom: string;
      // Présent uniquement pendant une prise de main admin (voir
      // src/lib/impersonation.ts) : id du VRAI compte admin derrière cette
      // session, pour afficher le bandeau "revenir à mon compte" et
      // permettre d'y revenir sans ressaisir de mot de passe.
      impersonatorId?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    roles: Role[];
    nom: string;
    prenom: string;
    impersonatorId?: string;
  }
}
