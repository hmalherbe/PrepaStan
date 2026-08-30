"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type ScoreEleve = { id: string; nom: string; moyenne: number; nbPassages: number };
type ChargeKholleur = { nom: string; nbCreneaux: number };
type DiversiteDiscipline = { discipline: string; tauxMoyen: number };
type LigneDetail = { eleveNom: string; kholleurNom: string; disciplineNom: string; nbPassages: number };
type Classe = { id: string; nom: string };

function BarreHorizontale({
  label,
  valeur,
  min = 0,
  max,
  formatValeur,
}: {
  label: string;
  valeur: number;
  min?: number;
  max: number;
  formatValeur: (v: number) => string;
}) {
  const etendue = max - min;
  const largeur = etendue > 0 ? Math.max(((valeur - min) / etendue) * 100, 2) : 100;
  return (
    <div className="barre-ligne">
      <span title={label}>{label}</span>
      <div className="barre-piste">
        <div className="barre-remplissage" style={{ width: `${largeur}%` }} />
      </div>
      <span className="barre-valeur">{formatValeur(valeur)}</span>
    </div>
  );
}

type ColonneTri = "eleve" | "kholleur" | "discipline" | "nbPassages";

export function StatistiquesView({
  classes,
  classeIdActuelle,
  nbEleves,
  nbKholleurs,
  nbPassages,
  scoreParEleve,
  chargeKholleurs,
  diversiteDisciplines,
  detailEleveKholleur,
  alternance,
}: {
  classes: Classe[];
  classeIdActuelle: string;
  nbEleves: number;
  nbKholleurs: number;
  nbPassages: number;
  scoreParEleve: ScoreEleve[];
  chargeKholleurs: ChargeKholleur[];
  diversiteDisciplines: DiversiteDiscipline[];
  detailEleveKholleur: LigneDetail[];
  alternance: { pourcentage: number; alternees: number; total: number } | null;
}) {
  const router = useRouter();
  const [filtre, setFiltre] = useState("");
  const [tri, setTri] = useState<{ colonne: ColonneTri; ordre: 1 | -1 }>({ colonne: "eleve", ordre: 1 });

  // Échelle resserrée sur [min, max] plutôt que [0, max] : les scores
  // horaires sont naturellement dans une bande étroite (ex. 16.6 à 17.4),
  // partir de 0 écraserait visuellement des écarts qui comptent pourtant
  // pour juger l'équilibrage.
  const minScore = scoreParEleve.length > 0 ? Math.min(...scoreParEleve.map((s) => s.moyenne)) : 0;
  const maxScore = Math.max(...scoreParEleve.map((s) => s.moyenne), minScore + 1);
  const maxCharge = Math.max(...chargeKholleurs.map((k) => k.nbCreneaux), 1);

  function trierPar(colonne: ColonneTri) {
    setTri((prev) => (prev.colonne === colonne ? { colonne, ordre: prev.ordre === 1 ? -1 : 1 } : { colonne, ordre: 1 }));
  }

  const detailFiltreTrie = useMemo(() => {
    const filtreNorm = filtre.trim().toLowerCase();
    const filtres = filtreNorm
      ? detailEleveKholleur.filter(
          (l) =>
            l.eleveNom.toLowerCase().includes(filtreNorm) ||
            l.kholleurNom.toLowerCase().includes(filtreNorm) ||
            l.disciplineNom.toLowerCase().includes(filtreNorm)
        )
      : detailEleveKholleur;
    const cleParColonne: Record<ColonneTri, (l: LigneDetail) => string | number> = {
      eleve: (l) => l.eleveNom,
      kholleur: (l) => l.kholleurNom,
      discipline: (l) => l.disciplineNom,
      nbPassages: (l) => l.nbPassages,
    };
    const cle = cleParColonne[tri.colonne];
    return [...filtres].sort((a, b) => {
      const va = cle(a);
      const vb = cle(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * tri.ordre;
      return String(va).localeCompare(String(vb)) * tri.ordre;
    });
  }, [detailEleveKholleur, filtre, tri]);

  const fleche = (colonne: ColonneTri) => (tri.colonne === colonne ? (tri.ordre === 1 ? " ▲" : " ▼") : "");

  return (
    <div>
      <label>
        Classe
        <select value={classeIdActuelle} onChange={(e) => router.push(`/admin/statistiques?classeId=${e.target.value}`)}>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
      </label>

      <div className="stat-cartes">
        <div className="stat-carte">
          <div className="valeur">{nbEleves}</div>
          <div className="libelle">Élèves</div>
        </div>
        <div className="stat-carte">
          <div className="valeur">{nbKholleurs}</div>
          <div className="libelle">Khôlleurs impliqués</div>
        </div>
        <div className="stat-carte">
          <div className="valeur">{nbPassages}</div>
          <div className="libelle">Passages au total</div>
        </div>
        {alternance && (
          <div className="stat-carte">
            <div className="valeur">{alternance.pourcentage.toFixed(0)}%</div>
            <div className="libelle">Alternance LV1/LV2 ({alternance.alternees}/{alternance.total})</div>
          </div>
        )}
      </div>

      <h2>Score horaire moyen par élève</h2>
      <p style={{ color: "#777", fontSize: "0.85rem", marginTop: -8 }}>
        Rang horaire moyen (14 = créneaux vers 14h, 18 = créneaux vers 18h) : plus la valeur est basse, plus l&apos;élève
        passe tôt en moyenne. Un bon équilibrage se traduit par des valeurs proches entre élèves. Échelle resserrée
        entre {minScore.toFixed(1)} et {maxScore.toFixed(1)} pour rendre les écarts visibles.
      </p>
      {scoreParEleve.length === 0 ? (
        <p>Aucun passage publié pour cette classe.</p>
      ) : (
        <div className="graphique-barres">
          {scoreParEleve.map((s) => (
            <BarreHorizontale
              key={s.id}
              label={s.nom}
              valeur={s.moyenne}
              min={minScore}
              max={maxScore}
              formatValeur={(v) => `${v.toFixed(1)} (${s.nbPassages} passages)`}
            />
          ))}
        </div>
      )}

      <h2>Charge par khôlleur (nombre de créneaux)</h2>
      {chargeKholleurs.length === 0 ? (
        <p>Aucune donnée.</p>
      ) : (
        <div className="graphique-barres">
          {chargeKholleurs.map((k) => (
            <BarreHorizontale key={k.nom} label={k.nom} valeur={k.nbCreneaux} max={maxCharge} formatValeur={(v) => `${v}`} />
          ))}
        </div>
      )}

      <h2>Diversité des khôlleurs par discipline</h2>
      <p style={{ color: "#777", fontSize: "0.85rem", marginTop: -8 }}>
        Taux moyen = nombre de khôlleurs distincts vus / nombre de passages, pour les élèves ayant eu au moins 2
        passages dans la discipline. 100% = jamais deux fois le même khôlleur.
      </p>
      {diversiteDisciplines.length === 0 ? (
        <p>Pas assez de données.</p>
      ) : (
        <div className="graphique-barres">
          {diversiteDisciplines.map((d) => (
            <BarreHorizontale
              key={d.discipline}
              label={d.discipline}
              valeur={d.tauxMoyen * 100}
              max={100}
              formatValeur={(v) => `${v.toFixed(0)}%`}
            />
          ))}
        </div>
      )}

      <h2>Détail élève / khôlleur / discipline</h2>
      <input
        type="text"
        placeholder="Filtrer par élève, khôlleur ou discipline…"
        value={filtre}
        onChange={(e) => setFiltre(e.target.value)}
        style={{ marginBottom: 12, width: "100%", maxWidth: 360 }}
      />
      <table className="table-hauteur-limitee">
        <thead>
          <tr>
            <th className="triable" onClick={() => trierPar("eleve")}>
              Élève{fleche("eleve")}
            </th>
            <th className="triable" onClick={() => trierPar("kholleur")}>
              Khôlleur{fleche("kholleur")}
            </th>
            <th className="triable" onClick={() => trierPar("discipline")}>
              Discipline{fleche("discipline")}
            </th>
            <th className="triable" onClick={() => trierPar("nbPassages")}>
              Nb passages{fleche("nbPassages")}
            </th>
          </tr>
        </thead>
        <tbody>
          {detailFiltreTrie.map((l, i) => (
            <tr key={`${l.eleveNom}|${l.kholleurNom}|${l.disciplineNom}|${i}`}>
              <td>{l.eleveNom}</td>
              <td>{l.kholleurNom}</td>
              <td>{l.disciplineNom}</td>
              <td>{l.nbPassages}</td>
            </tr>
          ))}
          {detailFiltreTrie.length === 0 && (
            <tr>
              <td colSpan={4}>Aucun résultat.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
