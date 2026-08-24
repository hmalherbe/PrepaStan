"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Creneau = {
  id: string;
  discipline: string;
  jour: string;
  heureDebut: string;
  heureFin: string;
  kholleurId: string;
  kholleurNom: string;
  salleId: string;
  salleNom: string;
  eleves: string[];
};

type Option = { id: string; nom: string };

export function PlanningReview({
  classeId,
  semaine,
  creneauxInitiaux,
  estBrouillon,
  aucuneSession,
  kholleurs,
  salles,
}: {
  classeId: string;
  semaine: number;
  creneauxInitiaux: Creneau[];
  estBrouillon: boolean;
  aucuneSession: boolean;
  kholleurs: Option[];
  salles: Option[];
}) {
  const router = useRouter();
  const [creneaux, setCreneaux] = useState(creneauxInitiaux);
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [actionEnCours, setActionEnCours] = useState<string | null>(null);

  const parJour = creneaux.reduce<Record<string, Creneau[]>>((acc, c) => {
    (acc[c.jour] ??= []).push(c);
    return acc;
  }, {});

  async function sauvegarderEdition(id: string, champs: Partial<Creneau>) {
    setErreur(null);
    const res = await fetch(`/api/admin/planification/creneaux/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        salleId: champs.salleId,
        kholleurId: champs.kholleurId,
        heureDebut: champs.heureDebut,
        heureFin: champs.heureFin,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErreur(data.error ?? "Erreur lors de la modification");
      return;
    }
    setCreneaux((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              heureDebut: data.heureDebut,
              heureFin: data.heureFin,
              salleId: data.salleId,
              salleNom: salles.find((s) => s.id === data.salleId)?.nom ?? c.salleNom,
              kholleurId: data.kholleurId,
              kholleurNom: kholleurs.find((k) => k.id === data.kholleurId)?.nom ?? c.kholleurNom,
            }
          : c
      )
    );
    setEnEdition(null);
  }

  async function publier() {
    if (!confirm("Publier ce planning ? Les kholleurs seront notifiés et pourront saisir leurs notes.")) return;
    setActionEnCours("publier");
    setErreur(null);
    try {
      const res = await fetch(`/api/admin/planification/${classeId}/${semaine}/publier`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setErreur(data.error ?? "Erreur lors de la publication");
        return;
      }
      router.refresh();
    } finally {
      setActionEnCours(null);
    }
  }

  async function annuler() {
    if (!confirm("Supprimer ce brouillon ? Cette action est irréversible.")) return;
    setActionEnCours("annuler");
    setErreur(null);
    try {
      const res = await fetch(`/api/admin/planification/${classeId}/${semaine}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setErreur(data.error ?? "Erreur lors de la suppression");
        return;
      }
      router.push(`/admin/planification?classeId=${classeId}&semaine=${semaine}`);
    } finally {
      setActionEnCours(null);
    }
  }

  if (aucuneSession) {
    return (
      <p>
        Aucun planning pour cette classe/semaine. <Link href="/admin/planification">Générer un planning</Link>.
      </p>
    );
  }

  return (
    <div>
      <p className={`badge ${estBrouillon ? "badge-attente" : "badge-succes"}`}>
        {estBrouillon ? "Brouillon — non publié" : "Publié"}
      </p>

      {Object.entries(parJour).map(([jour, liste]) => (
        <div key={jour}>
          <p className="jour-titre">
            {new Date(jour).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" })}
          </p>
          <table>
            <thead>
              <tr>
                <th>Horaire</th>
                <th>Discipline</th>
                <th>Kholleur</th>
                <th>Salle</th>
                <th>Élèves</th>
                {estBrouillon && <th></th>}
              </tr>
            </thead>
            <tbody>
              {liste.map((c) =>
                enEdition === c.id ? (
                  <LigneEdition
                    key={c.id}
                    creneau={c}
                    kholleurs={kholleurs}
                    salles={salles}
                    onAnnuler={() => setEnEdition(null)}
                    onSauvegarder={(champs) => sauvegarderEdition(c.id, champs)}
                  />
                ) : (
                  <tr key={c.id}>
                    <td>
                      {c.heureDebut}-{c.heureFin}
                    </td>
                    <td>{c.discipline}</td>
                    <td>{c.kholleurNom}</td>
                    <td>{c.salleNom}</td>
                    <td>{c.eleves.join(", ")}</td>
                    {estBrouillon && (
                      <td>
                        <button className="discret" onClick={() => setEnEdition(c.id)}>
                          Modifier
                        </button>
                      </td>
                    )}
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      ))}

      {erreur && <p className="champ-erreur">{erreur}</p>}

      {estBrouillon && (
        <p style={{ marginTop: 20, display: "flex", gap: 12 }}>
          <button className="discret" onClick={annuler} disabled={actionEnCours !== null}>
            {actionEnCours === "annuler" ? "Suppression…" : "Annuler"}
          </button>
          <Link href={`/admin/planification?classeId=${classeId}&semaine=${semaine}`}>
            <button type="button" className="secondaire">
              Régénérer
            </button>
          </Link>
          <button onClick={publier} disabled={actionEnCours !== null}>
            {actionEnCours === "publier" ? "Publication…" : "Publier le planning"}
          </button>
        </p>
      )}
    </div>
  );
}

function LigneEdition({
  creneau,
  kholleurs,
  salles,
  onAnnuler,
  onSauvegarder,
}: {
  creneau: Creneau;
  kholleurs: Option[];
  salles: Option[];
  onAnnuler: () => void;
  onSauvegarder: (champs: Partial<Creneau>) => void;
}) {
  const [heureDebut, setHeureDebut] = useState(creneau.heureDebut);
  const [heureFin, setHeureFin] = useState(creneau.heureFin);
  const [kholleurId, setKholleurId] = useState(creneau.kholleurId);
  const [salleId, setSalleId] = useState(creneau.salleId);

  return (
    <tr>
      <td style={{ display: "flex", gap: 4 }}>
        <input value={heureDebut} onChange={(e) => setHeureDebut(e.target.value)} style={{ width: 60 }} />
        <input value={heureFin} onChange={(e) => setHeureFin(e.target.value)} style={{ width: 60 }} />
      </td>
      <td>{creneau.discipline}</td>
      <td>
        <select value={kholleurId} onChange={(e) => setKholleurId(e.target.value)}>
          {kholleurs.map((k) => (
            <option key={k.id} value={k.id}>
              {k.nom}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select value={salleId} onChange={(e) => setSalleId(e.target.value)}>
          {salles.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </select>
      </td>
      <td>{creneau.eleves.join(", ")}</td>
      <td style={{ display: "flex", gap: 6 }}>
        <button onClick={() => onSauvegarder({ heureDebut, heureFin, kholleurId, salleId })}>OK</button>
        <button className="discret" onClick={onAnnuler}>
          Annuler
        </button>
      </td>
    </tr>
  );
}
