"use client";

import { useState } from "react";
import { PlaceholderTextarea } from "@/components/PlaceholderTextarea";

export function ParametresGenerauxForm({
  delaiInitial,
  modeleKholleurInitial,
  modeleReferentInitial,
  modeleEleveInitial,
  envoiKholleurInitial,
  envoiReferentInitial,
  envoiEleveInitial,
  poidsEquilibrageKholleurInitial,
  poidsDiversiteKholleurInitial,
  poidsEquilibrageHoraireInitial,
  poidsAlternanceLangueInitial,
}: {
  delaiInitial: number;
  modeleKholleurInitial: string;
  modeleReferentInitial: string;
  modeleEleveInitial: string;
  envoiKholleurInitial: boolean;
  envoiReferentInitial: boolean;
  envoiEleveInitial: boolean;
  poidsEquilibrageKholleurInitial: number;
  poidsDiversiteKholleurInitial: number;
  poidsEquilibrageHoraireInitial: number;
  poidsAlternanceLangueInitial: number;
}) {
  const [delai, setDelai] = useState(delaiInitial);
  const [modeleKholleur, setModeleKholleur] = useState(modeleKholleurInitial);
  const [modeleReferent, setModeleReferent] = useState(modeleReferentInitial);
  const [modeleEleve, setModeleEleve] = useState(modeleEleveInitial);
  const [envoiKholleur, setEnvoiKholleur] = useState(envoiKholleurInitial);
  const [envoiReferent, setEnvoiReferent] = useState(envoiReferentInitial);
  const [envoiEleve, setEnvoiEleve] = useState(envoiEleveInitial);
  const [poidsEquilibrageKholleur, setPoidsEquilibrageKholleur] = useState(poidsEquilibrageKholleurInitial);
  const [poidsDiversiteKholleur, setPoidsDiversiteKholleur] = useState(poidsDiversiteKholleurInitial);
  const [poidsEquilibrageHoraire, setPoidsEquilibrageHoraire] = useState(poidsEquilibrageHoraireInitial);
  const [poidsAlternanceLangue, setPoidsAlternanceLangue] = useState(poidsAlternanceLangueInitial);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function enregistrer() {
    setEnCours(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/parametres-generaux", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          delaiEnvoiMailsNotationJours: delai,
          modeleEmailKholleur: modeleKholleur,
          modeleEmailReferent: modeleReferent,
          modeleEmailEleve: modeleEleve,
          envoiEmailKholleur: envoiKholleur,
          envoiEmailReferent: envoiReferent,
          envoiEmailEleve: envoiEleve,
          poidsEquilibrageKholleur,
          poidsDiversiteKholleur,
          poidsEquilibrageHoraire,
          poidsAlternanceLangue,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMessage(data.error ?? "Erreur lors de l'enregistrement");
        return;
      }
      setMessage("Enregistré.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="carte" style={{ marginBottom: 20 }}>
      <h2>Paramètres généraux</h2>
      <label>
        Délai d&apos;envoi des mails de rappel aux kholleurs (jours)
        <input
          type="number"
          min={0}
          max={60}
          value={delai}
          onChange={(e) => setDelai(Number(e.target.value))}
          style={{ width: 80 }}
        />
      </label>
      <p style={{ color: "#777", fontSize: "0.9rem" }}>
        Nombre de jours après la khôlle avant d&apos;envoyer un email de rappel au kholleur s&apos;il n&apos;a pas
        encore saisi note et appréciation. 0 = envoi dès que possible après la khôlle (le jour même).
      </p>

      <h3>Corps des emails</h3>
      <p style={{ color: "#777", fontSize: "0.9rem" }}>
        Message personnalisé placé en tête de chaque email envoyé automatiquement par PrepaStan. Cliquez sur un
        bouton pour insérer le champ correspondant à l&apos;endroit du curseur : il sera remplacé par le prénom et
        le nom du destinataire réel au moment de l&apos;envoi.
      </p>
      <PlaceholderTextarea
        label="Kholleurs — à la publication du planning"
        value={modeleKholleur}
        onChange={setModeleKholleur}
        actif={envoiKholleur}
        onActifChange={setEnvoiKholleur}
      />
      <PlaceholderTextarea
        label="Professeurs référents — quand toutes les grilles de la session sont validées"
        value={modeleReferent}
        onChange={setModeleReferent}
        actif={envoiReferent}
        onActifChange={setEnvoiReferent}
      />
      <PlaceholderTextarea
        label="Étudiants — quand le référent clôture la session (note disponible)"
        value={modeleEleve}
        onChange={setModeleEleve}
        actif={envoiEleve}
        onActifChange={setEnvoiEleve}
      />

      <h3>Réglages du solveur (fine-tuning)</h3>
      <p style={{ color: "#777", fontSize: "0.9rem" }}>
        Pondérations de l&apos;objectif du solveur de planification (OR-Tools) : plus une pondération est élevée,
        plus l&apos;objectif correspondant est prioritaire par rapport aux autres lors de la génération d&apos;un
        planning. Valeurs par défaut d&apos;origine : 10 / 5 / 1 / 1000.
      </p>
      <label style={{ display: "block", marginBottom: 10 }}>
        Équilibrage de la charge des kholleurs
        <input
          type="number"
          min={0}
          max={100000}
          value={poidsEquilibrageKholleur}
          onChange={(e) => setPoidsEquilibrageKholleur(Number(e.target.value))}
          style={{ width: 100 }}
        />
      </label>
      <label style={{ display: "block", marginBottom: 10 }}>
        Diversité des kholleurs vus par un même étudiant
        <input
          type="number"
          min={0}
          max={100000}
          value={poidsDiversiteKholleur}
          onChange={(e) => setPoidsDiversiteKholleur(Number(e.target.value))}
          style={{ width: 100 }}
        />
      </label>
      <label style={{ display: "block", marginBottom: 10 }}>
        Équilibrage des horaires de passage
        <input
          type="number"
          min={0}
          max={100000}
          value={poidsEquilibrageHoraire}
          onChange={(e) => setPoidsEquilibrageHoraire(Number(e.target.value))}
          style={{ width: 100 }}
        />
      </label>
      <label style={{ display: "block", marginBottom: 10 }}>
        Alternance LV1/LV2
        <input
          type="number"
          min={0}
          max={100000}
          value={poidsAlternanceLangue}
          onChange={(e) => setPoidsAlternanceLangue(Number(e.target.value))}
          style={{ width: 100 }}
        />
      </label>

      <button type="button" onClick={enregistrer} disabled={enCours}>
        {enCours ? "Enregistrement..." : "Enregistrer"}
      </button>
      {message && <p>{message}</p>}
    </div>
  );
}
