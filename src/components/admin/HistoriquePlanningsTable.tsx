"use client";

import Link from "next/link";
import { Fragment, useState } from "react";

type Personne = { id: string; nom: string; prenom: string; discipline: string };

type Ligne = {
  classeId: string;
  classeNom: string;
  semaine: number;
  periode: string;
  disciplines: string;
  nbKholles: number;
  nbEleves: number;
  nbDisciplines: number;
  kholleurs: (Personne & { valide: boolean })[];
  referents: (Personne & { valide: boolean })[];
};

// Un bouton "n validé(s)" / "m non validé(s)" qui déroule la liste
// nom + discipline des personnes concernées quand on clique dessus.
function BoutonEtat({
  label,
  personnes,
  ouvert,
  onToggle,
}: {
  label: string;
  personnes: Personne[];
  ouvert: boolean;
  onToggle: () => void;
}) {
  if (personnes.length === 0) {
    return <span style={{ color: "#777" }}>0 {label}</span>;
  }
  return (
    <button type="button" className="discret" onClick={onToggle} aria-expanded={ouvert}>
      {personnes.length} {label}
    </button>
  );
}

function ListePersonnes({ personnes }: { personnes: Personne[] }) {
  return <>{personnes.map((p) => `${p.prenom} ${p.nom} (${p.discipline})`).join(", ")}</>;
}

export function HistoriquePlanningsTable({ lignes }: { lignes: Ligne[] }) {
  const [classeFiltre, setClasseFiltre] = useState("");
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());

  function toggle(cle: string) {
    setOuverts((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(cle)) suivant.delete(cle);
      else suivant.add(cle);
      return suivant;
    });
  }

  const classes = [...new Map(lignes.map((l) => [l.classeId, l.classeNom])).entries()]
    .map(([id, nom]) => ({ id, nom }))
    .sort((a, b) => a.nom.localeCompare(b.nom));

  const lignesAffichees = classeFiltre ? lignes.filter((l) => l.classeId === classeFiltre) : lignes;

  return (
    <div>
      <label style={{ maxWidth: 280 }}>
        Filtrer par classe
        <select value={classeFiltre} onChange={(e) => setClasseFiltre(e.target.value)}>
          <option value="">Toutes les classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
      </label>

      <table>
        <thead>
          <tr>
            <th>Semaine</th>
            <th>Classe</th>
            <th>Période</th>
            <th>Disciplines</th>
            <th>Khôlles dispensées</th>
            <th>Étudiants interrogés</th>
            <th>État</th>
          </tr>
        </thead>
        <tbody>
          {lignesAffichees.map((l) => {
            const cle = `${l.classeId}_${l.semaine}`;
            const kholleursValides = l.kholleurs.filter((k) => k.valide);
            const kholleursNonValides = l.kholleurs.filter((k) => !k.valide);
            const referentsValides = l.referents.filter((r) => r.valide);
            const referentsNonValides = l.referents.filter((r) => !r.valide);

            const cleKV = `${cle}_kv`;
            const cleKNV = `${cle}_knv`;
            const cleRV = `${cle}_rv`;
            const cleRNV = `${cle}_rnv`;

            return (
              <Fragment key={cle}>
                <tr>
                  <td>
                    <Link href={`/admin/planification/${l.classeId}/${l.semaine}`}>{l.semaine}</Link>
                  </td>
                  <td>{l.classeNom}</td>
                  <td>{l.periode}</td>
                  <td>{l.disciplines}</td>
                  <td>{l.nbKholles}</td>
                  <td>{l.nbEleves}</td>
                  <td>
                    <div>
                      Kholleurs :{" "}
                      <BoutonEtat
                        label="validé(s)"
                        personnes={kholleursValides}
                        ouvert={ouverts.has(cleKV)}
                        onToggle={() => toggle(cleKV)}
                      />{" "}
                      /{" "}
                      <BoutonEtat
                        label="non validé(s)"
                        personnes={kholleursNonValides}
                        ouvert={ouverts.has(cleKNV)}
                        onToggle={() => toggle(cleKNV)}
                      />
                    </div>
                    {l.nbDisciplines > 1 ? (
                      <div>
                        Référents :{" "}
                        <BoutonEtat
                          label="validé(s)"
                          personnes={referentsValides}
                          ouvert={ouverts.has(cleRV)}
                          onToggle={() => toggle(cleRV)}
                        />{" "}
                        /{" "}
                        <BoutonEtat
                          label="non validé(s)"
                          personnes={referentsNonValides}
                          ouvert={ouverts.has(cleRNV)}
                          onToggle={() => toggle(cleRNV)}
                        />
                      </div>
                    ) : (
                      <div>
                        Référent :{" "}
                        {l.referents.length === 0
                          ? "—"
                          : l.referents.every((r) => r.valide)
                            ? "validé"
                            : "non validé"}
                      </div>
                    )}
                  </td>
                </tr>
                {ouverts.has(cleKV) && kholleursValides.length > 0 && (
                  <tr>
                    <td colSpan={7}>
                      <strong>Kholleurs ayant validé :</strong> <ListePersonnes personnes={kholleursValides} />
                    </td>
                  </tr>
                )}
                {ouverts.has(cleKNV) && kholleursNonValides.length > 0 && (
                  <tr>
                    <td colSpan={7}>
                      <strong>Kholleurs n&apos;ayant pas validé :</strong>{" "}
                      <ListePersonnes personnes={kholleursNonValides} />
                    </td>
                  </tr>
                )}
                {ouverts.has(cleRV) && referentsValides.length > 0 && (
                  <tr>
                    <td colSpan={7}>
                      <strong>Référents ayant validé :</strong> <ListePersonnes personnes={referentsValides} />
                    </td>
                  </tr>
                )}
                {ouverts.has(cleRNV) && referentsNonValides.length > 0 && (
                  <tr>
                    <td colSpan={7}>
                      <strong>Référents n&apos;ayant pas validé :</strong>{" "}
                      <ListePersonnes personnes={referentsNonValides} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {lignesAffichees.length === 0 && (
            <tr>
              <td colSpan={7}>
                {lignes.length === 0 ? "Aucun planning généré pour le moment." : "Aucun planning pour cette classe."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
