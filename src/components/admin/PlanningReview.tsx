"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import { RenvoiAvecSelectionModal } from "@/components/admin/RenvoiAvecSelectionModal";

type EleveCreneau = { passageId: string; eleveId: string; nom: string };

type Creneau = {
  id: string;
  discipline: string;
  // Détermine l'ordre des lignes à l'impression (voir parJourImpression
  // plus bas) : les langues vivantes d'un même jour sont regroupées en tête
  // de la page de ce jour, plutôt que mélangées avec le reste.
  estLangueVivante: boolean;
  jour: string;
  // Absente pour les créneaux créés avant l'introduction de ce champ.
  heureDebutPreparation: string | null;
  heureDebut: string;
  heureFin: string;
  kholleurId: string;
  kholleurNom: string;
  salleId: string;
  salleNom: string;
  eleves: EleveCreneau[];
  // Session déjà clôturée (toutes les notes validées par le référent) :
  // rééditer le kholleur/la salle n'aurait alors plus de sens (l'historique
  // de qui a fait passer qui doit rester figé). Un planning publié mais pas
  // encore clôturé reste modifiable, précisément pour pouvoir remplacer un
  // kholleur devenu indisponible après publication.
  sessionCloturee: boolean;
};

type Option = { id: string; nom: string };

function minutesDepuisMinuit(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function PlanningReview({
  classeId,
  classeNom,
  semaine,
  dateDebutSemaine,
  creneauxInitiaux,
  estBrouillon,
  aucuneSession,
  kholleurs,
  salles,
  dispensesParDiscipline,
}: {
  classeId: string;
  // Repris dans le titre de chaque jour (voir .jour-titre) : le <h1> de la
  // page est masqué à l'impression pour ne pas empiéter sur le budget
  // vertical du premier jour, donc cette info doit être portée ailleurs.
  classeNom: string;
  semaine: number;
  // Lundi de cette semaine ("YYYY-MM-DD") : pré-remplit la date sur l'écran
  // de génération quand on clique "Régénérer", pour ne pas avoir à la
  // ressaisir à la main.
  dateDebutSemaine: string;
  creneauxInitiaux: Creneau[];
  estBrouillon: boolean;
  aucuneSession: boolean;
  kholleurs: Option[];
  salles: Option[];
  // Élèves dispensés d'une des disciplines de cette semaine (voir
  // EleveDispense) : n'apparaissent dans aucun créneau ci-dessus (exclus
  // par le solveur), affichés ici à part pour que ça ne ressemble pas à un
  // oubli.
  dispensesParDiscipline: { discipline: string; eleves: string[] }[];
}) {
  const router = useRouter();
  const [creneaux, setCreneaux] = useState(creneauxInitiaux);
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [actionEnCours, setActionEnCours] = useState<string | null>(null);
  // Sélection en cours pour l'interversion de deux élèves (0 à 2 au plus) :
  // cliquer un 3e nom repart d'une sélection vide avec ce nom-là plutôt que
  // de compléter une liste de 3, pour rester simple à comprendre.
  const [selection, setSelection] = useState<EleveCreneau[]>([]);
  const [chevauchementsOuvert, setChevauchementsOuvert] = useState(false);
  const [modalKholleursOuvert, setModalKholleursOuvert] = useState(false);
  const [modalElevesOuvert, setModalElevesOuvert] = useState(false);

  // Pour chaque élève ayant 2 khôlles (ou plus) le même jour : la paire de
  // créneaux consécutifs (triés par heure de khôlle), avec l'écart entre la
  // fin de la 1re et le début de préparation de la 2e. Un écart négatif
  // signale un chevauchement réel — ce que le solveur CP-SAT ne devrait
  // jamais produire (contrainte dure, voir solver.py), donc un signal utile
  // pour repérer une incohérence introduite après coup (édition manuelle,
  // génération partielle...). Recalculé uniquement quand `creneaux` change,
  // pas à chaque rendu (la double boucle est O(n²) par élève/jour).
  const pairesMemeJour = useMemo(() => {
    type PassageJour = {
      eleveNom: string;
      discipline: string;
      heureDebutPreparation: string;
      heureDebut: string;
      heureFin: string;
    };
    const parEleveJour = new Map<string, PassageJour[]>();
    for (const c of creneaux) {
      for (const e of c.eleves) {
        const cle = `${e.eleveId}|${c.jour}`;
        const liste = parEleveJour.get(cle) ?? [];
        liste.push({
          eleveNom: e.nom,
          discipline: c.discipline,
          heureDebutPreparation: c.heureDebutPreparation ?? c.heureDebut,
          heureDebut: c.heureDebut,
          heureFin: c.heureFin,
        });
        parEleveJour.set(cle, liste);
      }
    }

    const paires: {
      cle: string;
      jour: string;
      eleveNom: string;
      premiere: PassageJour;
      deuxieme: PassageJour;
      ecartMinutes: number;
    }[] = [];
    for (const [cle, liste] of parEleveJour) {
      if (liste.length < 2) continue;
      const jour = cle.split("|")[1];
      const triee = [...liste].sort((a, b) => minutesDepuisMinuit(a.heureDebut) - minutesDepuisMinuit(b.heureDebut));
      for (let i = 1; i < triee.length; i++) {
        const premiere = triee[i - 1];
        const deuxieme = triee[i];
        paires.push({
          cle: `${cle}_${i}`,
          jour,
          eleveNom: premiere.eleveNom,
          premiere,
          deuxieme,
          ecartMinutes:
            minutesDepuisMinuit(deuxieme.heureDebutPreparation) - minutesDepuisMinuit(premiere.heureFin),
        });
      }
    }
    return paires.sort((a, b) => a.jour.localeCompare(b.jour) || a.eleveNom.localeCompare(b.eleveNom));
  }, [creneaux]);

  function basculerSelection(eleve: EleveCreneau) {
    setSelection((prev) => {
      if (prev.some((e) => e.passageId === eleve.passageId)) {
        return prev.filter((e) => e.passageId !== eleve.passageId);
      }
      return prev.length >= 2 ? [eleve] : [...prev, eleve];
    });
  }

  async function intervertir() {
    if (selection.length !== 2) return;
    const [a, b] = selection;
    if (!confirm(`Intervertir ${a.nom} et ${b.nom} sur leurs créneaux respectifs ?`)) return;
    setActionEnCours("intervertir");
    setErreur(null);
    try {
      const res = await fetch("/api/admin/planification/passages/echanger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passageId1: a.passageId, passageId2: b.passageId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur lors de l'interversion");
        return;
      }
      // Mise à jour locale plutôt qu'un router.refresh() : "creneaux" est de
      // l'état local (voir sauvegarderEdition plus haut, même raison) donc
      // un simple refresh ne le réafficherait pas tout seul. Chaque élève
      // migre du créneau qu'il quitte vers celui de l'autre.
      setCreneaux((prev) => {
        const creneau1 = prev.find((c) => c.eleves.some((e) => e.passageId === a.passageId));
        const creneau2 = prev.find((c) => c.eleves.some((e) => e.passageId === b.passageId));
        return prev.map((c) => {
          if (creneau1 && c.id === creneau1.id) {
            return { ...c, eleves: [...c.eleves.filter((e) => e.passageId !== a.passageId), b] };
          }
          if (creneau2 && c.id === creneau2.id) {
            return { ...c, eleves: [...c.eleves.filter((e) => e.passageId !== b.passageId), a] };
          }
          return c;
        });
      });
      setSelection([]);
    } finally {
      setActionEnCours(null);
    }
  }

  const parJour = creneaux.reduce<Record<string, Creneau[]>>((acc, c) => {
    (acc[c.jour] ??= []).push(c);
    return acc;
  }, {});

  // Regroupement spécifique à l'impression (voir .vue-impression dans
  // globals.css) : une page par jour, comme la vue écran ci-dessus (même
  // `parJour`), mais en réordonnant chaque jour pour que les langues
  // vivantes de ce jour-là soient regroupées en tête plutôt que mélangées
  // avec les autres disciplines dans l'ordre alphabétique habituel —
  // séparées visuellement via TableImpression (qui marque aussi la
  // frontière langues/non-langues). `creneaux` est déjà
  // trié discipline puis kholleur puis heure au sein d'un même jour (voir la
  // page serveur), donc filtrer un jour en préservant cet ordre suffit à
  // garder chaque sous-groupe (langues, puis non-langues) lui-même trié.
  const parJourImpression = Object.fromEntries(
    Object.entries(parJour).map(([jour, liste]) => [
      jour,
      [...liste.filter((c) => c.estLangueVivante), ...liste.filter((c) => !c.estLangueVivante)],
    ])
  );

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
        // Absent si l'admin n'a pas touché ce champ : le serveur recalcule
        // alors automatiquement à partir de la durée de préparation de la
        // discipline (voir Paramètres). Présent = valeur imposée telle quelle.
        heureDebutPreparation: champs.heureDebutPreparation ?? undefined,
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
              heureDebutPreparation: data.heureDebutPreparation,
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
      router.push(`/admin/planification?classeId=${classeId}&date=${dateDebutSemaine}`);
    } finally {
      setActionEnCours(null);
    }
  }

  async function renvoyerValidationReferents() {
    if (!confirm("Renvoyer l'invitation à valider aux professeurs référents concernés ?")) return;
    setActionEnCours("renvoyer-referents");
    setErreur(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/admin/planification/${classeId}/${semaine}/renvoyer-validation-referents`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur lors du renvoi");
        return;
      }
      setInfo(`Email renvoyé à ${data.referentsNotifies} référent(s).`);
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
      <p className={`badge no-print ${estBrouillon ? "badge-attente" : "badge-succes"}`}>
        {estBrouillon ? "Brouillon — non publié" : "Publié"}
      </p>

      {pairesMemeJour.length > 0 && (
        <p className="no-print">
          <button type="button" className="discret" onClick={() => setChevauchementsOuvert(true)}>
            {pairesMemeJour.some((p) => p.ecartMinutes < 0) ? "⚠ " : ""}
            {pairesMemeJour.length} élève(s) avec 2 khôlles le même jour
          </button>
        </p>
      )}

      {chevauchementsOuvert && (
        <div
          className="no-print"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setChevauchementsOuvert(false)}
        >
          <div
            className="carte"
            style={{ maxWidth: "90vw", maxHeight: "85vh", overflow: "auto", background: "#fff" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Élèves avec 2 khôlles le même jour</h2>
            <p style={{ color: "#777", fontSize: "0.9rem" }}>
              Écart = début de préparation de la 2e khôlle moins fin de la 1re. Un écart négatif signale un
              chevauchement réel entre les deux khôlles — en principe impossible avec le solveur (contrainte
              dure), donc un signal d&apos;une incohérence introduite après coup (édition manuelle d&apos;un
              créneau, génération partielle d&apos;une semaine déjà en partie planifiée...).
            </p>
            <table>
              <thead>
                <tr>
                  <th>Étudiant</th>
                  <th>Jour</th>
                  <th>1re khôlle</th>
                  <th>2e khôlle</th>
                  <th>Écart</th>
                </tr>
              </thead>
              <tbody>
                {pairesMemeJour.map((p) => (
                  <tr key={p.cle}>
                    <td>{p.eleveNom}</td>
                    <td>{new Date(p.jour).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" })}</td>
                    <td>
                      {p.premiere.discipline} — préparation {p.premiere.heureDebutPreparation}, khôlle{" "}
                      {p.premiere.heureDebut}-{p.premiere.heureFin}
                    </td>
                    <td>
                      {p.deuxieme.discipline} — préparation {p.deuxieme.heureDebutPreparation}, khôlle{" "}
                      {p.deuxieme.heureDebut}-{p.deuxieme.heureFin}
                    </td>
                    <td className={p.ecartMinutes < 0 ? "champ-erreur" : undefined}>
                      {p.ecartMinutes} min{p.ecartMinutes < 0 ? " — chevauchement" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ marginTop: 16 }}>
              <button type="button" onClick={() => setChevauchementsOuvert(false)}>
                Fermer
              </button>
            </p>
          </div>
        </div>
      )}

      {modalKholleursOuvert && (
        <RenvoiAvecSelectionModal
          titre="Renvoyer planning aux kholleurs"
          classeId={classeId}
          semaine={semaine}
          cheminListe="destinataires-kholleurs"
          cheminEnvoi="renvoyer-planning-kholleurs"
          champIds="kholleurIds"
          champCompte="kholleursNotifies"
          libelleUnite="kholleur(s)"
          onFermer={() => setModalKholleursOuvert(false)}
          onEnvoye={setInfo}
        />
      )}

      {modalElevesOuvert && (
        <RenvoiAvecSelectionModal
          titre="Renvoyer convocation aux étudiants"
          classeId={classeId}
          semaine={semaine}
          cheminListe="destinataires-eleves"
          cheminEnvoi="renvoyer-convocations-eleves"
          champIds="eleveIds"
          champCompte="elevesNotifies"
          libelleUnite="élève(s)"
          onFermer={() => setModalElevesOuvert(false)}
          onEnvoye={setInfo}
        />
      )}

      {selection.length > 0 && (
        <p className="no-print" style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {selection.length === 1 ? (
            <span>{selection[0].nom} sélectionné(e) — cliquez un second élève de la même discipline pour les intervertir.</span>
          ) : (
            <>
              <span>
                Intervertir <strong>{selection[0].nom}</strong> et <strong>{selection[1].nom}</strong> ?
              </span>
              <button onClick={intervertir} disabled={actionEnCours !== null}>
                {actionEnCours === "intervertir" ? "Interversion…" : "Confirmer l'interversion"}
              </button>
            </>
          )}
          <button className="discret" onClick={() => setSelection([])}>
            Annuler la sélection
          </button>
        </p>
      )}

      {/* Vue écran : regroupée par jour, éditable (modifier un créneau,
          sélectionner deux élèves à intervertir), disciplines dans l'ordre
          alphabétique habituel. Masquée à l'impression — voir
          .vue-impression juste en dessous, qui la remplace sur papier avec
          les langues vivantes de chaque jour regroupées en tête. */}
      <div className="no-print">
      {Object.entries(parJour).map(([jour, liste]) => (
        <div key={jour} className="jour-planning">
          <p className="jour-titre">
            <span className="print-only">{classeNom} · Semaine {semaine} — </span>
            {new Date(jour).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" })}
          </p>
          <table>
            <thead>
              <tr>
                <th>Discipline</th>
                <th>Étudiants</th>
                <th>Préparation</th>
                <th>Khôlle</th>
                <th>Kholleur</th>
                <th>Salle</th>
                <th className="no-print"></th>
              </tr>
            </thead>
            <tbody>
              {liste.map((c, index) => {
                // Sépare visuellement les créneaux d'un kholleur à l'autre
                // (voir .ligne-nouveau-kholleur dans globals.css) : jamais
                // sur la toute première ligne du jour, qui n'a rien à
                // séparer d'une ligne précédente.
                const nouveauKholleur = index > 0 && liste[index - 1].kholleurId !== c.kholleurId;
                const classeLigne = nouveauKholleur ? "ligne-nouveau-kholleur" : undefined;
                return enEdition === c.id ? (
                  <LigneEdition
                    key={c.id}
                    creneau={c}
                    kholleurs={kholleurs}
                    salles={salles}
                    className={classeLigne}
                    onAnnuler={() => setEnEdition(null)}
                    onSauvegarder={(champs) => sauvegarderEdition(c.id, champs)}
                  />
                ) : (
                  <tr key={c.id} className={classeLigne}>
                    <td>{c.discipline}</td>
                    <td>
                      {c.eleves.map((e, i) => (
                        <span key={e.passageId}>
                          {i > 0 && ", "}
                          {c.sessionCloturee ? (
                            e.nom
                          ) : (
                            <button
                              type="button"
                              className={`eleve-nom no-print${selection.some((s) => s.passageId === e.passageId) ? " eleve-nom-selectionne" : ""}`}
                              onClick={() => basculerSelection(e)}
                              title="Cliquer pour sélectionner en vue d'une interversion"
                            >
                              {e.nom}
                            </button>
                          )}
                          {c.sessionCloturee ? null : <span className="print-only">{e.nom}</span>}
                        </span>
                      ))}
                    </td>
                    <td className="cellule-horaire">{c.heureDebutPreparation ?? "—"}</td>
                    <td className="cellule-horaire">
                      {c.heureDebut}-{c.heureFin}
                    </td>
                    <td>{c.kholleurNom}</td>
                    <td>{c.salleNom}</td>
                    <td className="no-print">
                      {!c.sessionCloturee && (
                        <button className="discret" onClick={() => setEnEdition(c.id)}>
                          Modifier
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {dispensesParDiscipline.length > 0 && (
        <div className="jour-planning">
          <p className="jour-titre">Étudiants dispensés</p>
          <ul>
            {dispensesParDiscipline.map(({ discipline, eleves }) => (
              <li key={discipline}>
                {discipline} — {eleves.join(", ")} dispensé(e)s
              </li>
            ))}
          </ul>
        </div>
      )}
      </div>

      {/* Vue impression : une page par jour, comme la vue écran, mais avec
          les langues vivantes de ce jour regroupées en tête (voir
          parJourImpression et .vue-impression dans globals.css, masquée à
          l'écran). Statique (pas de bouton Modifier/interversion),
          contrairement à la vue écran ci-dessus. */}
      <div className="vue-impression">
        {Object.entries(parJourImpression).map(([jour, liste]) => (
          <div key={jour} className="page-impression">
            <p className="jour-titre">
              {classeNom} · Semaine {semaine} —{" "}
              {new Date(jour).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" })}
            </p>
            <TableImpression creneaux={liste} />
          </div>
        ))}
        {dispensesParDiscipline.length > 0 && (
          <div className="page-impression">
            <p className="jour-titre">Étudiants dispensés</p>
            <ul>
              {dispensesParDiscipline.map(({ discipline, eleves }) => (
                <li key={discipline}>
                  {discipline} — {eleves.join(", ")} dispensé(e)s
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {erreur && <p className="champ-erreur no-print">{erreur}</p>}

      <p className="no-print" style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center" }}>
        {estBrouillon && (
          <button className="discret" onClick={annuler} disabled={actionEnCours !== null}>
            {actionEnCours === "annuler" ? "Suppression…" : "Annuler"}
          </button>
        )}
        <Link href={`/admin/planification?classeId=${classeId}&date=${dateDebutSemaine}`}>
          <button type="button" className="secondaire">
            Régénérer
          </button>
        </Link>
        {estBrouillon && (
          <button onClick={publier} disabled={actionEnCours !== null}>
            {actionEnCours === "publier" ? "Publication…" : "Publier le planning"}
          </button>
        )}
        <button
          type="button"
          className="secondaire"
          onClick={() => setModalKholleursOuvert(true)}
          disabled={estBrouillon}
          title={estBrouillon ? "Planning encore en brouillon : publiez-le d'abord" : undefined}
        >
          Renvoyer planning aux kholleurs
        </button>
        <button
          type="button"
          className="secondaire"
          onClick={() => setModalElevesOuvert(true)}
          disabled={estBrouillon}
          title={estBrouillon ? "Planning encore en brouillon : publiez-le d'abord" : undefined}
        >
          Renvoyer convocation aux étudiants
        </button>
        <button
          type="button"
          className="secondaire"
          onClick={renvoyerValidationReferents}
          disabled={actionEnCours !== null || estBrouillon}
          title={estBrouillon ? "Planning encore en brouillon : publiez-le d'abord" : undefined}
        >
          {actionEnCours === "renvoyer-referents" ? "Envoi…" : "Renvoyer validation au professeur référent"}
        </button>
        <button type="button" className="secondaire" onClick={() => window.print()}>
          Imprimer
        </button>
      </p>
      {info && <p className="no-print badge badge-succes">{info}</p>}
      {!estBrouillon && (
        <p className="champ-erreur no-print">
          Ce planning est déjà publié. Le régénérer remplacera les créneaux actuels et repassera la
          session en brouillon — pensez à republier ensuite, et notez que les notes déjà saisies pour
          ces créneaux seraient perdues.
        </p>
      )}
    </div>
  );
}

// Table statique utilisée par la vue impression (.vue-impression) : pas de
// bouton Modifier ni de sélection pour intervertir, contrairement à la vue
// écran — une page imprimée n'a rien d'interactif. Colonne "Jour" en plus
// (inutile sur la vue écran, où le jour est déjà le titre de chaque bloc) :
// ici une page peut mélanger plusieurs jours (langues vivantes) ou plusieurs
// kholleurs d'un même jour (discipline non-langue).
function TableImpression({ creneaux }: { creneaux: Creneau[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Discipline</th>
          <th>Étudiants</th>
          <th>Préparation</th>
          <th>Khôlle</th>
          <th>Kholleur</th>
          <th>Salle</th>
        </tr>
      </thead>
      <tbody>
        {creneaux.map((c, index) => {
          // Changement de discipline : deux cas bien distincts.
          // - Vers une AUTRE langue vivante (les langues sont toujours
          //   regroupées en tête, voir parJourImpression — jamais après une
          //   discipline non-langue) : simple trait noir fin, comme un
          //   changement de kholleur, toutes les langues restant dans le
          //   même tableau sans être redécoupées en blocs.
          // - Vers une discipline qui n'est PAS une langue (fin du bloc des
          //   langues, ou passage à une discipline non-langue suivante) :
          //   2 lignes vierges puis une répétition de l'entête du tableau,
          //   pour bien détacher visuellement les blocs sans avoir à relire
          //   la première page pour retrouver les colonnes.
          // Changement de kholleur SANS changement de discipline : simple
          // trait noir fin, comme pour un changement de langue. Jamais rien
          // avant la toute première ligne, qui n'a rien à séparer d'une
          // ligne précédente (precedent === null).
          const precedent = index > 0 ? creneaux[index - 1] : null;
          const nouvelleDiscipline = precedent !== null && precedent.discipline !== c.discipline;
          const nouvelleLangue = nouvelleDiscipline && c.estLangueVivante;
          const nouvelleDisciplineNonLangue = nouvelleDiscipline && !c.estLangueVivante;
          const nouveauKholleur = precedent !== null && !nouvelleDiscipline && precedent.kholleurId !== c.kholleurId;
          const classeLigne = nouveauKholleur || nouvelleLangue ? "ligne-nouveau-kholleur-impression" : undefined;
          return (
            <Fragment key={c.id}>
              {nouvelleDisciplineNonLangue && (
                <>
                  <tr className="ligne-vide-impression">
                    <td colSpan={6}></td>
                  </tr>
                  <tr className="ligne-vide-impression">
                    <td colSpan={6}></td>
                  </tr>
                  <tr>
                    <th>Discipline</th>
                    <th>Étudiants</th>
                    <th>Préparation</th>
                    <th>Khôlle</th>
                    <th>Kholleur</th>
                    <th>Salle</th>
                  </tr>
                </>
              )}
              <tr className={classeLigne}>
                <td>{c.discipline}</td>
                <td>{c.eleves.map((e) => e.nom).join(", ")}</td>
                <td className="cellule-horaire">{c.heureDebutPreparation ?? "—"}</td>
                <td className="cellule-horaire">
                  {c.heureDebut}-{c.heureFin}
                </td>
                <td>{c.kholleurNom}</td>
                <td>{c.salleNom}</td>
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function LigneEdition({
  creneau,
  kholleurs,
  salles,
  className,
  onAnnuler,
  onSauvegarder,
}: {
  creneau: Creneau;
  kholleurs: Option[];
  salles: Option[];
  className?: string;
  onAnnuler: () => void;
  onSauvegarder: (champs: Partial<Creneau>) => void;
}) {
  const [heureDebut, setHeureDebut] = useState(creneau.heureDebut);
  const [heureFin, setHeureFin] = useState(creneau.heureFin);
  const [kholleurId, setKholleurId] = useState(creneau.kholleurId);
  const [salleId, setSalleId] = useState(creneau.salleId);
  const [heureDebutPreparation, setHeureDebutPreparation] = useState(creneau.heureDebutPreparation ?? "");
  // Distingue "l'admin a explicitement choisi cette heure de préparation" de
  // "le champ affiche juste l'ancienne valeur, à recalculer côté serveur si
  // l'heure de khôlle change" (voir sauvegarderEdition ci-dessus).
  const [prepModifieeManuel, setPrepModifieeManuel] = useState(false);

  return (
    <tr className={className}>
      <td>{creneau.discipline}</td>
      <td>{creneau.eleves.map((e) => e.nom).join(", ")}</td>
      <td>
        <input
          value={heureDebutPreparation}
          onChange={(e) => {
            setHeureDebutPreparation(e.target.value);
            setPrepModifieeManuel(true);
          }}
          style={{ width: 60 }}
        />
      </td>
      <td style={{ display: "flex", gap: 4 }}>
        <input value={heureDebut} onChange={(e) => setHeureDebut(e.target.value)} style={{ width: 60 }} />
        <input value={heureFin} onChange={(e) => setHeureFin(e.target.value)} style={{ width: 60 }} />
      </td>
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
      <td style={{ display: "flex", gap: 6 }}>
        <button
          onClick={() =>
            onSauvegarder({
              heureDebut,
              heureFin,
              kholleurId,
              salleId,
              heureDebutPreparation: prepModifieeManuel ? heureDebutPreparation : undefined,
            })
          }
        >
          OK
        </button>
        <button className="discret" onClick={onAnnuler}>
          Annuler
        </button>
      </td>
    </tr>
  );
}
