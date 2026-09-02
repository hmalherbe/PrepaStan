// Module neutre (ni "use client" ni Server Component) : importable tel
// quel depuis layout.tsx (Server Component, pour le script anti-flash) et
// depuis ThemeSwitcher.tsx ("use client"). Une constante définie dans un
// fichier "use client" devient une référence client opaque une fois
// importée côté serveur — inutilisable pour construire le script inline.
export const CLE_STOCKAGE_THEME = "prepastan:theme";
