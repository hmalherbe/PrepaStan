"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Classe = { id: string; nom: string };
type Option = { id: string; nom: string };
type NoteLigne = {
  disciplineId: string;
  disciplineNom: string;
  kholleurId: string;
  kholleurNom: string;
  valeur: number;
};

const TAILLE_BIN = 2; // notes sur 20 → 10 tranches de 2 points
const NB_BINS = 10;

function moyenne(vs: number[]): number {
  return vs.reduce((a, b) => a + b, 0) / (vs.length || 1);
}

function mediane(vs: number[]): number {
  if (vs.length === 0) return 0;
  const triees = [...vs].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  return triees.length % 2 === 0 ? (triees[milieu - 1] + triees[milieu]) / 2 : triees[milieu];
}

function ecartType(vs: number[], m: number): number {
  if (vs.length === 0) return 0;
  return Math.sqrt(vs.reduce((s, v) => s + (v - m) ** 2, 0) / vs.length);
}

// Tranche [0-2[, [2-4[, ... [16-18[, [18-20] — dernière tranche fermée pour
// inclure la note maximale de 20.
function indexBin(valeur: number): number {
  const i = Math.floor(valeur / TAILLE_BIN);
  return Math.min(i, NB_BINS - 1);
}

// Histogramme en barres verticales : une seule teinte (encode un effectif,
// jamais une catégorie — même convention que .graphique-barres dans
// globals.css), construit à la main en SVG comme GraphiqueNotesDansLeTemps
// dans NotesElevesTable.tsx, plutôt que d'introduire une dépendance de
// charting pour un seul usage.
function Histogramme({ effectifs, total, moyenneValeur }: { effectifs: number[]; total: number; moyenneValeur: number }) {
  const [survol, setSurvol] = useState<{ index: number; x: number } | null>(null);

  const largeur = 760;
  const hauteur = 280;
  const marge = { haut: 16, bas: 36, gauche: 36, droite: 12 };
  const zoneW = largeur - marge.gauche - marge.droite;
  const zoneH = hauteur - marge.haut - marge.bas;

  const maxEffectif = Math.max(...effectifs, 1);
  // Graduation Y arrondie à une valeur "ronde" au-dessus du maximum, pour
  // des graduations lisibles (0, pas, 2×pas, ...) plutôt que des décimales.
  const pasY = (() => {
    const brut = maxEffectif / 4;
    const puissance = 10 ** Math.floor(Math.log10(Math.max(brut, 1)));
    const candidats = [1, 2, 5, 10].map((c) => c * puissance);
    return candidats.find((c) => c >= brut) ?? candidats[candidats.length - 1];
  })();
  const maxY = Math.ceil(maxEffectif / pasY) * pasY || 1;

  const largeurBin = zoneW / NB_BINS;
  const largeurBarre = Math.max(largeurBin - 6, 4); // 2px de battement visuel de chaque côté (voir marque-specs)
  const yPour = (v: number) => zoneH - (v / maxY) * zoneH;
  const xBin = (i: number) => i * largeurBin + (largeurBin - largeurBarre) / 2;
  const xMoyenne = marge.gauche + (moyenneValeur / (NB_BINS * TAILLE_BIN)) * zoneW;

  const graduationsY = useMemo(() => {
    const vs: number[] = [];
    for (let v = 0; v <= maxY; v += pasY) vs.push(v);
    return vs;
  }, [maxY, pasY]);

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${largeur} ${hauteur}`}
        role="img"
        aria-label="Histogramme de la distribution des notes"
        style={{ width: "100%", height: "auto" }}
      >
        <g transform={`translate(${marge.gauche},${marge.haut})`}>
          {graduationsY.map((v) => (
            <g key={v}>
              <line x1={0} x2={zoneW} y1={yPour(v)} y2={yPour(v)} stroke="var(--couleur-bordure)" strokeWidth={1} />
              <text x={-8} y={yPour(v)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--couleur-texte-discret)">
                {v}
              </text>
            </g>
          ))}

          {effectifs.map((n, i) => {
            const h = (n / maxY) * zoneH;
            const x = xBin(i);
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={yPour(n)}
                  width={largeurBarre}
                  height={h}
                  rx={4}
                  fill="var(--couleur-primaire)"
                  opacity={survol?.index === i ? 1 : 0.85}
                  onMouseEnter={() => setSurvol({ index: i, x: x + largeurBarre / 2 })}
                  onMouseLeave={() => setSurvol(null)}
                />
                <text
                  x={i * largeurBin + largeurBin / 2}
                  y={zoneH + 18}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--couleur-texte-discret)"
                >
                  {i * TAILLE_BIN}-{(i + 1) * TAILLE_BIN}
                </text>
              </g>
            );
          })}

          {/* Repère de la moyenne (jamais la couleur d'erreur : un simple
              repère neutre, pas un signalement de problème). */}
          {total > 0 && (
            <g transform={`translate(${xMoyenne - marge.gauche},0)`}>
              <line y1={-4} y2={zoneH} stroke="var(--couleur-texte-discret)" strokeWidth={1.5} strokeDasharray="4 3" />
              <text y={-8} textAnchor="middle" fontSize={10} fill="var(--couleur-texte-discret)">
                Moyenne {moyenneValeur.toFixed(1)}
              </text>
            </g>
          )}

          {survol && total > 0 && (
            <g
              transform={`translate(${Math.min(Math.max(survol.x - 70, 0), zoneW - 140)},${Math.max(
                yPour(effectifs[survol.index]) - 34,
                0
              )})`}
            >
              <rect width={140} height={28} rx={4} fill="var(--couleur-surface)" stroke="var(--couleur-bordure)" />
              <text x={8} y={12} fontSize={11} fill="var(--couleur-texte)">
                {effectifs[survol.index]} note(s)
              </text>
              <text x={8} y={24} fontSize={10} fill="var(--couleur-texte-discret)">
                {((effectifs[survol.index] / total) * 100).toFixed(0)}% du total
              </text>
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}

export function DistributionNotesChart({
  classes,
  classeIdActuelle,
  disciplines,
  kholleurs,
  notes,
}: {
  classes: Classe[];
  classeIdActuelle: string;
  disciplines: Option[];
  kholleurs: Option[];
  notes: NoteLigne[];
}) {
  const router = useRouter();
  const [filtreDiscipline, setFiltreDiscipline] = useState("");
  const [filtreKholleur, setFiltreKholleur] = useState("");

  const notesFiltrees = useMemo(
    () =>
      notes.filter(
        (n) => (!filtreDiscipline || n.disciplineId === filtreDiscipline) && (!filtreKholleur || n.kholleurId === filtreKholleur)
      ),
    [notes, filtreDiscipline, filtreKholleur]
  );

  const valeurs = useMemo(() => notesFiltrees.map((n) => n.valeur), [notesFiltrees]);

  const effectifs = useMemo(() => {
    const bins = new Array(NB_BINS).fill(0);
    for (const v of valeurs) bins[indexBin(v)]++;
    return bins;
  }, [valeurs]);

  const stats = useMemo(() => {
    const m = moyenne(valeurs);
    return { n: valeurs.length, moyenne: m, mediane: mediane(valeurs), ecartType: ecartType(valeurs, m) };
  }, [valeurs]);

  return (
    <div>
      <label>
        Classe
        <select
          value={classeIdActuelle}
          onChange={(e) => router.push(`/admin/statistiques/distribution-notes?classeId=${e.target.value}`)}
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "12px 0" }}>
        <label>
          Discipline
          <select value={filtreDiscipline} onChange={(e) => setFiltreDiscipline(e.target.value)}>
            <option value="">Toutes les disciplines</option>
            {disciplines.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nom}
              </option>
            ))}
          </select>
        </label>
        <label>
          Khôlleur
          <select value={filtreKholleur} onChange={(e) => setFiltreKholleur(e.target.value)}>
            <option value="">Tous les khôlleurs</option>
            {kholleurs.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nom}
              </option>
            ))}
          </select>
        </label>
      </div>

      {stats.n === 0 ? (
        <p>Aucune note pour ces filtres.</p>
      ) : (
        <>
          <div className="stat-cartes">
            <div className="stat-carte">
              <div className="valeur">{stats.n}</div>
              <div className="libelle">Notes</div>
            </div>
            <div className="stat-carte">
              <div className="valeur">{stats.moyenne.toFixed(2)}/20</div>
              <div className="libelle">Moyenne</div>
            </div>
            <div className="stat-carte">
              <div className="valeur">{stats.mediane.toFixed(2)}/20</div>
              <div className="libelle">Médiane</div>
            </div>
            <div className="stat-carte">
              <div className="valeur">{stats.ecartType.toFixed(2)}</div>
              <div className="libelle">Écart-type</div>
            </div>
          </div>

          <Histogramme effectifs={effectifs} total={stats.n} moyenneValeur={stats.moyenne} />

          <table className="table-hauteur-limitee" style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Tranche</th>
                <th>Nombre de notes</th>
                <th>Part</th>
              </tr>
            </thead>
            <tbody>
              {effectifs.map((n, i) => (
                <tr key={i}>
                  <td>
                    {i * TAILLE_BIN}-{(i + 1) * TAILLE_BIN}
                  </td>
                  <td>{n}</td>
                  <td>{stats.n > 0 ? ((n / stats.n) * 100).toFixed(0) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
