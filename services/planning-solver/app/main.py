import logging
from typing import Any

import httpx
from fastapi import BackgroundTasks, FastAPI
from pydantic import BaseModel

from app.solver import resoudre

app = FastAPI(title="PrepaStan - Planning Solver")
logger = logging.getLogger("prepastan.planning-solver")


class Historique(BaseModel):
    # Clé "eleveId|disciplineId|kholleurId" -> nombre de fois déjà eu.
    eleveKholleur: dict[str, int] = {}
    # kholleurId -> nombre de créneaux déjà assignés, toutes classes/semaines
    # publiées confondues.
    chargeKholleur: dict[str, int] = {}
    # eleveId -> nombre de fois déjà affecté à un créneau tardif.
    tardifEleve: dict[str, int] = {}


class SolveRequest(BaseModel):
    jobId: str
    classeId: str
    semaine: int
    dateDebutSemaine: str
    eleves: list[dict[str, Any]]
    disponibilites: list[dict[str, Any]]
    competences: list[dict[str, Any]]
    salles: list[dict[str, Any]]
    # Quotas fixés par l'admin : [{date, disciplineId, kholleurId, nombreEleves}].
    # OR-Tools choisit quels élèves précis et à quel horaire remplissent
    # chaque quota (voir resoudre() dans solver.py).
    quotas: list[dict[str, Any]] = []
    historique: Historique = Historique()
    callbackUrl: str
    callbackSecret: str


@app.get("/health")
def health() -> dict[str, str]:
    print(">>> /health appelé", flush=True)
    return {"status": "ok"}


@app.post("/solve", status_code=202)
async def solve(payload: SolveRequest, background_tasks: BackgroundTasks) -> dict[str, str]:
    print(f">>> /solve appelé, jobId={payload.jobId}", flush=True)
    background_tasks.add_task(_solve_and_callback, payload)
    return {"jobId": payload.jobId, "statut": "EN_COURS"}


async def _solve_and_callback(payload: SolveRequest) -> None:
    # Cette fonction tourne en tâche de fond FastAPI : une exception ici ne
    # remonte nulle part côté client, elle finit juste dans les logs du
    # process — d'où le try/except explicite pour au moins la rendre visible
    # au lieu de laisser le job appelant bloqué indéfiniment sur EN_COURS.
    print(f">>> _solve_and_callback démarré pour {payload.jobId}", flush=True)
    try:
        disciplines_semaine = sorted({q["disciplineId"] for q in payload.quotas})
        print(f">>> disciplines_semaine={disciplines_semaine}", flush=True)

        result = resoudre(
            eleves=payload.eleves,
            disponibilites=payload.disponibilites,
            competences=payload.competences,
            salles=payload.salles,
            disciplines_semaine=disciplines_semaine,
            quotas=payload.quotas,
            historique_eleve_kholleur=payload.historique.eleveKholleur,
            historique_charge_kholleur=payload.historique.chargeKholleur,
            historique_tardif_eleve=payload.historique.tardifEleve,
        )
        print(f">>> resoudre() terminé, statut={result.statut}, message={result.message}", flush=True)

        if result.statut == "SUCCES":
            body = {
                "jobId": payload.jobId,
                "statut": "SUCCES",
                "classeId": payload.classeId,
                "semaine": payload.semaine,
                "dateDebutSemaine": payload.dateDebutSemaine,
                "creneaux": result.creneaux,
            }
        else:
            body = {"jobId": payload.jobId, "statut": result.statut, "message": result.message}
    except Exception as e:
        print(f">>> EXCEPTION pendant le calcul : {e!r}", flush=True)
        logger.exception("Échec du calcul pour le job %s", payload.jobId)
        body = {
            "jobId": payload.jobId,
            "statut": "ECHEC",
            "message": "Erreur interne du solveur, voir les logs du microservice.",
        }

    print(f">>> Appel du callback {payload.callbackUrl}", flush=True)
    try:
        async with httpx.AsyncClient() as client:
            reponse = await client.post(
                payload.callbackUrl,
                json=body,
                headers={"x-callback-secret": payload.callbackSecret},
                timeout=30.0,
            )
        print(f">>> Callback répondu : {reponse.status_code} {reponse.text}", flush=True)
        if reponse.status_code >= 400:
            logger.error(
                "Callback refusé par %s pour le job %s : %s %s",
                payload.callbackUrl,
                payload.jobId,
                reponse.status_code,
                reponse.text,
            )
    except httpx.HTTPError as e:
        print(f">>> EXCEPTION en appelant le callback : {e!r}", flush=True)
        logger.exception(
            "Impossible d'appeler le callback %s pour le job %s (job resté EN_COURS côté app)",
            payload.callbackUrl,
            payload.jobId,
        )
