// Graphique en anneau en SVG pur (pas de lib externe, voir le reste des
// graphiques de Statistiques : barres en CSS, courbes en SVG brut dans
// NotesElevesTable) — un cercle par catégorie, dessiné en segment de trait
// via stroke-dasharray/stroke-dashoffset, technique classique pour ce type
// de graphique sans avoir à calculer des arcs SVG à la main.
const PALETTE = [
  "#6c4cf1",
  "#12875a",
  "#c07a06",
  "#d1483a",
  "#2952e3",
  "#0e9594",
  "#b33c86",
  "#5536d6",
];

export function GraphiqueAnneau({
  titre,
  donnees,
}: {
  titre: string;
  donnees: { label: string; valeur: number }[];
}) {
  const total = donnees.reduce((a, d) => a + d.valeur, 0);
  const rayon = 70;
  const circonference = 2 * Math.PI * rayon;

  let cumul = 0;
  const segments = donnees.map((d, i) => {
    const part = total > 0 ? d.valeur / total : 0;
    const longueur = part * circonference;
    const decalage = -cumul * circonference;
    cumul += part;
    return { ...d, couleur: PALETTE[i % PALETTE.length], longueur, decalage };
  });

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
      <svg viewBox="0 0 180 180" width="200" height="200" role="img" aria-label={titre}>
        <g transform="rotate(-90 90 90)">
          {total === 0 ? (
            <circle cx="90" cy="90" r={rayon} fill="none" stroke="var(--couleur-bordure)" strokeWidth="28" />
          ) : (
            segments.map((s) => (
              <circle
                key={s.label}
                cx="90"
                cy="90"
                r={rayon}
                fill="none"
                stroke={s.couleur}
                strokeWidth="28"
                strokeDasharray={`${s.longueur} ${circonference - s.longueur}`}
                strokeDashoffset={s.decalage}
              />
            ))
          )}
        </g>
        <text x="90" y="85" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--couleur-texte)">
          {total}
        </text>
        <text x="90" y="104" textAnchor="middle" fontSize="11" fill="var(--couleur-texte-discret)">
          total
        </text>
      </svg>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {segments.map((s) => (
          <li key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem" }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: s.couleur,
                flex: "none",
                display: "inline-block",
              }}
            />
            <span>
              {s.label} — <strong>{s.valeur}</strong>
              {total > 0 && <span style={{ color: "var(--couleur-texte-discret)" }}> ({((s.valeur / total) * 100).toFixed(0)}%)</span>}
            </span>
          </li>
        ))}
        {donnees.length === 0 && <li style={{ color: "var(--couleur-texte-discret)" }}>Aucune donnée.</li>}
      </ul>
    </div>
  );
}
