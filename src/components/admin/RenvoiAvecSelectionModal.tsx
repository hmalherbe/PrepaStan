"use client";

import { useEffect, useState } from "react";

type Destinataire = { id: string; nom: string };

// Fenêtre de sélection des destinataires avant un renvoi manuel d'email
// (planning kholleurs / convocation étudiants — voir
// renvoyer-planning-kholleurs et renvoyer-convocations-eleves) : charge la
// liste des personnes concernées par cette (classe, semaine), toutes
// cochées par défaut (comportement "envoyer à tous" identique à avant cette
// fenêtre), et permet d'en décocher certaines avant d'envoyer. Réutilisé à
// l'identique depuis l'écran de relecture (PlanningReview) et l'Historique,
// avec les mêmes routes — seuls `classeId`/`semaine` changent d'un appelant
// à l'autre.
export function RenvoiAvecSelectionModal({
  titre,
  classeId,
  semaine,
  cheminListe,
  cheminEnvoi,
  champIds,
  champCompte,
  libelleUnite,
  onFermer,
  onEnvoye,
}: {
  titre: string;
  classeId: string;
  semaine: number;
  // Nom du dernier segment de chemin, ex. "destinataires-kholleurs".
  cheminListe: string;
  // Nom du dernier segment de chemin, ex. "renvoyer-planning-kholleurs".
  cheminEnvoi: string;
  // Nom du champ attendu dans le corps POST, ex. "kholleurIds".
  champIds: string;
  // Nom du champ de la réponse donnant le nombre de personnes notifiées.
  champCompte: string;
  // Unité affichée dans le message de confirmation, ex. "kholleur(s)".
  libelleUnite: string;
  onFermer: () => void;
  onEnvoye: (message: string) => void;
}) {
  const [destinataires, setDestinataires] = useState<Destinataire[] | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [chargement, setChargement] = useState(true);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    setChargement(true);
    setErreur(null);
    fetch(`/api/admin/planification/${classeId}/${semaine}/${cheminListe}`)
      .then((res) => res.json())
      .then((data: { destinataires: Destinataire[] }) => {
        if (annule) return;
        setDestinataires(data.destinataires);
        setSelection(new Set(data.destinataires.map((d) => d.id)));
      })
      .catch(() => {
        if (!annule) setErreur("Erreur lors du chargement des destinataires");
      })
      .finally(() => {
        if (!annule) setChargement(false);
      });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classeId, semaine, cheminListe]);

  function basculer(id: string) {
    setSelection((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  }

  async function envoyer() {
    if (selection.size === 0) return;
    setEnvoiEnCours(true);
    setErreur(null);
    try {
      const res = await fetch(`/api/admin/planification/${classeId}/${semaine}/${cheminEnvoi}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [champIds]: [...selection] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur lors de l'envoi");
        return;
      }
      onEnvoye(`Renvoyé à ${data[champCompte]} ${libelleUnite}.`);
      onFermer();
    } finally {
      setEnvoiEnCours(false);
    }
  }

  const tousCoches = destinataires !== null && selection.size === destinataires.length;

  return (
    <div
      className="no-print"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onFermer}
    >
      <div
        className="carte"
        style={{ maxWidth: "90vw", maxHeight: "85vh", overflow: "auto", background: "#fff", minWidth: 340 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{titre}</h2>

        {chargement && <p>Chargement…</p>}

        {!chargement && destinataires !== null && destinataires.length === 0 && (
          <p>Aucun destinataire concerné (rien n&apos;est encore publié cette semaine).</p>
        )}

        {!chargement && destinataires !== null && destinataires.length > 0 && (
          <>
            <label style={{ display: "block", marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={tousCoches}
                onChange={(e) => setSelection(e.target.checked ? new Set(destinataires.map((d) => d.id)) : new Set())}
                style={{ marginRight: 8 }}
              />
              Tous ({destinataires.length})
            </label>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: "45vh", overflow: "auto" }}>
              {destinataires.map((d) => (
                <li key={d.id}>
                  <label style={{ display: "block", padding: "4px 0" }}>
                    <input
                      type="checkbox"
                      checked={selection.has(d.id)}
                      onChange={() => basculer(d.id)}
                      style={{ marginRight: 8 }}
                    />
                    {d.nom}
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}

        {erreur && <p className="champ-erreur">{erreur}</p>}

        <p style={{ marginTop: 16, display: "flex", gap: 12 }}>
          <button type="button" onClick={envoyer} disabled={envoiEnCours || chargement || selection.size === 0}>
            {envoiEnCours ? "Envoi…" : `Envoyer à ${selection.size} sélectionné(s)`}
          </button>
          <button type="button" className="secondaire" onClick={onFermer} disabled={envoiEnCours}>
            Annuler
          </button>
        </p>
      </div>
    </div>
  );
}
