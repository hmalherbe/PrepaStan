import { redirect } from "next/navigation";

// Remplacé par l'écran unifié /admin/personnes (khôlleurs et référents
// gérés sur une seule grille) — conservé comme redirection pour les liens ou
// favoris existants vers cette ancienne URL.
export default function ReferentsPage() {
  redirect("/admin/personnes");
}
