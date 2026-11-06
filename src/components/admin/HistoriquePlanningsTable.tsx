"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { RenvoiAvecSelectionModal } from "@/components/admin/RenvoiAvecSelectionModal";

type Personne = { id: string; nom: string; prenom: string; discipline: string };

type Ligne = {
  classeId: string;
  classeNom: string;
  semaine: number;
  periode: string;
  disciplines: string;
  nbKholles: number;
  nbEleves: number;
  nbDisciplines: number;
  publie: boolean;
  kholleurs: (Personne & { valide: boolean })[];
  referents: (Personne & { valide: boolean })[];
};

// Un bouton "n validé(s)" / "m non validé(s)" qui déroule la liste
// nom + discipline des personnes concernées quand on clique dessus.
function BoutonEtat({
  label,
  personnes,
  ouvert,
  onToggle,
}: {
  label: string;
  personnes: Personne[];
  ouvert: boolean;
  onToggle: () => void;
}) {
  if (personnes.length === 0) {
    return <span style={{ color: "#777" }}>0 {label}</span>;
  }
  return (
    <button type="button" className="discret" onClick={onToggle} aria-expanded={ouvert}>
      {personnes.length} {label}
    </button>
  );
}

function ListePersonnes({ personnes }: { personnes: Personne[] }) {
  return <>{personnes.map((p) => `${p.prenom} ${p.nom} (${p.discipline})`).join(", ")}</>;
}

// Les 3 renvois manuels (planning khôlleurs, convocation étudiants,
// validation référents) partagent la même forme : POST sans corps vers
// /api/admin/planification/:classeId/:semaine/renvoyer-..., réponse
// {<champCompte>: nombre}. Centralisé ici plutôt que dans PlanningReview.tsx
// (qui a sa propre copie, un seul appel à la fois donc pas besoin de la
// généricité ci-dessous) car l'historique doit gérer un renvoi par ligne,
// indépendamment des autres lignes affichées en même temps.
const ACTIONS_RENVOI = {
  kholleurs: { chemin: "renvoyer-planning-kholleurs", champ: "kholleursNotifies", libelle: "kholleur(s)" },
  eleves: { chemin: "renvoyer-convocations-eleves", champ: "elevesNotifies", libelle: "élève(s)" },
  referents: { chemin: "renvoyer-validation-referents", champ: "referentsNotifies", libelle: "référent(s)" },
} as const;
type ActionRenvoi = keyof typeof ACTIONS_RENVOI;
const LIBELLE_ACTION_RENVOI: Record<ActionRenvoi, string> = {
  kholleurs: "Renvoyer planning aux kholleurs",
  eleves: "Renvoyer convocation aux étudiants",
  referents: "Renvoyer validation au professeur référent",
};

// kholleurs/eleves seuls passent par la fenêtre de sélection des
// destinataires (voir RenvoiAvecSelectionModal) ; referents reste un envoi
// direct à tous (comme avant), ce bouton-là n'ayant pas été demandé avec
// cette possibilité.
type ActionAvecModal = "kholleurs" | "eleves";
const CONFIG_MODAL: Record<ActionAvecModal, { cheminListe: string; champIds: string }> = {
  kholleurs: { cheminListe: "destinataires-kholleurs", champIds: "kholleurIds" },
  eleves: { cheminListe: "destinataires-eleves", champIds: "eleveIds" },
};
function estActionAvecModal(action: ActionRenvoi): action is ActionAvecModal {
  return action === "kholleurs" || action === "eleves";
}

export function HistoriquePlanningsTable({ lignes }: { lignes: Ligne[] }) {
  const [classeFiltre, setClasseFiltre] = useState("");
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  // Clé = `${classeId}_${semaine}_${action}` : un renvoi en cours ou un
  // message ne concernent qu'une seule ligne/action à la fois, jamais les
  // autres lignes affichées en même temps.
  const [renvoiEnCours, setRenvoiEnCours] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [modalOuvert, setModalOuvert] = useState<{ classeId: string; semaine: number; action: ActionAvecModal } | null>(
    null
  );

  async function renvoyer(classeId: string, semaine: number, action: ActionRenvoi) {
    const { chemin, champ, libelle } = ACTIONS_RENVOI[action];
    const cle = `${classeId}_${semaine}_${action}`;
    setRenvoiEnCours(cle);
    setMessages((prev) => ({ ...prev, [cle]: "" }));
    try {
      const res = await fetch(`/api/admin/planification/${classeId}/${semaine}/${chemin}`, { method: "POST" });
      const data = await res.json();
      setMessages((prev) => ({
        ...prev,
        [cle]: res.ok ? `Renvoyé à ${data[champ]} ${libelle}.` : data.error ?? "Erreur lors du renvoi",
      }));
    } finally {
      setRenvoiEnCours(null);
    }
  }

  function toggle(cle: string) {
    setOuverts((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(cle)) suivant.delete(cle);
      else suivant.add(cle);
      return suivant;
    });
  }

  async function supprimerTout() {
    if (lignes.length === 0) return;
    if (
      !confirm(
        `Supprimer TOUS les plannings (${lignes.length} semaine(s) au total, toutes classes confondues) ? ` +
          "Créneaux, notes, appréciations et validations associées seront perdus. Cette action est irréversible."
      )
    ) {
      return;
    }
    setSuppressionEnCours(true);
    const res = await fetch("/api/admin/planification/historique", { method: "DELETE" });
    const data = await res.json();
    setSuppressionEnCours(false);
    if (!res.ok) {
      alert(data.error ?? "Erreur lors de la suppression");
      return;
    }
    window.location.reload();
  }

  const classes = [...new Map(lignes.map((l) => [l.classeId, l.classeNom])).entries()]
    .map(([id, nom]) => ({ id, nom }))
    .sort((a, b) => a.nom.localeCompare(b.nom));

  const lignesAffichees = classeFiltre ? lignes.filter((l) => l.classeId === classeFiltre) : lignes;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button
          type="button"
          className="discret"
          onClick={supprimerTout}
          disabled={lignes.length === 0 || suppressionEnCours}
        >
          {suppressionEnCours ? "Suppression en cours…" : "Supprimer tous les plannings"}
        </button>
      </div>

      <label style={{ maxWidth: 280 }}>
        Filtrer par classe
        <select value={classeFiltre} onChange={(e) => setClasseFiltre(e.target.value)}>
          <option value="">Toutes les classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
      </label>

      <table>
        <thead>
          <tr>
            <th>Semaine</th>
            <th>Classe</th>
            <th>Période</th>
            <th>Disciplines</th>
            <th>Khôlles dispensées</th>
            <th>Étudiants interrogés</th>
            <th>Publication</th>
            <th>État</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {lignesAffichees.map((l) => {
            const cle = `${l.classeId}_${l.semaine}`;
            const kholleursValides = l.kholleurs.filter((k) => k.valide);
            const kholleursNonValides = l.kholleurs.filter((k) => !k.valide);
            const referentsValides = l.referents.filter((r) => r.valide);
            const referentsNonValides = l.referents.filter((r) => !r.valide);

            const cleKV = `${cle}_kv`;
            const cleKNV = `${cle}_knv`;
            const cleRV = `${cle}_rv`;
            const cleRNV = `${cle}_rnv`;

            return (
              <Fragment key={cle}>
                <tr>
                  <td>
                    <Link href={`/admin/planification/${l.classeId}/${l.semaine}`}>{l.semaine}</Link>
                  </td>
                  <td>{l.classeNom}</td>
                  <td>{l.periode}</td>
                  <td>{l.disciplines}</td>
                  <td>{l.nbKholles}</td>
                  <td>{l.nbEleves}</td>
                  <td>
                    <span style={{ color: l.publie ? "#1a7f37" : "#777" }}>
                      {l.publie ? "Publié" : "Non publié"}
                    </span>
                  </td>
                  <td>
                    <div>
                      Kholleurs :{" "}
                      <BoutonEtat
                        label="validé(s)"
                        personnes={kholleursValides}
                        ouvert={ouverts.has(cleKV)}
                        onToggle={() => toggle(cleKV)}
                      />{" "}
                      /{" "}
                      <BoutonEtat
                        label="non validé(s)"
                        personnes={kholleursNonValides}
                        ouvert={ouverts.has(cleKNV)}
                        onToggle={() => toggle(cleKNV)}
                      />
                    </div>
                    <div>
                      {l.nbDisciplines > 1 ? "Référents" : "Référent"} :{" "}
                      <BoutonEtat
                        label="validé(s)"
                        personnes={referentsValides}
                        ouvert={ouverts.has(cleRV)}
                        onToggle={() => toggle(cleRV)}
                      />{" "}
                      /{" "}
                      <BoutonEtat
                        label="non validé(s)"
                        personnes={referentsNonValides}
                        ouvert={ouverts.has(cleRNV)}
                        onToggle={() => toggle(cleRNV)}
                      />
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(Object.keys(ACTIONS_RENVOI) as ActionRenvoi[]).map((action) => {
                        const cleAction = `${l.classeId}_${l.semaine}_${action}`;
                        const message = messages[cleAction];
                        return (
                          <div key={action}>
                            <button
                              type="button"
                              className="discret"
                              disabled={!l.publie || renvoiEnCours !== null}
                              title={!l.publie ? "Planning encore en brouillon : publiez-le d'abord" : undefined}
                              onClick={() =>
                                estActionAvecModal(action)
                                  ? setModalOuvert({ classeId: l.classeId, semaine: l.semaine, action })
                                  : renvoyer(l.classeId, l.semaine, action)
                              }
                            >
                              {renvoiEnCours === cleAction ? "Envoi…" : LIBELLE_ACTION_RENVOI[action]}
                            </button>
                            {message && (
                              <div style={{ fontSize: "0.85rem", color: "#777" }}>{message}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                </tr>
                {ouverts.has(cleKV) && kholleursValides.length > 0 && (
                  <tr>
                    <td colSpan={9}>
                      <strong>Kholleurs ayant validé :</strong> <ListePersonnes personnes={kholleursValides} />
                    </td>
                  </tr>
                )}
                {ouverts.has(cleKNV) && kholleursNonValides.length > 0 && (
                  <tr>
                    <td colSpan={9}>
                      <strong>Kholleurs n&apos;ayant pas validé :</strong>{" "}
                      <ListePersonnes personnes={kholleursNonValides} />
                    </td>
                  </tr>
                )}
                {ouverts.has(cleRV) && referentsValides.length > 0 && (
                  <tr>
                    <td colSpan={9}>
                      <strong>Référents ayant validé :</strong> <ListePersonnes personnes={referentsValides} />
                    </td>
                  </tr>
                )}
                {ouverts.has(cleRNV) && referentsNonValides.length > 0 && (
                  <tr>
                    <td colSpan={9}>
                      <strong>Référents n&apos;ayant pas validé :</strong>{" "}
                      <ListePersonnes personnes={referentsNonValides} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {lignesAffichees.length === 0 && (
            <tr>
              <td colSpan={9}>
                {lignes.length === 0 ? "Aucun planning généré pour le moment." : "Aucun planning pour cette classe."}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {modalOuvert && (
        <RenvoiAvecSelectionModal
          titre={LIBELLE_ACTION_RENVOI[modalOuvert.action]}
          classeId={modalOuvert.classeId}
          semaine={modalOuvert.semaine}
          cheminListe={CONFIG_MODAL[modalOuvert.action].cheminListe}
          cheminEnvoi={ACTIONS_RENVOI[modalOuvert.action].chemin}
          champIds={CONFIG_MODAL[modalOuvert.action].champIds}
          champCompte={ACTIONS_RENVOI[modalOuvert.action].champ}
          libelleUnite={ACTIONS_RENVOI[modalOuvert.action].libelle}
          onFermer={() => setModalOuvert(null)}
          onEnvoye={(message) => {
            const cleAction = `${modalOuvert.classeId}_${modalOuvert.semaine}_${modalOuvert.action}`;
            setMessages((prev) => ({ ...prev, [cleAction]: message }));
          }}
        />
      )}
    </div>
  );
}
