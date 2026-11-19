"use client";

import { useMemo, useState } from "react";

type Role = "KHOLLEUR" | "PROFESSEUR_REFERENT" | "ELEVE";

const LIBELLE_ROLE: Record<Role, string> = {
  KHOLLEUR: "Khôlleur",
  PROFESSEUR_REFERENT: "Référent",
  ELEVE: "Étudiant",
};

type Personne = { email: string; nom: string; prenom: string };

export function PriseDeMainForm({
  emailInitial,
  personnes,
}: {
  emailInitial: string;
  personnes: Personne[];
}) {
  const [email, setEmail] = useState(emailInitial);
  const [motDePasseAdmin, setMotDePasseAdmin] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [suggestionsVisibles, setSuggestionsVisibles] = useState(false);

  const suggestions = useMemo(() => {
    const saisie = email.trim().toLowerCase();
    if (saisie.length < 2) return [];
    return personnes
      .filter(
        (p) =>
          p.email.toLowerCase().includes(saisie) ||
          `${p.prenom} ${p.nom}`.toLowerCase().includes(saisie) ||
          `${p.nom} ${p.prenom}`.toLowerCase().includes(saisie)
      )
      .slice(0, 8);
  }, [email, personnes]);
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
      <label style={{ position: "relative", display: "block" }}>
        Email de la personne
        <input
          type="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setSuggestionsVisibles(true);
          }}
          onFocus={() => setSuggestionsVisibles(true)}
          onBlur={() => setTimeout(() => setSuggestionsVisibles(false), 150)}
          placeholder="prenom.nom@exemple.fr"
          autoComplete="off"
        />
        {suggestionsVisibles && suggestions.length > 0 && (
          <ul
            style={{
              position: "absolute",
              zIndex: 1,
              left: 0,
              right: 0,
              margin: 0,
              padding: 4,
              listStyle: "none",
              background: "white",
              border: "1px solid #ccc",
              borderRadius: 4,
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            }}
          >
            {suggestions.map((p) => (
              <li key={p.email}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    // onMouseDown (pas onClick) pour agir avant le onBlur du champ.
                    e.preventDefault();
                    setEmail(p.email);
                    setSuggestionsVisibles(false);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 8px",
                    border: "none",
                    background: "none",
                    color: "inherit",
                    cursor: "pointer",
                  }}
                >
                  {p.prenom} {p.nom} <span style={{ color: "#777" }}>— {p.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
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
