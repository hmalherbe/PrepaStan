"use client";

import Link from "next/link";
import { useState } from "react";

type Kholleur = {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  disciplines: string[];
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

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Prénom</th>
            <th>Email</th>
            <th>Disciplines</th>
            <th>Disponibilités</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {kholleurs.map((k) => (
            <tr key={k.id}>
              <td>{k.nom}</td>
              <td>{k.prenom}</td>
              <td>{k.email}</td>
              <td>{k.disciplines.join(", ")}</td>
              <td>{k.nbDisponibilites}</td>
              <td>
                <Link href={`/admin/kholleurs/${k.id}`}>Gérer les disponibilités</Link>
              </td>
            </tr>
          ))}
          {kholleurs.length === 0 && (
            <tr>
              <td colSpan={6}>Aucun kholleur pour le moment.</td>
            </tr>
          )}
        </tbody>
      </table>

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
