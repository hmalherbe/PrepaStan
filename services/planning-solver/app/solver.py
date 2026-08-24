"""Génération du planning de khôlles sous contraintes avec OR-Tools CP-SAT.

Un élève ne pouvant pas avoir deux khôlles en même temps, y compris entre
disciplines différentes, la résolution porte sur toute la semaine d'une
classe (toutes disciplines demandées confondues) en une seule fois.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from ortools.sat.python import cp_model


@dataclass
class Slot:
    kholleur_id: str
    discipline_id: str
    salle_id: str
    jour: str  # date ISO "YYYY-MM-DD"
    debut_minutes: int
    fin_minutes: int


@dataclass
class SolveResult:
    statut: str  # "SUCCES" | "INFAISABLE"
    creneaux: list[dict] | None = None
    message: str | None = None


def _minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def generer_slots_candidats(
    disponibilites: list[dict],
    competences: list[dict],
    salles: list[dict],
    duree_creneau_minutes: int,
) -> list[Slot]:
    """Découpe chaque disponibilité de kholleur en créneaux candidats d'une
    durée fixe, croisés avec les disciplines qu'il peut kholler et les
    salles disponibles."""
    comp_par_kholleur: dict[str, list[str]] = {}
    for c in competences:
        comp_par_kholleur.setdefault(c["kholleurId"], []).append(c["disciplineId"])

    slots: list[Slot] = []
    for dispo in disponibilites:
        disciplines = comp_par_kholleur.get(dispo["kholleurId"], [])
        debut = _minutes(dispo["heureDebut"])
        fin = _minutes(dispo["heureFin"])
        jour = dispo.get("date", "")[:10]

        t = debut
        while t + duree_creneau_minutes <= fin:
            for discipline_id in disciplines:
                for salle in salles:
                    slots.append(
                        Slot(
                            kholleur_id=dispo["kholleurId"],
                            discipline_id=discipline_id,
                            salle_id=salle["id"],
                            jour=jour,
                            debut_minutes=t,
                            fin_minutes=t + duree_creneau_minutes,
                        )
                    )
            t += duree_creneau_minutes

    return slots


def resoudre(
    eleves: list[dict],
    disponibilites: list[dict],
    competences: list[dict],
    salles: list[dict],
    disciplines_semaine: list[str],
    max_temps_secondes: float = 30.0,
    duree_creneau_minutes: int = 20,
) -> SolveResult:
    slots = generer_slots_candidats(disponibilites, competences, salles, duree_creneau_minutes)
    if not slots:
        return SolveResult(statut="INFAISABLE", message="Aucun créneau candidat : vérifier les disponibilités et compétences saisies.")

    model = cp_model.CpModel()

    presence: dict[tuple[str, int], cp_model.IntVar] = {}
    intervals_eleve: dict[str, list[cp_model.IntervalVar]] = {e["id"]: [] for e in eleves}
    intervals_kholleur: dict[str, list[cp_model.IntervalVar]] = {}
    intervals_salle: dict[str, list[cp_model.IntervalVar]] = {}

    for e in eleves:
        for s_idx, slot in enumerate(slots):
            if slot.discipline_id not in disciplines_semaine:
                continue
            key = (e["id"], s_idx)
            b = model.NewBoolVar(f"x_{e['id']}_{s_idx}")
            presence[key] = b

            offset = _jour_offset_minutes(slot.jour)
            iv = model.NewOptionalIntervalVar(
                offset + slot.debut_minutes,
                slot.fin_minutes - slot.debut_minutes,
                offset + slot.fin_minutes,
                b,
                f"iv_{e['id']}_{s_idx}",
            )
            intervals_eleve[e["id"]].append(iv)
            intervals_kholleur.setdefault(slot.kholleur_id, []).append(iv)
            intervals_salle.setdefault(slot.salle_id, []).append(iv)

    for ivs in intervals_eleve.values():
        model.AddNoOverlap(ivs)
    for ivs in intervals_kholleur.values():
        model.AddNoOverlap(ivs)
    for ivs in intervals_salle.values():
        model.AddNoOverlap(ivs)

    # Chaque élève passe exactement une fois par discipline demandée cette semaine.
    for e in eleves:
        for discipline_id in disciplines_semaine:
            vars_ed = [
                presence[(e["id"], s_idx)]
                for s_idx, slot in enumerate(slots)
                if slot.discipline_id == discipline_id and (e["id"], s_idx) in presence
            ]
            if not vars_ed:
                return SolveResult(
                    statut="INFAISABLE",
                    message=f"Aucun créneau disponible pour la discipline {discipline_id}.",
                )
            model.Add(sum(vars_ed) == 1)

    # Objectif : équilibrer la charge entre kholleurs.
    charge_max = model.NewIntVar(0, len(eleves) * len(disciplines_semaine), "charge_max")
    for kholleur_id, ivs in intervals_kholleur.items():
        vars_k = [presence[key] for key in presence if slots[key[1]].kholleur_id == kholleur_id]
        model.Add(charge_max >= sum(vars_k))
    model.Minimize(charge_max)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max_temps_secondes
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return SolveResult(
            statut="INFAISABLE",
            message="Impossible de satisfaire toutes les contraintes avec les disponibilités actuelles.",
        )

    par_creneau: dict[tuple, list[str]] = {}
    for (eleve_id, s_idx), var in presence.items():
        if solver.Value(var):
            slot = slots[s_idx]
            key = (slot.kholleur_id, slot.salle_id, slot.discipline_id, slot.jour, slot.debut_minutes, slot.fin_minutes)
            par_creneau.setdefault(key, []).append(eleve_id)

    creneaux = [
        {
            "kholleurId": k,
            "salleId": salle_id,
            "disciplineId": discipline_id,
            "date": jour,
            "heureDebut": f"{debut // 60:02d}:{debut % 60:02d}",
            "heureFin": f"{fin // 60:02d}:{fin % 60:02d}",
            "eleveIds": eleve_ids,
        }
        for (k, salle_id, discipline_id, jour, debut, fin), eleve_ids in par_creneau.items()
    ]

    return SolveResult(statut="SUCCES", creneaux=creneaux)


def _jour_offset_minutes(jour_iso: str) -> int:
    """Convertit une date ISO en offset de minutes depuis une origine
    arbitraire, pour permettre au NoOverlap de comparer des créneaux sur
    des jours différents."""
    if not jour_iso:
        return 0
    origine = datetime(2000, 1, 1)
    jour = datetime.strptime(jour_iso, "%Y-%m-%d")
    return int((jour - origine) / timedelta(minutes=1))
