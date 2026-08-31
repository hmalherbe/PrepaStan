"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";

type ResultatImport = {
  total: number;
  crees: number;
  misAJour: number;
  erreurs: { ligne: number; message: string }[];
};

export function ImportCsv({ endpoint, colonnes, exemple }: { endpoint: string; colonnes: string; exemple: string }) {
  const router = useRouter();
  const [texte, setTexte] = useState("");
  const [resultat, setResultat] = useState<ResultatImport | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  function chargerFichier(e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    const lecteur = new FileReader();
    lecteur.onload = () => setTexte(String(lecteur.result ?? ""));
    lecteur.readAsText(fichier);
    e.target.value = "";
  }

  async function importer() {
    setEnCours(true);
    setErreur(null);
    setResultat(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: texte }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur lors de l'import");
        return;
      }
      setResultat(data);
      router.refresh();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <details className="carte" style={{ marginBottom: 20 }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Importer depuis un fichier CSV</summary>
      <p style={{ color: "#777", fontSize: "0.9rem" }}>
        Colonnes attendues (première ligne, insensible à la casse) : <code>{colonnes}</code>. Fonctionne avec un
        export CSV Excel (virgule ou point-virgule) ou un copier-coller direct depuis un tableur.
      </p>
      <label>
        Fichier CSV
        <input type="file" accept=".csv,text/csv,text/plain" onChange={chargerFichier} />
      </label>
      <label>
        Ou collez directement le contenu ici
        <textarea
          rows={6}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder={exemple}
        />
      </label>
      <button type="button" onClick={importer} disabled={enCours || !texte.trim()}>
        {enCours ? "Import en cours..." : "Importer"}
      </button>

      {erreur && <p className="champ-erreur">{erreur}</p>}

      {resultat && (
        <div style={{ marginTop: 12 }}>
          <p>
            {resultat.total} ligne(s) traitée(s) : {resultat.crees} créée(s), {resultat.misAJour} mise(s) à jour
            {resultat.erreurs.length > 0 && `, ${resultat.erreurs.length} en erreur`}.
          </p>
          {resultat.erreurs.length > 0 && (
            <ul>
              {resultat.erreurs.map((e, i) => (
                <li key={i} className="champ-erreur">
                  Ligne {e.ligne} : {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </details>
  );
}
