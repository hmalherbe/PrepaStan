"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Discipline = { id: string; nom: string; kholleursTotal: number; kholleursAvecDispo: number };
type Classe = { id: string; nom: string };

export function GenererPlanningForm({
  classes,
  disciplines,
  classeIdInitiale,
  semaineInitiale,
}: {
  classes: Classe[];
  disciplines: Discipline[];
  classeIdInitiale?: string;
  semaineInitiale?: number;
}) {
  const router = useRouter();

  const [classeId, setClasseId] = useState(classeIdInitiale ?? classes[0]?.id ?? "");
  const [semaine, setSemaine] = useState(semaineInitiale ?? 1);
  const [dateDebutSemaine, setDateDebutSemaine] = useState("");
  const [disciplineIds, setDisciplineIds] = useState<string[]>(
    disciplines.filter((d) => d.kholleursTotal > 0 && d.kholleursAvecDispo === d.kholleursTotal).map((d) => d.id)
  );
  const [jobId, setJobId] = useState<string | null>(null);
  const [statutJob, setStatutJob] = useState<string | null>(null);
  const [messageJob, setMessageJob] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function toggleDiscipline(id: string) {
    setDisciplineIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  }

  async function lancer() {
    setStatutJob("EN_COURS");
    setMessageJob(null);

    const res = await fetch("/api/admin/planification/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classeId, semaine, disciplineIds, dateDebutSemaine }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatutJob("ECHEC");
      setMessageJob(data.error ?? "Erreur lors du lancement");
      return;
    }

    setJobId(data.jobId);
    intervalRef.current = setInterval(async () => {
      const pollRes = await fetch(`/api/admin/planification/jobs/${data.jobId}`);
      const job = await pollRes.json();
      setStatutJob(job.statut);
      if (job.statut === "SUCCES") {
        if (intervalRef.current) clearInterval(intervalRef.current);
        router.push(`/admin/planification/${classeId}/${semaine}`);
      } else if (job.statut === "INFAISABLE" || job.statut === "ECHEC") {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setMessageJob(job.message);
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
          <select value={classeId} onChange={(e) => setClasseId(e.target.value)} disabled={enCours}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
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

        <p>Disciplines à planifier cette semaine :</p>
        {disciplines.map((d) => (
          <label key={d.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={disciplineIds.includes(d.id)}
              onChange={() => toggleDiscipline(d.id)}
              disabled={enCours}
            />
            {d.nom}
            <span
              className={`badge ${d.kholleursTotal > 0 && d.kholleursAvecDispo === d.kholleursTotal ? "badge-succes" : "badge-attente"}`}
            >
              Dispos {d.kholleursAvecDispo}/{d.kholleursTotal}
            </span>
          </label>
        ))}

        <p style={{ marginTop: 16 }}>
          <button type="submit" disabled={enCours || disciplineIds.length === 0 || !classeId || !dateDebutSemaine}>
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
