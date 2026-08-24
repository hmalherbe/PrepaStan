import bcrypt from "bcryptjs";
import { getServerSession, type NextAuthOptions, type Session } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email et mot de passe",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const utilisateur = await prisma.utilisateur.findUnique({
          where: { email: credentials.email },
        });
        if (!utilisateur) return null;

        const motDePasseValide = await bcrypt.compare(credentials.password, utilisateur.password);
        if (!motDePasseValide) return null;

        return {
          id: utilisateur.id,
          email: utilisateur.email,
          nom: utilisateur.nom,
          prenom: utilisateur.prenom,
          role: utilisateur.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.nom = user.nom;
        token.prenom = user.prenom;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.nom = token.nom;
      session.user.prenom = token.prenom;
      return session;
    },
  },
};

/**
 * À utiliser en tête de chaque route API protégée. Retourne la session si
 * l'utilisateur est authentifié et possède l'un des rôles autorisés, sinon
 * une NextResponse d'erreur prête à être renvoyée telle quelle :
 *
 *   const auth = await requireRole(["KHOLLEUR"]);
 *   if (auth instanceof NextResponse) return auth;
 *   const kholleurId = auth.user.id;
 */
export async function requireRole(allowed: Role[]): Promise<Session | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }
  if (!allowed.includes(session.user.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  return session;
}

/**
 * Équivalent de requireRole() pour les Server Components (pages). Redirige
 * vers /login si l'utilisateur n'est pas authentifié ou n'a pas le rôle
 * attendu, au lieu de renvoyer une réponse JSON.
 */
export async function requirePageSession(allowed: Role[]): Promise<Session> {
  const session = await getServerSession(authOptions);
  if (!session || !allowed.includes(session.user.role)) {
    redirect("/login");
  }
  return session;
}
