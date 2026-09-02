"use client";

import Link from "next/link";
import { useState } from "react";

type Kholleur = {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  disciplines: string[];
  disciplineIds: string[];
  nbDisponibilites: number;
};
type Discipline = { id: string; nom: string };

export function KholleursForm({
  kholleursInitiaux,
  disciplines,
}: {
  kholleursInitiaux: Kholleur[];
  disciplines: Discipline[];
}) {
  const [kholleurs, setKholleurs] = useState(kholleursInitiaux);
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [disciplineIds, setDisciplineIds] = useState<string[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [erreurEdition, setErreurEdition] = useState<string | null>(null);
  const [disciplineFiltre, setDisciplineFiltre] = useState("");

  const kholleursAffiches = kholleurs
    .filter((k) => !disciplineFiltre || k.disciplineIds.includes(disciplineFiltre))
    .sort(
      (a, b) => a.disciplines.join(", ").localeCompare(b.disciplines.join(", ")) || a.nom.localeCompare(b.nom)
    );

  function toggleDiscipline(id: string) {
    setDisciplineIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  }

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const res = await fetch("/api/admin/kholleurs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, prenom, email, password, disciplineIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur lors de la création");
        return;
      }
      setKholleurs((prev) => [
        ...prev,
        {
          id: data.id,
          nom,
          prenom,
          email,
          disciplines: disciplines.filter((d) => disciplineIds.includes(d.id)).map((d) => d.nom),
          disciplineIds,
          nbDisponibilites: 0,
        },
      ]);
      setNom("");
      setPrenom("");
      setEmail("");
      setPassword("");
      setDisciplineIds([]);
    } finally {
      setEnCours(false);
    }
  }

  async function sauvegarderEdition(
    kholleurId: string,
    patch: { nom: string; prenom: string; email: string; password?: string; disciplineIds: string[] }
  ) {
    setErreurEdition(null);
    const res = await fetch(`/api/admin/kholleurs/${kholleurId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) {
      setErreurEdition(data.error ?? "Erreur lors de la modification");
      return;
    }
    setKholleurs((prev) =>
      prev.map((k) =>
        k.id === kholleurId
          ? {
              ...k,
              nom: patch.nom,
              prenom: patch.prenom,
              email: patch.email,
              disciplineIds: patch.disciplineIds,
              disciplines: disciplines.filter((d) => patch.disciplineIds.includes(d.id)).map((d) => d.nom),
            }
          : k
      )
    );
    setEnEdition(null);
  }

  async function supprimer(kholleurId: string) {
    if (!confirm("Supprimer ce kholleur ?")) return;
    const res = await fetch(`/api/admin/kholleurs/${kholleurId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Erreur lors de la suppression");
      return;
    }
    setKholleurs((prev) => prev.filter((k) => k.id !== kholleurId));
  }

  return (
    <div>
      <label style={{ maxWidth: 280 }}>
        Filtrer par discipline
        <select value={disciplineFiltre} onChange={(e) => setDisciplineFiltre(e.target.value)}>
          <option value="">Toutes les disciplines</option>
          {disciplines.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nom}
            </option>
          ))}
        </select>
      </label>

      <table>
        <thead>
          <tr>
            <th>Disciplines</th>
            <th>Nom</th>
            <th>Prénom</th>
            <th>Email</th>
            <th>Disponibilités</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {kholleursAffiches.map((k) =>
            enEdition === k.id ? (
              <LigneEdition
                key={k.id}
                kholleur={k}
                disciplines={disciplines}
                onAnnuler={() => setEnEdition(null)}
                onSauvegarder={(patch) => sauvegarderEdition(k.id, patch)}
              />
            ) : (
              <tr key={k.id}>
                <td>{k.disciplines.join(", ")}</td>
                <td>{k.nom}</td>
                <td>{k.prenom}</td>
                <td>{k.email}</td>
                <td>{k.nbDisponibilites}</td>
                <td style={{ display: "flex", gap: 8 }}>
                  <button className="discret" onClick={() => setEnEdition(k.id)}>
                    Modifier
                  </button>
                  <button className="discret" onClick={() => supprimer(k.id)}>
                    Supprimer
                  </button>
                  <Link href={`/admin/kholleurs/${k.id}`}>Disponibilités</Link>
                </td>
              </tr>
            )
          )}
          {kholleursAffiches.length === 0 && (
            <tr>
              <td colSpan={6}>
                {kholleurs.length === 0 ? "Aucun kholleur pour le moment." : "Aucun kholleur pour cette discipline."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {erreurEdition && <p className="champ-erreur">{erreurEdition}</p>}

      <h2>Ajouter un kholleur</h2>
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
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Mot de passe
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <p>Disciplines qu'il peut kholler :</p>
        {disciplines.map((d) => (
          <label key={d.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={disciplineIds.includes(d.id)} onChange={() => toggleDiscipline(d.id)} />
            {d.nom}
          </label>
        ))}
        {erreur && <p className="champ-erreur">{erreur}</p>}
        <button type="submit" disabled={enCours || disciplineIds.length === 0} style={{ marginTop: 12 }}>
          {enCours ? "Création…" : "Ajouter"}
        </button>
      </form>
    </div>
  );
}

function LigneEdition({
  kholleur,
  disciplines,
  onAnnuler,
  onSauvegarder,
}: {
  kholleur: Kholleur;
  disciplines: Discipline[];
  onAnnuler: () => void;
  onSauvegarder: (patch: {
    nom: string;
    prenom: string;
    email: string;
    password?: string;
    disciplineIds: string[];
  }) => void;
}) {
  const [nom, setNom] = useState(kholleur.nom);
  const [prenom, setPrenom] = useState(kholleur.prenom);
  const [email, setEmail] = useState(kholleur.email);
  const [password, setPassword] = useState("");
  const [disciplineIds, setDisciplineIds] = useState<string[]>(kholleur.disciplineIds);

  function toggleDiscipline(id: string) {
    setDisciplineIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  }

  return (
    <tr>
      <td colSpan={6}>
        <div className="carte" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom" style={{ flex: 1 }} />
            <input
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              placeholder="Prénom"
              style={{ flex: 1 }}
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              style={{ flex: 1 }}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nouveau mot de passe (optionnel)"
              style={{ flex: 1 }}
            />
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {disciplines.map((d) => (
              <label key={d.id} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={disciplineIds.includes(d.id)}
                  onChange={() => toggleDiscipline(d.id)}
                />
                {d.nom}
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() =>
                onSauvegarder({ nom, prenom, email, password: password || undefined, disciplineIds })
              }
              disabled={disciplineIds.length === 0}
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
