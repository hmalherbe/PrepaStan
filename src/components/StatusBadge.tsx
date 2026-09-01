const LABELS: Record<string, string> = {
  EN_ATTENTE: "En attente",
  VALIDE: "Validé",
  EN_COURS: "En cours",
  SUCCES: "Succès",
  ECHEC: "Échec",
  INFAISABLE: "Infaisable",
  PLANIFICATION: "Brouillon",
  PLANIFIEE: "Planifiée",
  CLOTUREE: "Clôturée",
  // Synthétique (pas un statut de la base) : session dont le référent a
  // validé la clôture — la grille du kholleur ne peut plus jamais être
  // rouverte, voir kholleur/sessions/page.tsx et GrilleForm.tsx.
  GELEE: "Gelée",
};

const CLASSES: Record<string, string> = {
  EN_ATTENTE: "badge-attente",
  VALIDE: "badge-succes",
  SUCCES: "badge-succes",
  ECHEC: "badge-erreur",
  INFAISABLE: "badge-erreur",
  EN_COURS: "badge-attente",
  PLANIFICATION: "badge-attente",
  PLANIFIEE: "badge-succes",
  CLOTUREE: "badge-succes",
  GELEE: "badge-succes",
};

export function StatusBadge({ statut }: { statut: string }) {
  return (
    <span className={`badge ${CLASSES[statut] ?? "badge-attente"}`}>
      {LABELS[statut] ?? statut}
    </span>
  );
}
