"""Génération du planning de khôlles sous contraintes avec OR-Tools CP-SAT.

Un élève ne pouvant pas avoir deux khôlles en même temps, y compris entre
disciplines différentes, la résolution porte sur toute la semaine d'une
classe (toutes disciplines demandées confondues) en une seule fois.

Chaque quota fixé par l'admin (jour, discipline, kholleur, salle, heure de
début, nombre d'élèves) détermine déjà tout sauf l'identité des élèves : les
créneaux candidats sont générés directement à partir des quotas, en découpant
la plage [heureDebut, heureDebut + nombreEleves * durée] en créneaux
successifs dans la salle indiquée. OR-Tools ne choisit donc que QUELS élèves
remplissent chaque créneau ainsi généré.

Contraintes dures :
- pas de chevauchement horaire pour un même élève (un kholleur/une salle ne
  peuvent en pratique pas se chevaucher puisque chaque quota leur est propre,
  mais la contrainte reste posée par sécurité)
- chaque élève passe exactement une fois par discipline demandée
- chaque créneau issu d'un quota est occupé par exactement un élève (donc
  chaque quota est intégralement rempli)

Objectifs "soft" (somme pondérée, pondérations ajustables ci-dessous) :
- équilibrer la charge cumulée des kholleurs (historique inclus)
- maximiser la diversité des kholleurs vus par un même élève dans une
  discipline (pénalise le fait de retomber sur un kholleur déjà eu)
- équilibrer les heures de passage : chaque créneau a un "rang horaire"
  d'autant plus élevé qu'il commence tard dans la journée (rang = minutes
  depuis minuit / durée d'un créneau), cumulé par élève au fil de l'année ;
  minimise le cumul du plus mal loti, comme pour la charge des kholleurs,
  plutôt que de juste pénaliser un seuil "tardif" binaire — un élève souvent
  à 14h et un autre souvent à 18h ont un score très différent même si aucun
  des deux n'a jamais dépassé un seuil arbitraire.

Ces objectifs ont des unités différentes (nombre de créneaux vs nombre de
répétitions vs rang horaire cumulé) : leur pondération relative est une
heuristique de départ, à ajuster empiriquement.
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
# Très supérieur aux autres : l'alternance LV1/LV2 est une consigne explicite
# de l'établissement (pas juste un objectif de confort), mais reste "soft"
# plutôt que dure pour ne jamais rendre une semaine infaisable si les quotas
# historiques ne permettent pas une alternance parfaite pour tout le monde.
POIDS_ALTERNANCE_LANGUE = 1000


@dataclass
class Slot:
    kholleur_id: str
    discipline_id: str
    salle_id: str
    jour: str  # date ISO "YYYY-MM-DD"
    debut_minutes: int
    fin_minutes: int
    quota_index: int


@dataclass
class SolveResult:
    statut: str  # "SUCCES" | "INFAISABLE"
    creneaux: list[dict] | None = None
    message: str | None = None


def _minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _rang_horaire(debut_minutes: int) -> int:
    """Rang entier d'autant plus élevé que le créneau commence tard dans la
    journée (14h → 14, 18h30 → 18, etc.) : sert de "numéro" croissant avec
    l'horaire pour cumuler un score comparable d'une semaine à l'autre,
    plutôt qu'un simple seuil tardif/pas tardif. Granularité à l'heure
    (plutôt qu'à la minute ou au créneau) pour rester du même ordre de
    grandeur que les autres objectifs (nombre de créneaux, de répétitions)."""
    return debut_minutes // 60


def generer_slots_candidats(quotas: list[dict], duree_creneau_minutes: int) -> list[Slot]:
    """Découpe chaque quota en `nombreEleves` créneaux successifs d'une durée
    fixe, dans la salle et à partir de l'heure de début qu'il spécifie."""
    slots: list[Slot] = []
    for quota_index, q in enumerate(quotas):
        debut = _minutes(q["heureDebut"])
        for i in range(q["nombreEleves"]):
            t = debut + i * duree_creneau_minutes
            slots.append(
                Slot(
                    kholleur_id=q["kholleurId"],
                    discipline_id=q["disciplineId"],
                    salle_id=q["salleId"],
                    jour=q["date"],
                    debut_minutes=t,
                    fin_minutes=t + duree_creneau_minutes,
                    quota_index=quota_index,
                )
            )
    return slots


def resoudre(
    eleves: list[dict],
    quotas: list[dict],
    historique_eleve_kholleur: dict[str, int] | None = None,
    historique_charge_kholleur: dict[str, int] | None = None,
    historique_score_horaire_eleve: dict[str, int] | None = None,
    disciplines_langue: set[str] | None = None,
    historique_derniere_langue: dict[str, str] | None = None,
    effectif_partiel: bool = False,
    max_temps_secondes: float = 30.0,
    duree_creneau_minutes: int = 20,
) -> SolveResult:
    """`disciplines_langue` : sous-ensemble de disciplines de la semaine
    marquées "langue vivante" (Discipline.estLangueVivante côté app). Pour
    ces disciplines-là uniquement, un élève n'est éligible que si elle/il
    figure dans son propre `lv1DisciplineId`/`lv2DisciplineId` (clés
    optionnelles sur chaque élève de `eleves`) : un élève dont la LV2 est
    Espagnol ne peut jamais être affecté à une khôlle d'Italien, même si son
    quota n'est pas rempli par ailleurs. Quand LV1 et LV2 sont toutes deux
    khôllées la même semaine, l'élève doit passer exactement une fois parmi
    les deux (jamais les deux, jamais aucune) ; `historique_derniere_langue`
    (élève -> "LV1"/"LV2" du dernier passage en langue) alimente l'objectif
    d'alternance ci-dessous.
    """
    historique_eleve_kholleur = historique_eleve_kholleur or {}
    historique_charge_kholleur = historique_charge_kholleur or {}
    historique_score_horaire_eleve = historique_score_horaire_eleve or {}
    disciplines_langue = disciplines_langue or set()
    historique_derniere_langue = historique_derniere_langue or {}
    disciplines_semaine = sorted({q["disciplineId"] for q in quotas})

    slots = generer_slots_candidats(quotas, duree_creneau_minutes)
    if not slots:
        return SolveResult(statut="INFAISABLE", message="Aucun quota fourni.")

    model = cp_model.CpModel()

    presence: dict[tuple[str, int], cp_model.IntVar] = {}
    intervals_eleve: dict[str, list[cp_model.IntervalVar]] = {e["id"]: [] for e in eleves}
    intervals_kholleur: dict[str, list[cp_model.IntervalVar]] = {}
    intervals_salle: dict[str, list[cp_model.IntervalVar]] = {}

    for e in eleves:
        mes_langues = {e.get("lv1DisciplineId"), e.get("lv2DisciplineId")}
        for s_idx, slot in enumerate(slots):
            # Une discipline "langue" n'est proposée qu'aux élèves dont c'est
            # justement la LV1 ou la LV2 : on ne crée même pas la variable de
            # présence pour les autres, plutôt que de la contraindre à 0 —
            # plus simple, et ça garde `presence` fidèle aux affectations
            # réellement possibles pour les contraintes de quota ci-dessous.
            if slot.discipline_id in disciplines_langue and slot.discipline_id not in mes_langues:
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

    # Chaque élève passe exactement une fois par discipline demandée cette
    # semaine — sauf les disciplines "langue", regroupées juste après : un
    # élève dont LV1 et LV2 sont toutes deux khôllées cette semaine-là doit
    # en passer exactement une (l'une OU l'autre), pas une de chaque.
    #
    # `effectif_partiel=True` relâche ce "exactement" en "au plus" : sert à
    # rejouer un historique réel où le total des quotas d'une discipline ne
    # correspond pas exactement à l'effectif de la classe (ex. import de
    # plannings passés où quelques élèves manquent sans qu'on sache
    # lesquels). Dans le cas normal (total quota == effectif), le résultat
    # est identique à "== 1" : la contrainte de remplissage des quotas
    # ci-dessous force de toute façon le compte à correspondre.
    for e in eleves:
        for discipline_id in disciplines_semaine:
            if discipline_id in disciplines_langue:
                continue
            vars_ed = [
                presence[(e["id"], s_idx)]
                for s_idx, slot in enumerate(slots)
                if slot.discipline_id == discipline_id
            ]
            model.Add(sum(vars_ed) <= 1) if effectif_partiel else model.Add(sum(vars_ed) == 1)

    for e in eleves:
        mes_langues_offertes = {
            d for d in disciplines_langue if d in (e.get("lv1DisciplineId"), e.get("lv2DisciplineId"))
        }
        if not mes_langues_offertes:
            continue
        vars_langue = [
            presence[(e["id"], s_idx)]
            for s_idx, slot in enumerate(slots)
            if slot.discipline_id in mes_langues_offertes
        ]
        model.Add(sum(vars_langue) <= 1) if effectif_partiel else model.Add(sum(vars_langue) == 1)

    # Chaque quota doit être intégralement rempli : le nombre total de
    # (élève, créneau du quota) retenus doit égaler nombreEleves. Combiné à
    # la contrainte NoOverlap par kholleur (qui interdit déjà que deux
    # élèves occupent le même créneau, puisqu'ils partageraient alors le
    # même horaire), ça force chaque créneau du quota à être occupé par
    # exactement un élève — sans quoi le solveur pourrait laisser des
    # créneaux vides tant que le total par discipline reste correct.
    presence_par_quota: dict[int, list[cp_model.IntVar]] = {}
    for (eleve_id, s_idx), var in presence.items():
        presence_par_quota.setdefault(slots[s_idx].quota_index, []).append(var)
    for quota_index, vars_quota in presence_par_quota.items():
        model.Add(sum(vars_quota) == quotas[quota_index]["nombreEleves"])

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
    # score_horaire_max borne le rang horaire cumulé d'un élève, historique
    # inclus (même principe que charge_max pour les kholleurs juste
    # au-dessus) : minimiser son maximum pousse à ne pas laisser un même
    # élève accumuler les créneaux tardifs semaine après semaine, sans se
    # limiter à un seuil binaire "tardif ou pas".
    rangs_semaine = [_rang_horaire(slot.debut_minutes) for slot in slots]
    rang_historique_max = max(historique_score_horaire_eleve.values(), default=0)
    score_horaire_max = model.NewIntVar(
        0, rang_historique_max + len(disciplines_semaine) * max(rangs_semaine, default=0), "score_horaire_max"
    )
    for e in eleves:
        vars_e = [
            (key, var) for key, var in presence.items() if key[0] == e["id"]
        ]
        if not vars_e:
            continue
        model.Add(
            score_horaire_max
            >= historique_score_horaire_eleve.get(e["id"], 0)
            + sum(rangs_semaine[s_idx] * var for (_, s_idx), var in vars_e)
        )

    # --- Objectif 4 : alternance LV1/LV2 d'une semaine sur l'autre ---------
    # Ne s'applique qu'aux élèves ayant à la fois une LV1 et une LV2 (donc en
    # pratique seulement en L1). Pénalise le fait de repasser dans la même
    # langue (LV1 ou LV2) que la dernière fois, quand ce choix existe cette
    # semaine (l'autre langue est aussi khôllée) — voir la contrainte dure
    # "une seule langue par semaine" ci-dessus, qui garantit qu'il y a bien
    # un choix binaire à faire dans ce cas.
    termes_alternance = []
    for e in eleves:
        lv1, lv2 = e.get("lv1DisciplineId"), e.get("lv2DisciplineId")
        dernier = historique_derniere_langue.get(e["id"])
        if not lv1 or not lv2 or not dernier:
            continue
        for s_idx, slot in enumerate(slots):
            if slot.discipline_id not in (lv1, lv2):
                continue
            type_slot = "LV1" if slot.discipline_id == lv1 else "LV2"
            if type_slot == dernier:
                key = (e["id"], s_idx)
                if key in presence:
                    termes_alternance.append(presence[key])
    alternance_penalite = sum(termes_alternance) if termes_alternance else 0

    model.Minimize(
        POIDS_ALTERNANCE_LANGUE * alternance_penalite
        + POIDS_EQUILIBRAGE_KHOLLEUR * charge_max
        + POIDS_DIVERSITE_KHOLLEUR * diversite_penalite
        + POIDS_EQUILIBRAGE_HORAIRE * score_horaire_max
    )

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max_temps_secondes
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return SolveResult(
            statut="INFAISABLE",
            message="Impossible de satisfaire toutes les contraintes avec les quotas actuels.",
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
