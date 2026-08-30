"use client";

import { useState } from "react";

type Salle = { id: string; nom: string; nbCreneaux: number };

export function SallesForm({ sallesInitiales }: { sallesInitiales: Salle[] }) {
  const [salles, setSalles] = useState(sallesInitiales);
  const [nom, setNom] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [erreurEdition, setErreurEdition] = useState<string | null>(null);

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const res = await fetch("/api/admin/salles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur lors de la création");
        return;
      }
      setSalles((prev) => [...prev, { id: data.id, nom: data.nom, nbCreneaux: 0 }]);
      setNom("");
    } finally {
      setEnCours(false);
    }
  }

  async function sauvegarder(salleId: string, patch: { nom: string }) {
    setErreurEdition(null);
    const res = await fetch(`/api/admin/salles/${salleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) {
      setErreurEdition(data.error ?? "Erreur lors de la modification");
      return;
    }
    setSalles((prev) => prev.map((s) => (s.id === salleId ? { ...s, nom: patch.nom } : s)));
    setEnEdition(null);
  }

  async function supprimer(salleId: string) {
    if (!confirm("Supprimer cette salle ?")) return;
    const res = await fetch(`/api/admin/salles/${salleId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Erreur lors de la suppression");
      return;
    }
    setSalles((prev) => prev.filter((s) => s.id !== salleId));
  }

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Créneaux planifiés</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {salles.map((s) =>
            enEdition === s.id ? (
              <LigneEdition
                key={s.id}
                salle={s}
                onAnnuler={() => setEnEdition(null)}
                onSauvegarder={(patch) => sauvegarder(s.id, patch)}
              />
            ) : (
              <tr key={s.id}>
                <td>{s.nom}</td>
                <td>{s.nbCreneaux}</td>
                <td style={{ display: "flex", gap: 8 }}>
                  <button className="discret" onClick={() => setEnEdition(s.id)}>
                    Modifier
                  </button>
                  <button className="discret" onClick={() => supprimer(s.id)}>
                    Supprimer
                  </button>
                </td>
              </tr>
            )
          )}
          {salles.length === 0 && (
            <tr>
              <td colSpan={3}>Aucune salle pour le moment.</td>
            </tr>
          )}
        </tbody>
      </table>
      {erreurEdition && <p className="champ-erreur">{erreurEdition}</p>}

      <h2>Ajouter une salle</h2>
      <form onSubmit={ajouter} className="carte">
        <label>
          Nom
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Salle 104" required />
        </label>
        {erreur && <p className="champ-erreur">{erreur}</p>}
        <button type="submit" disabled={enCours} style={{ marginTop: 12 }}>
          {enCours ? "Création…" : "Ajouter"}
        </button>
      </form>
    </div>
  );
}

function LigneEdition({
  salle,
  onAnnuler,
  onSauvegarder,
}: {
  salle: Salle;
  onAnnuler: () => void;
  onSauvegarder: (patch: { nom: string }) => void;
}) {
  const [nom, setNom] = useState(salle.nom);

  return (
    <tr>
      <td>
        <input value={nom} onChange={(e) => setNom(e.target.value)} />
      </td>
      <td>{salle.nbCreneaux}</td>
      <td style={{ display: "flex", gap: 6 }}>
        <button onClick={() => onSauvegarder({ nom })}>OK</button>
        <button className="discret" onClick={onAnnuler}>
          Annuler
        </button>
      </td>
    </tr>
  );
}
