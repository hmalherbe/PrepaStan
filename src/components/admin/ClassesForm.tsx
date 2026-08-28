"use client";

import Link from "next/link";
import { useState } from "react";

type Classe = {
  id: string;
  nom: string;
  anneeScolaireId: string;
  anneeScolaire: string;
  nbEleves: number;
  nbDisciplines: number;
};
type AnneeScolaire = { id: string; libelle: string };

const NOUVELLE_ANNEE = "__nouvelle__";

export function ClassesForm({
  classesInitiales,
  anneesScolairesInitiales,
}: {
  classesInitiales: Classe[];
  anneesScolairesInitiales: AnneeScolaire[];
}) {
  const [classes, setClasses] = useState(classesInitiales);
  const [anneesScolaires, setAnneesScolaires] = useState(anneesScolairesInitiales);
  const [nom, setNom] = useState("");
  const [anneeScolaireId, setAnneeScolaireId] = useState(anneesScolairesInitiales[0]?.id ?? "");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [erreurEdition, setErreurEdition] = useState<string | null>(null);

  async function creerAnneeScolaire(libelle: string): Promise<AnneeScolaire | null> {
    const res = await fetch("/api/admin/annees-scolaires", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ libelle }),
    });
    const data = await res.json();
    if (!res.ok) return null;
    setAnneesScolaires((prev) => [data, ...prev]);
    return data;
  }

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const res = await fetch("/api/admin/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, anneeScolaireId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur lors de la création");
        return;
      }
      setClasses((prev) => [
        ...prev,
        {
          id: data.id,
          nom: data.nom,
          anneeScolaireId: data.anneeScolaireId,
          anneeScolaire: data.anneeScolaire.libelle,
          nbEleves: 0,
          nbDisciplines: 0,
        },
      ]);
      setNom("");
    } finally {
      setEnCours(false);
    }
  }

  async function sauvegarderEdition(classeId: string, patch: { nom: string; anneeScolaireId: string }) {
    setErreurEdition(null);
    const res = await fetch(`/api/admin/classes/${classeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) {
      setErreurEdition(data.error ?? "Erreur lors de la modification");
      return;
    }
    setClasses((prev) =>
      prev.map((c) =>
        c.id === classeId
          ? { ...c, nom: data.nom, anneeScolaireId: data.anneeScolaireId, anneeScolaire: data.anneeScolaire.libelle }
          : c
      )
    );
    setEnEdition(null);
  }

  async function supprimer(classeId: string) {
    if (!confirm("Supprimer cette classe ?")) return;
    const res = await fetch(`/api/admin/classes/${classeId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Erreur lors de la suppression");
      return;
    }
    setClasses((prev) => prev.filter((c) => c.id !== classeId));
  }

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Année scolaire</th>
            <th>Élèves</th>
            <th>Disciplines</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {classes.map((c) =>
            enEdition === c.id ? (
              <LigneEdition
                key={c.id}
                classe={c}
                anneesScolaires={anneesScolaires}
                onCreerAnneeScolaire={creerAnneeScolaire}
                onAnnuler={() => setEnEdition(null)}
                onSauvegarder={(patch) => sauvegarderEdition(c.id, patch)}
              />
            ) : (
              <tr key={c.id}>
                <td>{c.nom}</td>
                <td>{c.anneeScolaire}</td>
                <td>{c.nbEleves}</td>
                <td>{c.nbDisciplines}</td>
                <td style={{ display: "flex", gap: 8 }}>
                  <button className="discret" onClick={() => setEnEdition(c.id)}>
                    Modifier
                  </button>
                  <button className="discret" onClick={() => supprimer(c.id)}>
                    Supprimer
                  </button>
                  <Link href={`/admin/classes/${c.id}`}>Gérer</Link>
                </td>
              </tr>
            )
          )}
          {classes.length === 0 && (
            <tr>
              <td colSpan={5}>Aucune classe pour le moment.</td>
            </tr>
          )}
        </tbody>
      </table>
      {erreurEdition && <p className="champ-erreur">{erreurEdition}</p>}

      <h2>Ajouter une classe</h2>
      <form onSubmit={ajouter} className="carte">
        <label>
          Nom
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="MP2I-1" required />
        </label>
        <SelectAnneeScolaire
          anneesScolaires={anneesScolaires}
          value={anneeScolaireId}
          onChange={setAnneeScolaireId}
          onCreer={creerAnneeScolaire}
        />
        {erreur && <p className="champ-erreur">{erreur}</p>}
        <button type="submit" disabled={enCours || !anneeScolaireId}>
          {enCours ? "Création…" : "Ajouter"}
        </button>
      </form>
    </div>
  );
}

// Liste déroulante des années scolaires existantes, avec une option pour en
// créer une nouvelle à la volée (l'année scolaire est une entité à part,
// partagée entre classes, pas un simple champ texte par classe).
function SelectAnneeScolaire({
  anneesScolaires,
  value,
  onChange,
  onCreer,
}: {
  anneesScolaires: AnneeScolaire[];
  value: string;
  onChange: (id: string) => void;
  onCreer: (libelle: string) => Promise<AnneeScolaire | null>;
}) {
  const [enCreation, setEnCreation] = useState(false);
  const [nouveauLibelle, setNouveauLibelle] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  async function valider() {
    if (!nouveauLibelle.trim()) return;
    const creee = await onCreer(nouveauLibelle.trim());
    if (!creee) {
      setErreur("Cette année scolaire existe déjà");
      return;
    }
    onChange(creee.id);
    setEnCreation(false);
    setNouveauLibelle("");
    setErreur(null);
  }

  if (enCreation) {
    return (
      <label>
        Nouvelle année scolaire
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={nouveauLibelle}
            onChange={(e) => setNouveauLibelle(e.target.value)}
            placeholder="2026-2027"
            autoFocus
          />
          <button type="button" onClick={valider}>
            Créer
          </button>
          <button type="button" className="discret" onClick={() => setEnCreation(false)}>
            Annuler
          </button>
        </div>
        {erreur && <span className="champ-erreur">{erreur}</span>}
      </label>
    );
  }

  return (
    <label>
      Année scolaire
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === NOUVELLE_ANNEE) {
            setEnCreation(true);
          } else {
            onChange(e.target.value);
          }
        }}
      >
        {anneesScolaires.length === 0 && (
          <option value="" disabled>
            Aucune année scolaire — créez-en une
          </option>
        )}
        {anneesScolaires.map((a) => (
          <option key={a.id} value={a.id}>
            {a.libelle}
          </option>
        ))}
        <option value={NOUVELLE_ANNEE}>+ Nouvelle année scolaire…</option>
      </select>
    </label>
  );
}

function LigneEdition({
  classe,
  anneesScolaires,
  onCreerAnneeScolaire,
  onAnnuler,
  onSauvegarder,
}: {
  classe: Classe;
  anneesScolaires: AnneeScolaire[];
  onCreerAnneeScolaire: (libelle: string) => Promise<AnneeScolaire | null>;
  onAnnuler: () => void;
  onSauvegarder: (patch: { nom: string; anneeScolaireId: string }) => void;
}) {
  const [nom, setNom] = useState(classe.nom);
  const [anneeScolaireId, setAnneeScolaireId] = useState(classe.anneeScolaireId);

  return (
    <tr>
      <td colSpan={5}>
        <div className="carte" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ flex: 1 }}>
              Nom
              <input value={nom} onChange={(e) => setNom(e.target.value)} />
            </label>
            <div style={{ flex: 1 }}>
              <SelectAnneeScolaire
                anneesScolaires={anneesScolaires}
                value={anneeScolaireId}
                onChange={setAnneeScolaireId}
                onCreer={onCreerAnneeScolaire}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => onSauvegarder({ nom, anneeScolaireId })} disabled={!anneeScolaireId}>
              OK
            </button>
            <button className="discret" onClick={onAnnuler}>
              Annuler
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}
