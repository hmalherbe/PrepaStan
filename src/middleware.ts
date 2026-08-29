import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Défense en profondeur : chaque route API vérifie déjà le rôle via
// requireRole() et chaque page via requirePageSession() (src/lib/auth.ts),
// mais le middleware rejette aussi les requêtes non autorisées avant
// qu'elles n'atteignent le handler/la page.
export default withAuth(
  function middleware() {
    return NextResponse.next();
  },
  {
    pages: { signIn: "/login" },
    callbacks: {
      authorized: ({ token, req }) => {
        if (!token) return false;

        const path = req.nextUrl.pathname;
        const roles = (token.roles as string[] | undefined) ?? [];
        if (path.startsWith("/admin")) return roles.includes("ADMIN");
        if (path.startsWith("/kholleur")) return roles.includes("KHOLLEUR");
        if (path.startsWith("/referent")) return roles.includes("PROFESSEUR_REFERENT");
        if (path.startsWith("/eleve")) return roles.includes("ELEVE");
        return true;
      },
    },
  }
);

export const config = {
  matcher: [
    "/api/admin/:path*",
    "/api/kholleur/:path*",
    "/api/referent/:path*",
    "/api/eleve/:path*",
    "/admin/:path*",
    "/kholleur/:path*",
    "/referent/:path*",
    "/eleve/:path*",
  ],
};
