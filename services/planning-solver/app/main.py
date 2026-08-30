import logging
from typing import Any

import httpx
from fastapi import BackgroundTasks, FastAPI
from pydantic import BaseModel

from app.solver import resoudre

app = FastAPI(title="PrepaStan - Planning Solver")
logger = logging.getLogger("prepastan.planning-solver")
logger.setLevel(logging.INFO)


class Historique(BaseModel):
    # Clé "eleveId|disciplineId|kholleurId" -> nombre de fois déjà eu.
    eleveKholleur: dict[str, int] = {}
    # kholleurId -> nombre de créneaux déjà assignés, toutes classes/semaines
    # publiées confondues.
    chargeKholleur: dict[str, int] = {}
    # eleveId -> nombre de fois déjà affecté à un créneau tardif.
    tardifEleve: dict[str, int] = {}
    # eleveId -> "LV1" ou "LV2" selon la langue de son dernier passage en
    # langue vivante (toutes disciplines langues confondues) ; alimente
    # l'objectif d'alternance LV1/LV2 (voir solver.py).
    derniereLangue: dict[str, str] = {}


class SolveRequest(BaseModel):
    jobId: str
    classeId: str
    semaine: int
    dateDebutSemaine: str
    eleves: list[dict[str, Any]]
    # Quotas fixés par l'admin : chacun fixe déjà tout sauf les élèves —
    # [{date, disciplineId, kholleurId, salleId, heureDebut, nombreEleves}].
    # OR-Tools choisit uniquement quels élèves précis remplissent chaque
    # quota, dans l'ordre des créneaux qui en découlent (voir resoudre() dans
    # solver.py).
    quotas: list[dict[str, Any]]
    historique: Historique = Historique()
    # Sous-ensemble des disciplines de la semaine marquées "langue vivante" :
    # active l'éligibilité LV1/LV2 par élève et l'objectif d'alternance dans
    # resoudre() (voir sa docstring). Vide par défaut = comportement inchangé.
    disciplinesLangue: list[str] = []
    # Relâche "chaque élève passe exactement une fois par discipline" en "au
    # plus une fois" — sert à rejouer un historique où le total des quotas
    # d'une discipline ne correspond pas exactement à l'effectif de la classe
    # (voir la docstring de resoudre() dans solver.py). False par défaut :
    # comportement inchangé pour une planification normale.
    effectifPartiel: bool = False
    callbackUrl: str
    callbackSecret: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/solve", status_code=202)
async def solve(payload: SolveRequest, background_tasks: BackgroundTasks) -> dict[str, str]:
    logger.info("Job %s reçu (classe=%s, semaine=%s)", payload.jobId, payload.classeId, payload.semaine)
    background_tasks.add_task(_solve_and_callback, payload)
    return {"jobId": payload.jobId, "statut": "EN_COURS"}


async def _solve_and_callback(payload: SolveRequest) -> None:
    # Cette fonction tourne en tâche de fond FastAPI : une exception ici ne
    # remonte nulle part côté client, elle finit juste dans les logs du
    # process — d'où le try/except explicite pour au moins la rendre visible
    # au lieu de laisser le job appelant bloqué indéfiniment sur EN_COURS.
    try:
        result = resoudre(
            eleves=payload.eleves,
            quotas=payload.quotas,
            historique_eleve_kholleur=payload.historique.eleveKholleur,
            historique_charge_kholleur=payload.historique.chargeKholleur,
            historique_tardif_eleve=payload.historique.tardifEleve,
            disciplines_langue=set(payload.disciplinesLangue),
            historique_derniere_langue=payload.historique.derniereLangue,
            effectif_partiel=payload.effectifPartiel,
        )
        logger.info("Job %s résolu : statut=%s", payload.jobId, result.statut)

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
    except Exception:
        logger.exception("Échec du calcul pour le job %s", payload.jobId)
        body = {
            "jobId": payload.jobId,
            "statut": "ECHEC",
            "message": "Erreur interne du solveur, voir les logs du microservice.",
        }

    try:
        async with httpx.AsyncClient() as client:
            reponse = await client.post(
                payload.callbackUrl,
                json=body,
                headers={"x-callback-secret": payload.callbackSecret},
                timeout=30.0,
            )
        if reponse.status_code >= 400:
            logger.error(
                "Callback refusé par %s pour le job %s : %s %s",
                payload.callbackUrl,
                payload.jobId,
                reponse.status_code,
                reponse.text,
            )
    except httpx.HTTPError:
        logger.exception(
            "Impossible d'appeler le callback %s pour le job %s (job resté EN_COURS côté app)",
            payload.callbackUrl,
            payload.jobId,
        )
