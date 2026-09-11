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
  valeur: number;
};

function moyenne(vs: number[]): number {
  return vs.reduce((a, b) => a + b, 0) / (vs.length || 1);
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
