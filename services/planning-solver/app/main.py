from typing import Any

import httpx
from fastapi import BackgroundTasks, FastAPI
from pydantic import BaseModel

from app.solver import resoudre

app = FastAPI(title="PrepaStan - Planning Solver")


class SolveRequest(BaseModel):
    jobId: str
    classeId: str
    semaine: int
    eleves: list[dict[str, Any]]
    disponibilites: list[dict[str, Any]]
    competences: list[dict[str, Any]]
    salles: list[dict[str, Any]]
    callbackUrl: str
    callbackSecret: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/solve", status_code=202)
async def solve(payload: SolveRequest, background_tasks: BackgroundTasks) -> dict[str, str]:
    background_tasks.add_task(_solve_and_callback, payload)
    return {"jobId": payload.jobId, "statut": "EN_COURS"}


async def _solve_and_callback(payload: SolveRequest) -> None:
    disciplines_semaine = sorted({c["disciplineId"] for c in payload.competences})

    result = resoudre(
        eleves=payload.eleves,
        disponibilites=payload.disponibilites,
        competences=payload.competences,
        salles=payload.salles,
        disciplines_semaine=disciplines_semaine,
    )

    if result.statut == "SUCCES":
        body = {
            "jobId": payload.jobId,
            "statut": "SUCCES",
            "classeId": payload.classeId,
            "semaine": payload.semaine,
            "creneaux": result.creneaux,
        }
    else:
        body = {"jobId": payload.jobId, "statut": result.statut, "message": result.message}

    async with httpx.AsyncClient() as client:
        await client.post(
            payload.callbackUrl,
            json=body,
            headers={"x-callback-secret": payload.callbackSecret},
            timeout=30.0,
        )
