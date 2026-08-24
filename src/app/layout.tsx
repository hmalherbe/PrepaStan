import type { ReactNode } from "react";
import { Providers } from "./providers";

export const metadata = {
  title: "PrepaStan",
  description: "Gestion des khôlles en classe préparatoire",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
