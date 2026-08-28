"use client";

import { useState } from "react";

type Eleve = {
  id: string;
  nom: string;
  prenom: string;
  classeId: string;
  classe: string;
  aUnCompte: boolean;
  email: string | null;
};
type Classe = { id: string; nom: string };

export function ElevesForm({ elevesInitiaux, classes }: { elevesInitiaux: Eleve[]; classes: Classe[] }) {
  const [eleves, setEleves] = useState(elevesInitiaux);
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [classeId, setClasseId] = useState(classes[0]?.id ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [erreurEdition, setErreurEdition] = useState<string | null>(null);

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const res = await fetch("/api/admin/eleves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, prenom, classeId, email: email || undefined, password: password || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur lors de l'ajout");
        return;
      }
      setEleves((prev) => [
        ...prev,
        {
          id: data.id,
          nom,
          prenom,
          classeId,
          classe: classes.find((c) => c.id === classeId)?.nom ?? "",
          aUnCompte: Boolean(email),
          email: email || null,
        },
      ]);
      setNom("");
      setPrenom("");
      setEmail("");
      setPassword("");
    } finally {
      setEnCours(false);
    }
  }

  async function supprimer(eleveId: string) {
    if (!confirm("Supprimer cet élève ?")) return;
    const res = await fetch(`/api/admin/eleves/${eleveId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Erreur lors de la suppression");
      return;
    }
    setEleves((prev) => prev.filter((e) => e.id !== eleveId));
  }

  async function sauvegarderEdition(
    eleveId: string,
    patch: { nom: string; prenom: string; classeId: string; email?: string; password?: string }
  ) {
    setErreurEdition(null);
    const res = await fetch(`/api/admin/eleves/${eleveId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) {
      setErreurEdition(data.error ?? "Erreur lors de la modification");
      return;
    }
    setEleves((prev) =>
      prev.map((e) =>
        e.id === eleveId
          ? {
              ...e,
              nom: patch.nom,
              prenom: patch.prenom,
              classeId: patch.classeId,
              classe: classes.find((c) => c.id === patch.classeId)?.nom ?? "",
              email: patch.email ?? e.email,
              aUnCompte: e.aUnCompte || Boolean(patch.email),
            }
          : e
      )
    );
    setEnEdition(null);
  }

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Prénom</th>
            <th>Classe</th>
            <th>Compte</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {eleves.map((e) =>
            enEdition === e.id ? (
              <LigneEdition
                key={e.id}
                eleve={e}
                classes={classes}
                onAnnuler={() => setEnEdition(null)}
                onSauvegarder={(patch) => sauvegarderEdition(e.id, patch)}
              />
            ) : (
              <tr key={e.id}>
                <td>{e.nom}</td>
                <td>{e.prenom}</td>
                <td>{e.classe}</td>
                <td>{e.aUnCompte ? "Oui" : "Non"}</td>
                <td style={{ display: "flex", gap: 8 }}>
                  <button className="discret" onClick={() => setEnEdition(e.id)}>
                    Modifier
                  </button>
                  <button className="discret" onClick={() => supprimer(e.id)}>
                    Supprimer
                  </button>
                </td>
              </tr>
            )
          )}
          {eleves.length === 0 && (
            <tr>
              <td colSpan={5}>Aucun élève pour le moment.</td>
            </tr>
          )}
        </tbody>
      </table>
      {erreurEdition && <p className="champ-erreur">{erreurEdition}</p>}

      <h2>Ajouter un étudiant</h2>
      <form onSubmit={ajouter} className="carte">
        <label>
          Nom
          <input value={nom} onChange={(e) => setNom(e.target.value)} required />
        </label>
        <label>
          Prénom
          <input value={prenom} onChange={(e) => setPrenom(e.target.value)} required />
        </label>
        <label>
          Classe
          <select value={classeId} onChange={(e) => setClasseId(e.target.value)} required>
            <option value="" disabled>
              Choisir…
            </option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
          {classes.length === 0 && (
            <span style={{ color: "#777", fontSize: "0.85rem" }}>
              Aucune classe créée pour le moment (voir l'écran Classes).
            </span>
          )}
        </label>
        <label>
          Email (optionnel, crée un compte de connexion)
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {email && (
          <label>
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={Boolean(email)}
            />
          </label>
        )}
        {erreur && <p className="champ-erreur">{erreur}</p>}
        <button type="submit" disabled={enCours || !classeId}>
          {enCours ? "Ajout…" : "Ajouter l'étudiant"}
        </button>
      </form>
    </div>
  );
}

function LigneEdition({
  eleve,
  classes,
  onAnnuler,
  onSauvegarder,
}: {
  eleve: Eleve;
  classes: Classe[];
  onAnnuler: () => void;
  onSauvegarder: (patch: {
    nom: string;
    prenom: string;
    classeId: string;
    email?: string;
    password?: string;
  }) => void;
}) {
  const [nom, setNom] = useState(eleve.nom);
  const [prenom, setPrenom] = useState(eleve.prenom);
  const [classeId, setClasseId] = useState(eleve.classeId);
  const [email, setEmail] = useState(eleve.email ?? "");
  const [password, setPassword] = useState("");

  return (
    <tr>
      <td colSpan={5}>
        <div className="carte" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom" style={{ flex: 1 }} />
            <input
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              placeholder="Prénom"
              style={{ flex: 1 }}
            />
            <select value={classeId} onChange={(e) => setClasseId(e.target.value)} style={{ flex: 1 }}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </div>
          <label>
            {eleve.aUnCompte ? "Email du compte" : "Email (optionnel, crée un compte de connexion)"}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {email && (
            <label>
              {eleve.aUnCompte ? "Nouveau mot de passe (optionnel)" : "Mot de passe"}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={!eleve.aUnCompte}
              />
            </label>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() =>
                onSauvegarder({
                  nom,
                  prenom,
                  classeId,
                  email: email || undefined,
                  password: password || undefined,
                })
              }
            >
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
