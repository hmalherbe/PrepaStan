"""Génération du planning de khôlles sous contraintes avec OR-Tools CP-SAT.

Un élève ne pouvant pas avoir deux khôlles en même temps, y compris entre
disciplines différentes, la résolution porte sur toute la semaine d'une
classe (toutes disciplines demandées confondues) en une seule fois.

Contraintes dures :
- pas de chevauchement horaire pour un même élève, kholleur ou salle
- chaque élève passe exactement une fois par discipline demandée
- seuls les créneaux dans les disponibilités déclarées sont utilisables

Objectifs "soft" (somme pondérée, pondérations ajustables ci-dessous) :
- équilibrer la charge cumulée des kholleurs (historique inclus)
- maximiser la diversité des kholleurs vus par un même élève dans une
  discipline (pénalise le fait de retomber sur un kholleur déjà eu)
- éviter qu'un élève se retrouve systématiquement sur un créneau tardif
  (pénalise un nouveau créneau tardif proportionnellement au nombre de
  fois où cet élève a déjà été tardif par le passé)

Ces trois objectifs ont des unités différentes (nombre de créneaux vs
nombre de répétitions vs nombre d'occurrences tardives) : leur pondération
relative est une heuristique de départ, à ajuster empiriquement.
"""

# Nécessaire pour rester compatible Python 3.9 : sans ceci, la syntaxe
# `list[dict] | None` (PEP 604, disponible seulement à partir de 3.10) lève
# une TypeError au chargement du module. Avec cet import, les annotations ne
# sont plus évaluées à la définition de la classe/fonction, seulement à la
# demande (get_type_hints), ce qu'on ne fait jamais ici.
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from ortools.sat.python import cp_model

# Pondérations de l'objectif combiné (voir docstring ci-dessus).
POIDS_EQUILIBRAGE_KHOLLEUR = 10
POIDS_DIVERSITE_KHOLLEUR = 5
POIDS_EQUILIBRAGE_HORAIRE = 1

# Un créneau démarrant à partir de cette heure est considéré "tardif" pour
# l'objectif d'équilibrage des horaires de passage.
SEUIL_TARDIF_MINUTES = 17 * 60


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
    historique_eleve_kholleur: dict[str, int] | None = None,
    historique_charge_kholleur: dict[str, int] | None = None,
    historique_tardif_eleve: dict[str, int] | None = None,
    max_temps_secondes: float = 30.0,
    duree_creneau_minutes: int = 20,
) -> SolveResult:
    historique_eleve_kholleur = historique_eleve_kholleur or {}
    historique_charge_kholleur = historique_charge_kholleur or {}
    historique_tardif_eleve = historique_tardif_eleve or {}

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

    # --- Objectif 1 : équilibrer la charge cumulée des kholleurs -----------
    # charge_max borne le nombre de créneaux d'un kholleur, historique inclus,
    # donc un kholleur déjà très sollicité par le passé est défavorisé même
    # s'il a peu de créneaux cette semaine.
    charge_historique_max = max(historique_charge_kholleur.values(), default=0)
    charge_max = model.NewIntVar(
        0, len(eleves) * len(disciplines_semaine) + charge_historique_max, "charge_max"
    )
    for kholleur_id in intervals_kholleur:
        vars_k = [presence[key] for key in presence if slots[key[1]].kholleur_id == kholleur_id]
        model.Add(charge_max >= historique_charge_kholleur.get(kholleur_id, 0) + sum(vars_k))

    # --- Objectif 2 : diversité des kholleurs vus par un même élève --------
    # Pénalise l'affectation d'un kholleur que cet élève a déjà eu dans cette
    # discipline, proportionnellement au nombre de fois où c'est déjà arrivé.
    termes_diversite = []
    for (eleve_id, s_idx), var in presence.items():
        slot = slots[s_idx]
        deja_eu = historique_eleve_kholleur.get(f"{eleve_id}|{slot.discipline_id}|{slot.kholleur_id}", 0)
        if deja_eu:
            termes_diversite.append(deja_eu * var)
    diversite_penalite = sum(termes_diversite) if termes_diversite else 0

    # --- Objectif 3 : équilibrer les horaires de passage --------------------
    # Pénalise un créneau tardif pour un élève déjà souvent tombé tard,
    # proportionnellement au nombre de fois où c'est déjà arrivé.
    termes_horaire = []
    for (eleve_id, s_idx), var in presence.items():
        slot = slots[s_idx]
        if slot.debut_minutes >= SEUIL_TARDIF_MINUTES:
            deja_tardif = historique_tardif_eleve.get(eleve_id, 0)
            if deja_tardif:
                termes_horaire.append(deja_tardif * var)
    horaire_penalite = sum(termes_horaire) if termes_horaire else 0

    model.Minimize(
        POIDS_EQUILIBRAGE_KHOLLEUR * charge_max
        + POIDS_DIVERSITE_KHOLLEUR * diversite_penalite
        + POIDS_EQUILIBRAGE_HORAIRE * horaire_penalite
    )

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
