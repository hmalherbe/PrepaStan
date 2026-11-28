"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Classe = { id: string; nom: string };

type Point = { semaine: string; valeur: number };

function formatSemaineCourte(iso: string): string {
  const [, mois, jour] = iso.split("-");
  return `${jour}/${mois}`;
}

// Graduation Y arrondie à une valeur "ronde" (0, pas, 2×pas...) au-dessus du
// maximum — même logique que l'histogramme de distribution des notes.
function pasGraduation(maxValeur: number): number {
  const brut = Math.max(maxValeur, 1) / 4;
  const puissance = 10 ** Math.floor(Math.log10(Math.max(brut, 1)));
  const candidats = [1, 2, 5, 10].map((c) => c * puissance);
  return candidats.find((c) => c >= brut) ?? candidats[candidats.length - 1];
}

// Courbe + aire "une semaine à la fois" : même construction SVG à la main
// que GraphiqueNotesDansLeTemps (NotesElevesTable.tsx), une seule teinte
// puisqu'une seule série (nombre d'évènements par semaine, pas une
// catégorie). Labels d'axe X espacés pour rester lisibles même sur de
// nombreuses semaines (voir `pas` ci-dessous).
function GraphiqueEvolution({ titre, sousTitre, points }: { titre: string; sousTitre: string; points: Point[] }) {
  const [survol, setSurvol] = useState<number | null>(null);

  const largeur = 760;
  const hauteur = 220;
  const marge = { haut: 16, bas: 32, gauche: 36, droite: 12 };
  const zoneW = largeur - marge.gauche - marge.droite;
  const zoneH = hauteur - marge.haut - marge.bas;

  const maxValeur = Math.max(...points.map((p) => p.valeur), 0);
  const pas = pasGraduation(maxValeur);
  const maxY = Math.max(Math.ceil(maxValeur / pas) * pas, pas);

  const xPour = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * zoneW : zoneW / 2);
  const yPour = (v: number) => zoneH - (v / maxY) * zoneH;

  const graduationsY = useMemo(() => {
    const vs: number[] = [];
    for (let v = 0; v <= maxY; v += pas) vs.push(v);
    return vs;
  }, [maxY, pas]);

  // Un label sur `pasLabel` points, pour ne jamais en afficher plus d'une
  // dizaine même avec un an complet de semaines.
  const pasLabel = Math.max(1, Math.ceil(points.length / 10));

  if (points.length === 0) {
    return (
      <div>
        <h2>{titre}</h2>
        <p>Aucune donnée.</p>
      </div>
    );
  }

  const chemin = points.map((p, i) => `${i === 0 ? "M" : "L"}${xPour(i)},${yPour(p.valeur)}`).join(" ");
  const aire = `${chemin} L${xPour(points.length - 1)},${zoneH} L${xPour(0)},${zoneH} Z`;

  return (
    <div>
      <h2>{titre}</h2>
      <p style={{ color: "#777", fontSize: "0.85rem", marginTop: -8 }}>{sousTitre}</p>
      <svg viewBox={`0 0 ${largeur} ${hauteur}`} role="img" aria-label={titre} style={{ width: "100%", height: "auto" }}>
        <g transform={`translate(${marge.gauche},${marge.haut})`}>
          {graduationsY.map((v) => (
            <g key={v}>
              <line x1={0} x2={zoneW} y1={yPour(v)} y2={yPour(v)} stroke="var(--couleur-bordure)" strokeWidth={1} />
              <text x={-8} y={yPour(v)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--couleur-texte-discret)">
                {v}
              </text>
            </g>
          ))}

          <path d={aire} fill="var(--couleur-accent-fond)" />
          <path d={chemin} fill="none" stroke="var(--couleur-primaire)" strokeWidth={2} />

          {points.map((p, i) =>
            i % pasLabel === 0 ? (
              <text key={p.semaine} x={xPour(i)} y={zoneH + 18} textAnchor="middle" fontSize={10} fill="var(--couleur-texte-discret)">
                {formatSemaineCourte(p.semaine)}
              </text>
            ) : null
          )}

          {points.map((p, i) => (
            <circle
              key={p.semaine}
              cx={xPour(i)}
              cy={yPour(p.valeur)}
              r={survol === i ? 5 : 3.5}
              fill="var(--couleur-primaire)"
              stroke="var(--couleur-surface)"
              strokeWidth={1.5}
              onMouseEnter={() => setSurvol(i)}
              onMouseLeave={() => setSurvol(null)}
            />
          ))}

          {survol !== null && (
            <g
              transform={`translate(${Math.min(Math.max(xPour(survol) - 65, 0), zoneW - 130)},${Math.max(
                yPour(points[survol].valeur) - 34,
                0
              )})`}
            >
              <rect width={130} height={28} rx={4} fill="var(--couleur-surface)" stroke="var(--couleur-bordure)" />
              <text x={8} y={12} fontSize={11} fill="var(--couleur-texte)">
                Semaine du {formatSemaineCourte(points[survol].semaine)}
              </text>
              <text x={8} y={24} fontSize={10} fill="var(--couleur-texte-discret)">
                {points[survol].valeur}
              </text>
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}

export function EvolutionActiviteChart({
  classes,
  classeIdActuelle,
  cloturesParSemaine,
  notesSaisiesParSemaine,
}: {
  classes: Classe[];
  classeIdActuelle: string;
  cloturesParSemaine: Point[];
  notesSaisiesParSemaine: Point[];
}) {
  const router = useRouter();
  return (
    <div>
      <label>
        Classe
        <select
          value={classeIdActuelle}
          onChange={(e) =>
            router.push(
              e.target.value
                ? `/admin/statistiques/evolution-activite?classeId=${e.target.value}`
                : "/admin/statistiques/evolution-activite"
            )
          }
        >
          <option value="">Toutes les classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
      </label>

      <GraphiqueEvolution
        titre="Sessions clôturées par semaine"
        sousTitre="Nombre de sessions validées par le référent, par semaine réelle de validation (pas la semaine de khôlle)."
        points={cloturesParSemaine}
      />
      <GraphiqueEvolution
        titre="Notes saisies par semaine"
        sousTitre="Nombre de notes (tous khôlleurs) saisies, par semaine réelle de saisie."
        points={notesSaisiesParSemaine}
      />
    </div>
  );
}
