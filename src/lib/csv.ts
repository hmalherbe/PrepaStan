// Parseur CSV minimal et tolérant, pour les imports en masse (élèves,
// khôlleurs, référents). Détecte automatiquement le séparateur — Excel en
// français exporte en point-virgule (la virgule est le séparateur
// décimal), un copier-coller direct depuis Excel est tabulé, un vrai CSV
// est en virgule — plutôt que d'imposer un format précis à l'utilisateur.
export type LigneCsv = Record<string, string>;

function detecterSeparateur(premiereLigne: string): string {
  const candidats = [",", ";", "\t"];
  let meilleur = ",";
  let meilleurCompte = -1;
  for (const c of candidats) {
    const compte = premiereLigne.split(c).length;
    if (compte > meilleurCompte) {
      meilleur = c;
      meilleurCompte = compte;
    }
  }
  return meilleur;
}

function parserLigne(ligne: string, separateur: string): string[] {
  const champs: string[] = [];
  let champ = "";
  let dansGuillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (ligne[i + 1] === '"') {
          champ += '"';
          i++;
        } else {
          dansGuillemets = false;
        }
      } else {
        champ += c;
      }
    } else if (c === '"') {
      dansGuillemets = true;
    } else if (c === separateur) {
      champs.push(champ);
      champ = "";
    } else {
      champ += c;
    }
  }
  champs.push(champ);
  return champs;
}

// Renvoie une ligne par ligne de données (hors en-tête), sous forme d'objet
// {nom_de_colonne_en_minuscules: valeur}. Les en-têtes attendues varient
// selon l'import (voir chaque route .../import/route.ts).
export function parserCsv(texte: string): LigneCsv[] {
  const lignes = texte.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  if (lignes.length === 0) return [];
  const separateur = detecterSeparateur(lignes[0]);
  const entetes = parserLigne(lignes[0], separateur).map((h) => h.trim().toLowerCase());
  return lignes.slice(1).map((ligne) => {
    const valeurs = parserLigne(ligne, separateur);
    const objet: LigneCsv = {};
    entetes.forEach((entete, i) => {
      objet[entete] = (valeurs[i] ?? "").trim();
    });
    return objet;
  });
}
