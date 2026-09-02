"use client";

import { useEffect, useState } from "react";
import { CLE_STOCKAGE_THEME } from "@/lib/theme";

const THEME_AERE = "aere";

// Bascule visible sur toutes les pages (posé dans layout.tsx, hors NavBar
// qui ne s'affiche pas sur /login etc.) entre l'habillage classique et
// l'habillage aéré/coloré. Un script inline dans layout.tsx applique déjà
// le thème mémorisé avant le premier rendu (évite un flash de l'habillage
// classique) ; ce composant ne fait que lire cet état déjà posé sur <html>
// pour afficher le bon libellé, puis le change au clic.
export function ThemeSwitcher() {
  const [theme, setTheme] = useState("");

  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") ?? "");
  }, []);

  function basculer() {
    const nouveau = theme === THEME_AERE ? "" : THEME_AERE;
    setTheme(nouveau);
    if (nouveau) {
      document.documentElement.setAttribute("data-theme", nouveau);
      localStorage.setItem(CLE_STOCKAGE_THEME, nouveau);
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.removeItem(CLE_STOCKAGE_THEME);
    }
  }

  return (
    <button type="button" className="bouton-theme no-print" onClick={basculer}>
      {theme === THEME_AERE ? "↩ Style classique" : "🎨 Nouveau style"}
    </button>
  );
}
