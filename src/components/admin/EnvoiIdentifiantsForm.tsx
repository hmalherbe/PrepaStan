"use client";

import { useState } from "react";

type Role = "ADMIN" | "KHOLLEUR" | "PROFESSEUR_REFERENT" | "ELEVE";

type Utilisateur = {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  roles: Role[];
  derniereConnexion: string | null;
};

const LIBELLE_ROLE: Record<Role, string> = {
  ADMIN: "Admin",
  KHOLLEUR: "Kholleur",
  PROFESSEUR_REFERENT: "Référent",
  ELEVE: "Étudiant",
};

export function EnvoiIdentifiantsForm({ utilisateurs }: { utilisateurs: Utilisateur[] }) {
  const [selection, setSelection] = useState<Set<string>>(
    () => new Set(utilisateurs.filter((u) => !u.derniereConnexion).map((u) => u.id))
  );
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [resultat, setResultat] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function basculer(id: string) {
    setSelection((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  }

  function toutSelectionner() {
    setSelection(new Set(utilisateurs.map((u) => u.id)));
  }

  function toutDeselectionner() {
    setSelection(new Set());
  }

  async function envoyer() {
    if (selection.size === 0) return;
    if (
      !confirm(
        `Envoyer un email d'activation à ${selection.size} personne(s) ? Chacune recevra un lien pour choisir elle-même son mot de passe.`
      )
    ) {
      return;
    }
    setEnvoiEnCours(true);
    setErreur(null);
    setResultat(null);
    try {
      const res = await fetch("/api/admin/envoi-identifiants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ utilisateurIds: [...selection] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur lors de l'envoi");
        return;
      }
      setResultat(`${data.count} email(s) envoyé(s).`);
    } finally {
      setEnvoiEnCours(false);
    }
  }

  return (
    <div>
      <p style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <button type="button" className="discret" onClick={toutSelectionner}>
          Tout cocher
        </button>
        <button type="button" className="discret" onClick={toutDeselectionner}>
          Tout décocher
        </button>
        <span style={{ color: "#777" }}>{selection.size} sélectionné(s)</span>
      </p>

      <table>
        <thead>
          <tr>
            <th></th>
            <th>Nom</th>
            <th>Email</th>
            <th>Rôle(s)</th>
            <th>Dernière connexion</th>
          </tr>
        </thead>
        <tbody>
          {utilisateurs.map((u) => (
            <tr key={u.id}>
              <td>
                <input type="checkbox" checked={selection.has(u.id)} onChange={() => basculer(u.id)} />
              </td>
              <td>
                {u.prenom} {u.nom}
              </td>
              <td>{u.email}</td>
              <td>{u.roles.filter((r) => r !== "ADMIN").map((r) => LIBELLE_ROLE[r]).join(", ")}</td>
              <td>
                {u.derniereConnexion
                  ? new Date(u.derniereConnexion).toLocaleString("fr-FR")
                  : "Jamais connecté"}
              </td>
            </tr>
          ))}
          {utilisateurs.length === 0 && (
            <tr>
              <td colSpan={5}>Aucun compte khôlleur, référent ou étudiant.</td>
            </tr>
          )}
        </tbody>
      </table>

      {erreur && <p className="champ-erreur">{erreur}</p>}
      {resultat && <p className="badge badge-succes">{resultat}</p>}

      <p style={{ marginTop: 16 }}>
        <button onClick={envoyer} disabled={selection.size === 0 || envoiEnCours}>
          {envoiEnCours ? "Envoi…" : `Envoyer l'email d'activation (${selection.size})`}
        </button>
      </p>
    </div>
  );
}
