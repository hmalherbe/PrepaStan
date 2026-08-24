import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Défense en profondeur : chaque route API vérifie déjà le rôle via
// requireRole() (src/lib/auth.ts), mais le middleware rejette aussi les
// requêtes non autorisées avant qu'elles n'atteignent le handler.
export default withAuth(
  function middleware() {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        if (!token) return false;

        const path = req.nextUrl.pathname;
        if (path.startsWith("/api/admin")) return token.role === "ADMIN";
        if (path.startsWith("/api/kholleur")) return token.role === "KHOLLEUR";
        if (path.startsWith("/api/referent")) return token.role === "PROFESSEUR_REFERENT";
        if (path.startsWith("/api/eleve")) return token.role === "ELEVE";
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
  ],
};
