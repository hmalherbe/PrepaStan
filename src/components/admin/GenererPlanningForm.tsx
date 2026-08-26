"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type Kholleur = { id: string; nom: string };
type Discipline = { id: string; nom: string; kholleurs: Kholleur[] };
type Classe = { id: string; nom: string; effectif: number; disciplines: Discipline[] };

type Quota = {
  cle: string; // clé locale stable pour React, sans rapport avec les données envoyées
  jourSemaine: number;
  disciplineId: string;
  kholleurId: string;
  nombreEleves: number;
};

const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

let compteurCle = 0;
function nouvelleCle() {
  compteurCle += 1;
  return `q${compteurCle}`;
}

export function GenererPlanningForm({
  classes,
  classeIdInitiale,
  semaineInitiale,
}: {
  classes: Classe[];
  classeIdInitiale?: string;
  semaineInitiale?: number;
}) {
  const router = useRouter();

  const [classeId, setClasseId] = useState(classeIdInitiale ?? classes[0]?.id ?? "");
  const [semaine, setSemaine] = useState(semaineInitiale ?? 1);
  const [dateDebutSemaine, setDateDebutSemaine] = useState("");
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [statutJob, setStatutJob] = useState<string | null>(null);
  const [messageJob, setMessageJob] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const classe = classes.find((c) => c.id === classeId);
  const disciplines = classe?.disciplines ?? [];

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Changer de classe invalide les disciplines/kholleurs déjà choisis.
  function changerClasse(id: string) {
    setClasseId(id);
    setQuotas([]);
  }

  function ajouterQuota() {
    const premiereDiscipline = disciplines[0];
    setQuotas((prev) => [
      ...prev,
      {
        cle: nouvelleCle(),
        jourSemaine: 1,
        disciplineId: premiereDiscipline?.id ?? "",
        kholleurId: premiereDiscipline?.kholleurs[0]?.id ?? "",
        nombreEleves: 1,
      },
    ]);
  }

  function modifierQuota(cle: string, patch: Partial<Quota>) {
    setQuotas((prev) => prev.map((q) => (q.cle === cle ? { ...q, ...patch } : q)));
  }

  function retirerQuota(cle: string) {
    setQuotas((prev) => prev.filter((q) => q.cle !== cle));
  }

  const recap = useMemo(() => {
    const totaux = new Map<string, number>();
    for (const q of quotas) {
      totaux.set(q.disciplineId, (totaux.get(q.disciplineId) ?? 0) + q.nombreEleves);
    }
    return [...totaux.entries()].map(([disciplineId, total]) => ({
      disciplineId,
      nom: disciplines.find((d) => d.id === disciplineId)?.nom ?? disciplineId,
      total,
      ok: classe ? total === classe.effectif : false,
    }));
  }, [quotas, disciplines, classe]);

  const quotasIncomplets = quotas.some((q) => !q.disciplineId || !q.kholleurId || q.nombreEleves < 1);
  const effectifsOk = recap.length > 0 && recap.every((r) => r.ok);
  const formulaireValide =
    !!classeId && !!dateDebutSemaine && quotas.length > 0 && !quotasIncomplets && effectifsOk;

  async function lancer() {
    setStatutJob("EN_COURS");
    setMessageJob(null);

    const res = await fetch("/api/admin/planification/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classeId,
        semaine,
        dateDebutSemaine,
        quotas: quotas.map((q) => ({
          jourSemaine: q.jourSemaine,
          disciplineId: q.disciplineId,
          kholleurId: q.kholleurId,
          nombreEleves: q.nombreEleves,
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatutJob("ECHEC");
      setMessageJob(data.error ?? "Erreur lors du lancement");
      return;
    }

    setJobId(data.jobId);
    let tentatives = 0;
    const MAX_TENTATIVES = 45; // 45 x 2s = 90s avant d'abandonner le polling

    intervalRef.current = setInterval(async () => {
      tentatives += 1;
      const pollRes = await fetch(`/api/admin/planification/jobs/${data.jobId}`);
      const job = await pollRes.json();
      setStatutJob(job.statut);
      if (job.statut === "SUCCES") {
        if (intervalRef.current) clearInterval(intervalRef.current);
        router.push(`/admin/planification/${classeId}/${semaine}`);
      } else if (job.statut === "INFAISABLE" || job.statut === "ECHEC") {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setMessageJob(job.message);
      } else if (tentatives >= MAX_TENTATIVES) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setStatutJob("ECHEC");
        setMessageJob(
          "Toujours en cours après 90s, ce qui n'est pas normal — vérifiez que le microservice OR-Tools " +
            "(services/planning-solver, uvicorn app.main:app --port 8001) est bien lancé et accessible."
        );
      }
    }, 2000);
  }

  const enCours = statutJob === "EN_COURS";

  return (
    <div className="carte">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          lancer();
        }}
      >
        <label>
          Classe
          <select value={classeId} onChange={(e) => changerClasse(e.target.value)} disabled={enCours}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom} ({c.effectif} élèves)
              </option>
            ))}
          </select>
        </label>

        <label>
          Semaine
          <input
            type="number"
            min={1}
            value={semaine}
            onChange={(e) => setSemaine(Number(e.target.value))}
            disabled={enCours}
          />
        </label>

        <label>
          Lundi de la semaine à planifier
          <input
            type="date"
            value={dateDebutSemaine}
            onChange={(e) => setDateDebutSemaine(e.target.value)}
            disabled={enCours}
            required
          />
        </label>

        <p style={{ marginTop: 16 }}>
          Quotas par jour / discipline / kholleur — pour chaque ligne, OR-Tools choisira
          quels élèves précis et à quel horaire remplissent le quota.
        </p>

        {disciplines.length === 0 && classe && (
          <p className="champ-erreur">Aucune discipline n&apos;est assignée à cette classe.</p>
        )}

        <table className="table">
          <thead>
            <tr>
              <th>Jour</th>
              <th>Discipline</th>
              <th>Kholleur</th>
              <th>Nb élèves</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {quotas.map((q) => {
              const discipline = disciplines.find((d) => d.id === q.disciplineId);
              const kholleurs = discipline?.kholleurs ?? [];
              return (
                <tr key={q.cle}>
                  <td>
                    <select
                      value={q.jourSemaine}
                      onChange={(e) => modifierQuota(q.cle, { jourSemaine: Number(e.target.value) })}
                      disabled={enCours}
                    >
                      {JOURS.map((nom, idx) => (
                        <option key={nom} value={idx + 1}>
                          {nom}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={q.disciplineId}
                      onChange={(e) => {
                        const nouvelleDiscipline = disciplines.find((d) => d.id === e.target.value);
                        modifierQuota(q.cle, {
                          disciplineId: e.target.value,
                          kholleurId: nouvelleDiscipline?.kholleurs[0]?.id ?? "",
                        });
                      }}
                      disabled={enCours}
                    >
                      <option value="" disabled>
                        —
                      </option>
                      {disciplines.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.nom}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={q.kholleurId}
                      onChange={(e) => modifierQuota(q.cle, { kholleurId: e.target.value })}
                      disabled={enCours || kholleurs.length === 0}
                    >
                      <option value="" disabled>
                        —
                      </option>
                      {kholleurs.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.nom}
                        </option>
                      ))}
                    </select>
                    {discipline && kholleurs.length === 0 && (
                      <span className="champ-erreur">Aucun kholleur compétent</span>
                    )}
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      value={q.nombreEleves}
                      onChange={(e) => modifierQuota(q.cle, { nombreEleves: Number(e.target.value) })}
                      disabled={enCours}
                      style={{ width: 70 }}
                    />
                  </td>
                  <td>
                    <button type="button" onClick={() => retirerQuota(q.cle)} disabled={enCours}>
                      Retirer
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <p>
          <button type="button" onClick={ajouterQuota} disabled={enCours || disciplines.length === 0}>
            + Ajouter une ligne
          </button>
        </p>

        {recap.length > 0 && (
          <>
            <p style={{ marginTop: 16 }}>Récapitulatif par discipline :</p>
            <table className="table">
              <thead>
                <tr>
                  <th>Discipline</th>
                  <th>Total élèves affectés</th>
                  <th>Effectif de la classe</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recap.map((r) => (
                  <tr key={r.disciplineId}>
                    <td>{r.nom}</td>
                    <td>{r.total}</td>
                    <td>{classe?.effectif}</td>
                    <td>
                      <span className={`badge ${r.ok ? "badge-succes" : "badge-attente"}`}>
                        {r.ok ? "✓" : "✗"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <p style={{ marginTop: 16 }}>
          <button type="submit" disabled={enCours || !formulaireValide}>
            {enCours ? "Calcul en cours…" : "Générer le planning"}
          </button>
        </p>
      </form>

      {statutJob && statutJob !== "SUCCES" && (
        <p className={statutJob === "EN_COURS" ? "badge badge-attente" : "champ-erreur"}>
          {statutJob === "EN_COURS" && "Calcul en cours (job " + jobId + ")…"}
          {statutJob === "INFAISABLE" && `Impossible : ${messageJob}`}
          {statutJob === "ECHEC" && `Erreur : ${messageJob}`}
        </p>
      )}
    </div>
  );
}
