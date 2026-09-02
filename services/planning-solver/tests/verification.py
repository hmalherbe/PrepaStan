"""Vérificateur générique de contraintes dures, réutilisé par tous les tests
de test_solver.py.

Le vérificateur ci-dessous ne réutilise volontairement PAS
generer_slots_candidats() du solveur : il recalcule les intervalles
uniquement à partir de la SORTIE (result.creneaux, qui contient déjà
heureDebutPreparation/heureDebut/heureFin) et des quotas d'entrée, pour
détecter aussi un bug qui serait dans generer_slots_candidats() lui-même —
un test qui partage sa propre logique avec le code testé ne prouve rien.
"""

from __future__ import annotations

from datetime import datetime, timedelta


def _minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _instant(jour: str, minutes: int) -> datetime:
    return datetime.strptime(jour, "%Y-%m-%d") + timedelta(minutes=minutes)


def _chevauchent(a: tuple[datetime, datetime], b: tuple[datetime, datetime]) -> bool:
    return a[0] < b[1] and b[0] < a[1]


def assert_aucun_chevauchement(intervalles: list[tuple[datetime, datetime]], label: str) -> None:
    intervalles_tries = sorted(intervalles, key=lambda iv: iv[0])
    for i in range(len(intervalles_tries) - 1):
        a, b = intervalles_tries[i], intervalles_tries[i + 1]
        assert not _chevauchent(a, b), f"Chevauchement détecté pour {label} : {a} et {b}"


def assert_toutes_contraintes_dures(
    eleves: list[dict],
    quotas: list[dict],
    result,
    disciplines_langue: set[str] | None = None,
    effectif_partiel: bool = False,
) -> None:
    """Vérifie, indépendamment du solveur, l'intégralité des contraintes
    dures documentées dans la docstring de resoudre() : pas de
    chevauchement (élève/kholleur/salle, préparation incluse pour
    l'élève), chaque élève une fois par discipline demandée (ou 0/1 en
    effectif_partiel), éligibilité langue (LV1/LV2 uniquement, une seule
    langue par semaine), et remplissage exact de chaque quota."""
    assert result.statut == "SUCCES", f"Résolution attendue en succès, obtenu : {result.statut} — {result.message}"
    disciplines_langue = disciplines_langue or set()
    creneaux = result.creneaux
    assert creneaux, "SUCCES sans aucun créneau produit alors que des quotas existent"

    eleves_par_id = {e["id"]: e for e in eleves}

    # --- Pas de chevauchement : élève (préparation incluse), kholleur, salle
    intervalles_eleve: dict[str, list[tuple[datetime, datetime]]] = {}
    intervalles_kholleur: dict[str, list[tuple[datetime, datetime]]] = {}
    intervalles_salle: dict[str, list[tuple[datetime, datetime]]] = {}

    for c in creneaux:
        jour = c["date"]
        debut_prep = _instant(jour, _minutes(c["heureDebutPreparation"]))
        debut = _instant(jour, _minutes(c["heureDebut"]))
        fin = _instant(jour, _minutes(c["heureFin"]))

        intervalles_kholleur.setdefault(c["kholleurId"], []).append((debut, fin))
        intervalles_salle.setdefault(c["salleId"], []).append((debut, fin))
        for eleve_id in c["eleveIds"]:
            intervalles_eleve.setdefault(eleve_id, []).append((debut_prep, fin))

    for eleve_id, ivs in intervalles_eleve.items():
        assert_aucun_chevauchement(ivs, f"élève {eleve_id} (préparation incluse)")
    for kholleur_id, ivs in intervalles_kholleur.items():
        assert_aucun_chevauchement(ivs, f"kholleur {kholleur_id}")
    for salle_id, ivs in intervalles_salle.items():
        assert_aucun_chevauchement(ivs, f"salle {salle_id}")

    # --- Chaque élève exactement une fois par discipline demandée (ou <=1
    # si effectif_partiel), sauf les disciplines "langue" regroupées à part.
    disciplines_semaine = sorted({q["disciplineId"] for q in quotas})
    passages_par_eleve_discipline: dict[tuple[str, str], int] = {}
    for c in creneaux:
        for eleve_id in c["eleveIds"]:
            cle = (eleve_id, c["disciplineId"])
            passages_par_eleve_discipline[cle] = passages_par_eleve_discipline.get(cle, 0) + 1

    for e in eleves:
        for discipline_id in disciplines_semaine:
            if discipline_id in disciplines_langue:
                continue
            n = passages_par_eleve_discipline.get((e["id"], discipline_id), 0)
            attendu = "<= 1" if effectif_partiel else "== 1"
            ok = n <= 1 if effectif_partiel else n == 1
            assert ok, f"Élève {e['id']} discipline {discipline_id} : {n} passage(s), attendu {attendu}"

    # --- Langues : éligibilité stricte + une seule langue par semaine
    for e in eleves:
        lv1, lv2 = e.get("lv1DisciplineId"), e.get("lv2DisciplineId")
        mes_langues_offertes = {d for d in disciplines_langue if d in (lv1, lv2)}
        n_langue = sum(
            passages_par_eleve_discipline.get((e["id"], d), 0) for d in disciplines_langue
        )
        if mes_langues_offertes:
            attendu = "<= 1" if effectif_partiel else "== 1"
            ok = n_langue <= 1 if effectif_partiel else n_langue == 1
            assert ok, f"Élève {e['id']} langues offertes {mes_langues_offertes} : {n_langue} passage(s), attendu {attendu}"
        else:
            assert n_langue == 0, f"Élève {e['id']} affecté à une langue ({n_langue}) alors qu'aucune de ses langues n'est offerte"

        # Un élève n'est jamais affecté à une discipline "langue" qui n'est
        # ni sa LV1 ni sa LV2, même si cette discipline reste sous-remplie.
        for d in disciplines_langue:
            if d not in (lv1, lv2):
                n = passages_par_eleve_discipline.get((e["id"], d), 0)
                assert n == 0, f"Élève {e['id']} affecté à {d} qui n'est ni sa LV1 ({lv1}) ni sa LV2 ({lv2})"

    # --- Chaque quota exactement rempli : sur la fenêtre horaire du quota
    # (kholleur/salle/discipline/jour, entre le début de la 1re préparation
    # et la fin de la dernière khôlle), le nombre total d'élèves affectés
    # doit égaler nombreEleves.
    for q in quotas:
        debut_fenetre = _minutes(q["heureDebut"])
        fin_fenetre = debut_fenetre + q["dureePreparationMinutes"] + q["nombreEleves"] * q["dureeKholleMinutes"]
        total = 0
        for c in creneaux:
            if (
                c["kholleurId"] == q["kholleurId"]
                and c["salleId"] == q["salleId"]
                and c["disciplineId"] == q["disciplineId"]
                and c["date"] == q["date"]
                and debut_fenetre <= _minutes(c["heureDebut"]) < fin_fenetre
            ):
                total += len(c["eleveIds"])
        assert total == q["nombreEleves"], (
            f"Quota {q['kholleurId']}/{q['disciplineId']}/{q['date']} {q['heureDebut']} : "
            f"{total} élève(s) affecté(s), attendu {q['nombreEleves']}"
        )
