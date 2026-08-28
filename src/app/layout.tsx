import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { NavBar } from "@/components/NavBar";
import { Providers } from "./providers";
import { ANNEE_SCOLAIRE_COOKIE, anneeScolaireCourante, anneesScolairesProposees } from "@/lib/anneeScolaire";
import "./globals.css";

export const metadata = {
  title: "PrepaStan",
  description: "Gestion des khôlles en classe préparatoire",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const anneeScolaire = cookieStore.get(ANNEE_SCOLAIRE_COOKIE)?.value ?? anneeScolaireCourante();

  return (
    <html lang="fr">
      <body>
        <Providers>
          <NavBar anneeScolaireInitiale={anneeScolaire} anneesScolaires={anneesScolairesProposees()} />
          {children}
        </Providers>
      </body>
    </html>
  );
}
