import type { ReactNode } from "react";

export const metadata = {
  title: "PrepaStan",
  description: "Gestion des khôlles en classe préparatoire",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
