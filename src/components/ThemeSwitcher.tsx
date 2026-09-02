"use client";

import { useEffect, useState } from "react";
import { CLE_STOCKAGE_THEME } from "@/lib/theme";

const THEME_CLASSIQUE = "classique";

// Bascule visible sur toutes les pages (posé dans layout.tsx, hors NavBar
// qui ne s'affiche pas sur /login etc.) entre l'habillage aéré/coloré (par
// défaut, voir globals.css) et l'ancien habillage sobre. Un script inline
// dans layout.tsx applique déjà le thème mémorisé avant le premier rendu
// (évite un flash de l'un ou l'autre habillage) ; ce composant ne fait que
// lire cet état déjà posé sur <html> pour afficher le bon libellé, puis le
// change au clic.
export function ThemeSwitcher() {
  const [theme, setTheme] = useState("");

  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") ?? "");
  }, []);

  function basculer() {
    const nouveau = theme === THEME_CLASSIQUE ? "" : THEME_CLASSIQUE;
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
      {theme === THEME_CLASSIQUE ? "🎨 Style aéré" : "◻ Style classique"}
    </button>
  );
}
