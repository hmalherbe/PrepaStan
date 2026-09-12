"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Classe = { id: string; nom: string };
type Option = { id: string; nom: string };
type NoteLigne = {
  eleveId: string;
  eleveNom: string;
  elevePrenom: string;
  disciplineId: string;
  disciplineNom: string;
  kholleurId: string;
  kholleurNom: string;
  semaine: number;
  date: string;
  valeur: number;
};

function moyenne(vs: number[]): number {
  return vs.reduce((a, b) => a + b, 0) / (vs.length || 1);
}

function formatDateCourte(iso: string): string {
  const [, mois, jour] = iso.split("-");
  return `${jour}/${mois}`;
}

// Une couleur par étudiant affiché sur le graphique : palette catégorielle
// fixe (jamais générée à la volée) pour rester stable d'un rendu à l'autre
// tant qu'on reste sous ~8 séries — au-delà les teintes se répètent, ce qui
// reste lisible car chaque étudiant est de toute façon identifiable via la
// légende et l'infobulle.
const PALETTE_ELEVES = [
  "var(--couleur-primaire)",
  "#c1440e",
  "#2a8f7d",
  "#b8860b",
  "#7b4fd6",
  "#3a6ea5",
  "#b83c6f",
  "#5c8a2e",
];

type SerieEleve = { id: string; nom: string; points: { date: string; valeur: number }[] };

// Graphique en courbe "notes dans le temps" : construit à la main en SVG,
// comme le reste des graphiques de cette appli (voir BarreHorizontale dans
// StatistiquesView), plutôt que d'introduire une dépendance de charting pour
// un seul usage.
function GraphiqueNotesDansLeTemps({ series }: { series: SerieEleve[] }) {
  const [survol, setSurvol] = useState<{ x: number; y: number; texte: string } | null>(null);

  const dates = useMemo(
    () => [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort(),
    [series]
  );

  if (dates.length === 0) {
    return <p>Aucune note à afficher pour ces filtres.</p>;
  }

  const largeur = 760;
  const hauteur = 260;
  const marge = { haut: 12, bas: 32, gauche: 30, droite: 12 };
  const zoneW = largeur - marge.gauche - marge.droite;
  const zoneH = hauteur - marge.haut - marge.bas;

  const xPour = (date: string) => (dates.length > 1 ? (dates.indexOf(date) / (dates.length - 1)) * zoneW : zoneW / 2);
  const yPour = (valeur: number) => zoneH - (valeur / 20) * zoneH;

  return (
    <div>
      <svg viewBox={`0 0 ${largeur} ${hauteur}`} role="img" aria-label="Notes dans le temps" style={{ width: "100%", height: "auto" }}>
        <g transform={`translate(${marge.gauche},${marge.haut})`}>
          {[0, 5, 10, 15, 20].map((v) => (
            <g key={v}>
              <line x1={0} x2={zoneW} y1={yPour(v)} y2={yPour(v)} stroke="var(--couleur-bordure)" strokeWidth={1} />
              <text x={-6} y={yPour(v)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--couleur-texte-discret)">
                {v}
              </text>
            </g>
          ))}
          {dates.map((date) => (
            <text key={date} x={xPour(date)} y={zoneH + 18} textAnchor="middle" fontSize={10} fill="var(--couleur-texte-discret)">
              {formatDateCourte(date)}
            </text>
          ))}
          {series.map((s, i) => {
            const couleur = PALETTE_ELEVES[i % PALETTE_ELEVES.length];
            const triees = [...s.points].sort((a, b) => a.date.localeCompare(b.date));
            const chemin = triees.map((p, idx) => `${idx === 0 ? "M" : "L"}${xPour(p.date)},${yPour(p.valeur)}`).join(" ");
            return (
              <g key={s.id}>
                <path d={chemin} fill="none" stroke={couleur} strokeWidth={2} />
                {triees.map((p, idx) => (
                  <circle
                    key={idx}
                    cx={xPour(p.date)}
                    cy={yPour(p.valeur)}
                    r={4}
                    fill={couleur}
                    stroke="var(--couleur-surface)"
                    strokeWidth={1.5}
                    onMouseEnter={() =>
                      setSurvol({
                        x: xPour(p.date),
                        y: yPour(p.valeur),
                        texte: `${s.nom} — ${formatDateCourte(p.date)} : ${p.valeur}/20`,
                      })
                    }
                    onMouseLeave={() => setSurvol(null)}
                  />
                ))}
              </g>
            );
          })}
          {survol && (
            <g transform={`translate(${Math.min(survol.x + 8, zoneW - 150)},${Math.max(survol.y - 14, 0)})`}>
              <rect width={150} height={22} rx={4} fill="var(--couleur-surface)" stroke="var(--couleur-bordure)" />
              <text x={6} y={15} fontSize={11} fill="var(--couleur-texte)">
                {survol.texte}
              </text>
            </g>
          )}
        </g>
      </svg>
      {series.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 8 }}>
          {series.map((s, i) => (
            <span key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--couleur-texte-discret)" }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: PALETTE_ELEVES[i % PALETTE_ELEVES.length],
                  display: "inline-block",
                }}
              />
              {s.nom}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function NotesElevesTable({
  classes,
  classeIdActuelle,
  eleves,
  disciplines,
  kholleurs,
  notes,
}: {
  classes: Classe[];
  classeIdActuelle: string;
  eleves: Option[];
  disciplines: Option[];
  kholleurs: Option[];
  notes: NoteLigne[];
}) {
  const router = useRouter();
  const [filtreEleve, setFiltreEleve] = useState("");
  const [filtreDiscipline, setFiltreDiscipline] = useState("");
  const [filtreKholleur, setFiltreKholleur] = useState("");

  const notesFiltrees = useMemo(
    () =>
      notes.filter(
        (n) =>
          (!filtreEleve || n.eleveId === filtreEleve) &&
          (!filtreDiscipline || n.disciplineId === filtreDiscipline) &&
          (!filtreKholleur || n.kholleurId === filtreKholleur)
      ),
    [notes, filtreEleve, filtreDiscipline, filtreKholleur]
  );

  const lignesParEleve = useMemo(() => {
    const parEleve = new Map<string, { nom: string; prenom: string; valeurs: number[] }>();
    for (const n of notesFiltrees) {
      const entree = parEleve.get(n.eleveId) ?? { nom: n.eleveNom, prenom: n.elevePrenom, valeurs: [] };
      entree.valeurs.push(n.valeur);
      parEleve.set(n.eleveId, entree);
    }
    return [...parEleve.values()]
      .map((e) => ({ ...e, moyenne: moyenne(e.valeurs) }))
      .sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom));
  }, [notesFiltrees]);

  // Une série par étudiant présent dans les notes filtrées, triée comme le
  // tableau ci-dessous pour que la légende et les lignes du tableau
  // s'associent visuellement dans le même ordre.
  const seriesGraphique = useMemo<SerieEleve[]>(() => {
    const parEleve = new Map<string, SerieEleve>();
    for (const n of notesFiltrees) {
      const entree = parEleve.get(n.eleveId) ?? { id: n.eleveId, nom: `${n.elevePrenom} ${n.eleveNom}`, points: [] };
      entree.points.push({ date: n.date, valeur: n.valeur });
      parEleve.set(n.eleveId, entree);
    }
    return [...parEleve.values()].sort((a, b) => a.nom.localeCompare(b.nom));
  }, [notesFiltrees]);

  return (
    <div>
      <label>
        Classe
        <select
          value={classeIdActuelle}
          onChange={(e) => router.push(`/admin/statistiques/notes-eleves?classeId=${e.target.value}`)}
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
          Étudiant
          <select value={filtreEleve} onChange={(e) => setFiltreEleve(e.target.value)}>
            <option value="">Tous les étudiants</option>
            {eleves.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom}
              </option>
            ))}
          </select>
        </label>
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

      <h2>Notes dans le temps</h2>
      <GraphiqueNotesDansLeTemps series={seriesGraphique} />

      <table className="table-hauteur-limitee">
        <thead>
          <tr>
            <th>Prénom</th>
            <th>Nom</th>
            <th>Notes</th>
            <th>Moyenne</th>
          </tr>
        </thead>
        <tbody>
          {lignesParEleve.map((l) => (
            <tr key={`${l.prenom}|${l.nom}`}>
              <td>{l.prenom}</td>
              <td>{l.nom}</td>
              <td>{l.valeurs.map((v) => v.toString()).join(", ")}</td>
              <td>{l.moyenne.toFixed(2)}/20</td>
            </tr>
          ))}
          {lignesParEleve.length === 0 && (
            <tr>
              <td colSpan={4}>Aucune note pour ces filtres.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
