"use client";

import Link from "next/link";
import { Fragment, useState } from "react";

type Kholleur = { id: string; nom: string; prenom: string };

type Ligne = {
  classeId: string;
  classeNom: string;
  semaine: number;
  periode: string;
  disciplines: string;
  nbKholles: number;
  nbEleves: number;
  etatTermine: boolean;
  kholleursTermines: Kholleur[];
};

export function HistoriquePlanningsTable({ lignes }: { lignes: Ligne[] }) {
  const [classeFiltre, setClasseFiltre] = useState("");
  const [ligneOuverte, setLigneOuverte] = useState<string | null>(null);

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
            const ouverte = ligneOuverte === cle;
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
                    {l.etatTermine ? (
                      "Terminé"
                    ) : l.kholleursTermines.length === 0 ? (
                      "0 kholleur"
                    ) : (
                      <button
                        type="button"
                        className="discret"
                        onClick={() => setLigneOuverte(ouverte ? null : cle)}
                      >
                        {l.kholleursTermines.length} kholleur{l.kholleursTermines.length > 1 ? "s" : ""}
                      </button>
                    )}
                  </td>
                </tr>
                {ouverte && !l.etatTermine && l.kholleursTermines.length > 0 && (
                  <tr>
                    <td colSpan={7}>
                      <strong>Ont saisi notes et appréciations :</strong>{" "}
                      {l.kholleursTermines.map((k) => `${k.prenom} ${k.nom}`).join(", ")}
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
