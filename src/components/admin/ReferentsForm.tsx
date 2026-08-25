"use client";

import { useState } from "react";

type Referent = { id: string; nom: string; prenom: string; email: string; classe: string; discipline: string };
type Discipline = { id: string; nom: string };
type Classe = { id: string; nom: string; disciplines: Discipline[] };

export function ReferentsForm({
  referentsInitiaux,
  classes,
  disciplines,
}: {
  referentsInitiaux: Referent[];
  classes: Classe[];
  disciplines: Discipline[];
}) {
  const [referents, setReferents] = useState(referentsInitiaux);
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [classeId, setClasseId] = useState(classes[0]?.id ?? "");
  const [disciplineId, setDisciplineId] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const classeChoisie = classes.find((c) => c.id === classeId);
  const disciplinesDisponibles = classeChoisie?.disciplines ?? [];

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const res = await fetch("/api/admin/referents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, prenom, email, password, classeId, disciplineId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur lors de la création");
        return;
      }
      setReferents((prev) => [
        ...prev,
        {
          id: data.id,
          nom,
          prenom,
          email,
          classe: classes.find((c) => c.id === classeId)?.nom ?? "",
          discipline: disciplines.find((d) => d.id === disciplineId)?.nom ?? "",
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

  async function supprimer(referentId: string) {
    if (!confirm("Retirer cette assignation de référent ?")) return;
    const res = await fetch(`/api/admin/referents/${referentId}`, { method: "DELETE" });
    if (!res.ok) return;
    setReferents((prev) => prev.filter((r) => r.id !== referentId));
  }

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Prénom</th>
            <th>Classe</th>
            <th>Discipline</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {referents.map((r) => (
            <tr key={r.id}>
              <td>{r.nom}</td>
              <td>{r.prenom}</td>
              <td>{r.classe}</td>
              <td>{r.discipline}</td>
              <td>
                <button className="discret" onClick={() => supprimer(r.id)}>
                  Retirer
                </button>
              </td>
            </tr>
          ))}
          {referents.length === 0 && (
            <tr>
              <td colSpan={5}>Aucun référent pour le moment.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Ajouter un référent</h2>
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
        <label>
          Classe
          <select
            value={classeId}
            onChange={(e) => {
              setClasseId(e.target.value);
              setDisciplineId("");
            }}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </label>
        <label>
          Discipline
          <select value={disciplineId} onChange={(e) => setDisciplineId(e.target.value)} required>
            <option value="" disabled>
              Choisir…
            </option>
            {disciplinesDisponibles.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nom}
              </option>
            ))}
          </select>
          {disciplinesDisponibles.length === 0 && (
            <span style={{ color: "#777", fontSize: "0.85rem" }}>
              Aucune discipline assignée à cette classe (voir l'écran Classes).
            </span>
          )}
        </label>
        {erreur && <p className="champ-erreur">{erreur}</p>}
        <button type="submit" disabled={enCours || !disciplineId}>
          {enCours ? "Création…" : "Ajouter"}
        </button>
      </form>
    </div>
  );
}
