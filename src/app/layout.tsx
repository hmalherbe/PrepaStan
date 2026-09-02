import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { NavBar } from "@/components/NavBar";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Providers } from "./providers";
import { ANNEE_SCOLAIRE_COOKIE, anneeScolaireCourante, anneesScolairesProposees } from "@/lib/anneeScolaire";
import { CLE_STOCKAGE_THEME } from "@/lib/theme";
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
      <head>
        {/* Applique le thème mémorisé AVANT le premier rendu (voir
            ThemeSwitcher.tsx) pour éviter un flash de l'habillage aéré (par
            défaut) au chargement d'une page quand "classique" est choisi. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem(${JSON.stringify(CLE_STOCKAGE_THEME)});if(t)document.documentElement.setAttribute("data-theme",t);}catch(e){}`,
          }}
        />
      </head>
      <body>
        <Providers>
          <NavBar anneeScolaireInitiale={anneeScolaire} anneesScolaires={anneesScolairesProposees()} />
          {children}
          <ThemeSwitcher />
        </Providers>
      </body>
    </html>
  );
}
