"use client";

import { useState } from "react";

type Role = "KHOLLEUR" | "PROFESSEUR_REFERENT" | "ELEVE";

const LIBELLE_ROLE: Record<Role, string> = {
  KHOLLEUR: "Khôlleur",
  PROFESSEUR_REFERENT: "Référent",
  ELEVE: "Étudiant",
};

export function PriseDeMainForm({ emailInitial }: { emailInitial: string }) {
  const [email, setEmail] = useState(emailInitial);
  const [motDePasseAdmin, setMotDePasseAdmin] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Renseigné quand la personne cumule plusieurs rôles (ex. khôlleur ET
  // référent) : le serveur renvoie choixRequis plutôt que de créer la
  // session, le temps de demander lequel incarner (voir route demarrer).
  const [rolesAChoisir, setRolesAChoisir] = useState<Role[] | null>(null);
  const [profilChoisi, setProfilChoisi] = useState<Role | "">("");

  async function demarrer(profil?: Role) {
    setErreur(null);
    setEnCours(true);
    try {
      const res = await fetch("/api/admin/impersonation/demarrer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, motDePasseAdmin, profil }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur lors de la prise de main");
        setEnCours(false);
        return;
      }
      if (data.choixRequis) {
        setRolesAChoisir(data.roles);
        setEnCours(false);
        return;
      }
      // Navigation complète (pas router.push) : force NextAuth côté client
      // à relire le cookie de session fraîchement posé par le serveur,
      // plutôt que de garder en cache la session admin précédente.
      window.location.href = data.redirect;
    } catch {
      setErreur("Erreur lors de la prise de main");
      setEnCours(false);
    }
  }

  if (rolesAChoisir) {
    return (
      <div className="carte" style={{ maxWidth: 420 }}>
        <p>
          {email} cumule plusieurs rôles — lequel voulez-vous incarner ? Le menu affiché ne montrera que
          celui-ci, pour que la prise de main reste sans ambiguïté.
        </p>
        <label>
          Profil
          <select value={profilChoisi} onChange={(e) => setProfilChoisi(e.target.value as Role)}>
            <option value="">— Choisir —</option>
            {rolesAChoisir.map((r) => (
              <option key={r} value={r}>
                {LIBELLE_ROLE[r]}
              </option>
            ))}
          </select>
        </label>
        {erreur && <p className="champ-erreur">{erreur}</p>}
        <p style={{ display: "flex", gap: 10 }}>
          <button onClick={() => demarrer(profilChoisi || undefined)} disabled={!profilChoisi || enCours}>
            {enCours ? "Connexion…" : "Prendre la main"}
          </button>
          <button
            type="button"
            className="discret"
            onClick={() => {
              setRolesAChoisir(null);
              setProfilChoisi("");
            }}
          >
            Annuler
          </button>
        </p>
      </div>
    );
  }

  return (
    <form
      className="carte"
      style={{ maxWidth: 420 }}
      onSubmit={(e) => {
        e.preventDefault();
        demarrer();
      }}
    >
      <label>
        Email de la personne
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="prenom.nom@exemple.fr"
        />
      </label>
      <label>
        Votre mot de passe administrateur
        <input
          type="password"
          required
          value={motDePasseAdmin}
          onChange={(e) => setMotDePasseAdmin(e.target.value)}
        />
      </label>
      {erreur && <p className="champ-erreur">{erreur}</p>}
      <p>
        <button type="submit" disabled={enCours}>
          {enCours ? "Connexion…" : "Prendre la main"}
        </button>
      </p>
    </form>
  );
}
