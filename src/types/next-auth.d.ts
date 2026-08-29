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
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    roles: Role[];
    nom: string;
    prenom: string;
  }
}
