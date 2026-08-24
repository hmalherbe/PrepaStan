import type { ReactNode } from "react";
import { NavBar } from "@/components/NavBar";
import { Providers } from "./providers";
import "./globals.css";

export const metadata = {
  title: "PrepaStan",
  description: "Gestion des khôlles en classe préparatoire",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <Providers>
          <NavBar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
