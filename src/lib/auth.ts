import type { NextAuthOptions } from "next-auth";
import type { Role } from "@prisma/client";

// Squelette de configuration NextAuth. Le provider (credentials, email
// magic-link, SSO établissement...) reste à choisir selon le contexte de
// déploiement — non implémenté ici.
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: Role }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: Role }).role = token.role as Role;
      }
      return session;
    },
  },
};

export function requireRole(userRole: Role | undefined, allowed: Role[]) {
  if (!userRole || !allowed.includes(userRole)) {
    throw new Error("Accès refusé");
  }
}
