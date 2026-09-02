"""Suite de tests différenciés pour le solveur OR-Tools (app/solver.py).

Chaque scénario ci-dessous construit un jeu d'élèves/quotas volontairement
différent (nombre de disciplines simultanées, kholleurs/salles multiples,
langues LV1/LV2, effectif partiel, cas infaisables provoqués
volontairement) et vérifie SYSTÉMATIQUEMENT l'intégralité des contraintes
dures via `assert_toutes_contraintes_dures` (voir tests/verification.py),
en plus de l'assertion propre à chaque scénario. Les objectifs "soft"
(diversité, équilibrage horaire, alternance langue) sont vérifiés dans des
scénarios où un seul facteur les distingue, pour que le résultat attendu
soit sans ambiguïté malgré leur nature pondérée plutôt que stricte.

Lancer depuis services/planning-solver :
    .venv/bin/pytest tests/ -v
"""

from __future__ import annotations

import pytest

from app.solver import SolveResult, resoudre
from tests.verification import assert_toutes_contraintes_dures


def quota(
    kholleur_id: str,
    discipline_id: str,
    salle_id: str,
    date: str = "2027-01-04",
    heure_debut: str = "14:00",
    duree_preparation: int = 10,
    duree_kholle: int = 20,
    nombre_eleves: int = 1,
) -> dict:
    return {
        "kholleurId": kholleur_id,
        "disciplineId": discipline_id,
        "salleId": salle_id,
        "date": date,
        "heureDebut": heure_debut,
        "dureePreparationMinutes": duree_preparation,
        "dureeKholleMinutes": duree_kholle,
        "nombreEleves": nombre_eleves,
    }


def eleve(id_: str, lv1: str | None = None, lv2: str | None = None) -> dict:
    e: dict = {"id": id_}
    if lv1 is not None:
        e["lv1DisciplineId"] = lv1
    if lv2 is not None:
        e["lv2DisciplineId"] = lv2
    return e


# ---------- Cas de base ----------------------------------------------------


def test_cas_simple_une_discipline_un_kholleur():
    eleves = [eleve("E1"), eleve("E2")]
    quotas = [quota("K1", "Maths", "S1", nombre_eleves=2)]

    result = resoudre(eleves=eleves, quotas=quotas)

    assert_toutes_contraintes_dures(eleves, quotas, result)
    assert len(result.creneaux) == 2


def test_gros_effectif_une_seule_discipline():
    """Vérifie le passage à l'échelle (25 élèves, préparation à la chaîne)
    plutôt que juste des cas minimaux à 1-2 élèves."""
    eleves = [eleve(f"E{i}") for i in range(25)]
    quotas = [quota("K1", "Maths", "S1", nombre_eleves=25, duree_preparation=30, duree_kholle=20)]

    result = resoudre(eleves=eleves, quotas=quotas)

    assert_toutes_contraintes_dures(eleves, quotas, result)


# ---------- Plusieurs disciplines / kholleurs / salles simultanés ----------


def test_deux_disciplines_creneaux_strictement_simultanes():
    """Deux disciplines dont les créneaux couvrent exactement les mêmes
    horaires : seule une répartition croisée des 2 élèves (chacun tôt dans
    l'une, tard dans l'autre) satisfait l'absence de chevauchement — un cas
    qui ne serait PAS trouvé par une affectation naïve dans l'ordre."""
    eleves = [eleve("E1"), eleve("E2")]
    quotas = [
        quota("KM", "Maths", "SM", heure_debut="14:00", duree_preparation=0, duree_kholle=20, nombre_eleves=2),
        quota("KP", "Physique", "SP", heure_debut="14:00", duree_preparation=0, duree_kholle=20, nombre_eleves=2),
    ]

    result = resoudre(eleves=eleves, quotas=quotas)

    assert_toutes_contraintes_dures(eleves, quotas, result)
    # Chaque élève a bien fait les deux disciplines (vérifié plus en détail
    # par le checker générique, mais on s'assure ici qu'aucune n'a été
    # sautée silencieusement en cas de sur-relaxation d'une contrainte).
    for e in eleves:
        disciplines_vues = {c["disciplineId"] for c in result.creneaux if e["id"] in c["eleveIds"]}
        assert disciplines_vues == {"Maths", "Physique"}


def test_plusieurs_kholleurs_et_salles_meme_discipline_meme_creneau():
    eleves = [eleve(f"E{i}") for i in range(3)]
    quotas = [
        quota("K1", "Maths", "S1", nombre_eleves=2),
        quota("K2", "Maths", "S2", nombre_eleves=1),
    ]

    result = resoudre(eleves=eleves, quotas=quotas)

    assert_toutes_contraintes_dures(eleves, quotas, result)


def test_semaine_realiste_trois_disciplines_plusieurs_jours():
    """Scénario composite plus proche d'une vraie semaine : 8 élèves, 3
    disciplines (dont 2 langues), plusieurs jours et kholleurs, quelques
    créneaux qui se chevauchent entre disciplines pour forcer de vrais
    arbitrages plutôt qu'un simple rangement séquentiel."""
    eleves = [
        eleve("E1", lv1="Espagnol", lv2="Allemand"),
        eleve("E2", lv1="Allemand", lv2="Espagnol"),
        eleve("E3", lv1="Espagnol", lv2="Allemand"),
        eleve("E4", lv1="Allemand", lv2="Espagnol"),
        eleve("E5", lv1="Espagnol", lv2="Allemand"),
        eleve("E6", lv1="Allemand", lv2="Espagnol"),
        eleve("E7", lv1="Espagnol", lv2="Allemand"),
        eleve("E8", lv1="Allemand", lv2="Espagnol"),
    ]
    quotas = [
        quota("KMaths1", "Maths", "S1", date="2027-01-04", heure_debut="14:00", nombre_eleves=4),
        quota("KMaths2", "Maths", "S2", date="2027-01-04", heure_debut="14:00", nombre_eleves=4),
        quota("KEsp", "Espagnol", "S3", date="2027-01-05", heure_debut="14:00", duree_preparation=0, duree_kholle=20, nombre_eleves=4),
        quota("KAll", "Allemand", "S4", date="2027-01-05", heure_debut="14:00", duree_preparation=0, duree_kholle=20, nombre_eleves=4),
    ]

    result = resoudre(eleves=eleves, quotas=quotas, disciplines_langue={"Espagnol", "Allemand"})

    assert_toutes_contraintes_dures(eleves, quotas, result, disciplines_langue={"Espagnol", "Allemand"})


# ---------- Langues LV1 / LV2 ----------------------------------------------


def test_eligibilite_langue_stricte():
    eleves = [
        eleve("E1", lv1="Espagnol", lv2="Allemand"),
        eleve("E2", lv1="Allemand", lv2="Espagnol"),
        eleve("E3", lv1="Anglais", lv2="Anglais"),  # n'a ni Espagnol ni Allemand
    ]
    quotas = [
        quota("KEsp", "Espagnol", "S1", heure_debut="14:00", duree_preparation=0, duree_kholle=20, nombre_eleves=1),
        quota("KAll", "Allemand", "S2", heure_debut="15:00", duree_preparation=0, duree_kholle=20, nombre_eleves=1),
    ]

    result = resoudre(eleves=eleves, quotas=quotas, disciplines_langue={"Espagnol", "Allemand"})

    assert_toutes_contraintes_dures(eleves, quotas, result, disciplines_langue={"Espagnol", "Allemand"})
    # E3 ne doit apparaître dans aucun créneau de langue (déjà vérifié par le
    # checker générique, réaffirmé ici explicitement pour ce cas précis).
    assert all("E3" not in c["eleveIds"] for c in result.creneaux if c["disciplineId"] in ("Espagnol", "Allemand"))


def test_une_seule_langue_par_semaine_quand_les_deux_sont_offertes():
    eleves = [eleve("E1", lv1="Espagnol", lv2="Allemand")]
    quotas = [
        quota("KEsp", "Espagnol", "S1", heure_debut="14:00", duree_preparation=0, duree_kholle=20, nombre_eleves=1),
        quota("KAll", "Allemand", "S2", heure_debut="15:00", duree_preparation=0, duree_kholle=20, nombre_eleves=1),
    ]

    result = resoudre(eleves=eleves, quotas=quotas, disciplines_langue={"Espagnol", "Allemand"})

    assert result.statut == "INFAISABLE", (
        "1 seul élève éligible pour 2 quotas de langue à remplir chacun exactement : "
        "infaisable puisque l'élève ne peut prendre les deux (une langue par semaine)."
    )


def test_alternance_lv1_lv2_penalise_repeter_la_meme_langue():
    """Objectif soft, mais poids très dominant (POIDS_ALTERNANCE_LANGUE) :
    un élève qui a fait LV2 la dernière fois doit se voir préférer LV1
    cette semaine quand les deux sont offertes et qu'un autre élève,
    indifférent, peut combler l'autre quota. Vérifié manuellement que, SANS
    aucun historique, OR-Tools affecte déjà par défaut E1 à Allemand (LV2) —
    d'où le choix d'historiser sur LV2 ici (et d'attendre Espagnol/LV1 en
    retour) : un résultat qui coïnciderait avec le défaut ne prouverait pas
    que l'objectif d'alternance est réellement à l'origine du choix."""
    eleves = [
        eleve("E1", lv1="Espagnol", lv2="Allemand"),  # a fait LV2 (Allemand) la dernière fois
        eleve("E2", lv1="Espagnol", lv2="Allemand"),  # pas d'historique, indifférent
    ]
    quotas = [
        quota("KEsp", "Espagnol", "S1", heure_debut="14:00", duree_preparation=0, duree_kholle=20, nombre_eleves=1),
        quota("KAll", "Allemand", "S2", heure_debut="15:00", duree_preparation=0, duree_kholle=20, nombre_eleves=1),
    ]

    result = resoudre(
        eleves=eleves,
        quotas=quotas,
        disciplines_langue={"Espagnol", "Allemand"},
        historique_derniere_langue={"E1": "LV2"},
    )

    assert_toutes_contraintes_dures(eleves, quotas, result, disciplines_langue={"Espagnol", "Allemand"})
    discipline_e1 = next(c["disciplineId"] for c in result.creneaux if "E1" in c["eleveIds"])
    assert discipline_e1 == "Espagnol", "E1 aurait dû alterner vers LV1 (Espagnol) après avoir fait LV2 la dernière fois"


# ---------- Effectif partiel -----------------------------------------------


def test_effectif_partiel_relache_exactement_un_en_au_plus_un():
    eleves = [eleve("E1"), eleve("E2"), eleve("E3")]
    quotas = [quota("K1", "Maths", "S1", nombre_eleves=2)]

    result = resoudre(eleves=eleves, quotas=quotas, effectif_partiel=True)

    assert_toutes_contraintes_dures(eleves, quotas, result, effectif_partiel=True)
    total_affecte = sum(len(c["eleveIds"]) for c in result.creneaux)
    assert total_affecte == 2


def test_sans_effectif_partiel_sous_effectif_est_infaisable():
    """Même scénario que ci-dessus mais sans la relaxation : "exactement une
    fois" pour les 3 élèves exige 3 affectations, incompatible avec un
    quota qui n'en prévoit que 2."""
    eleves = [eleve("E1"), eleve("E2"), eleve("E3")]
    quotas = [quota("K1", "Maths", "S1", nombre_eleves=2)]

    result = resoudre(eleves=eleves, quotas=quotas, effectif_partiel=False)

    assert result.statut == "INFAISABLE"


# ---------- Cas infaisables provoqués volontairement -----------------------


def test_infaisable_quotas_excedent_effectif():
    eleves = [eleve("E1"), eleve("E2")]
    quotas = [quota("K1", "Maths", "S1", nombre_eleves=3)]  # 3 places, 2 élèves seulement

    result = resoudre(eleves=eleves, quotas=quotas)

    assert result.statut == "INFAISABLE"


def test_infaisable_conflit_horaire_structurel_meme_kholleur():
    """Erreur de saisie admin plausible : le même kholleur affecté à deux
    disciplines en même temps dans deux salles différentes. Les capacités
    sont par ailleurs exactement équilibrées (2 élèves, 2 places par
    discipline) pour que la seule cause d'infaisabilité possible soit le
    conflit kholleur, jamais un manque de places — sans quoi le test
    prouverait autre chose que ce qu'il prétend (voir le commentaire de
    test_infaisable_conflit_salle_structurel juste après, où ce piège a été
    repéré par mutation). Vérifié par mutation : en désactivant
    temporairement AddNoOverlap(intervals_kholleur) dans solver.py, ce
    scénario précis passe de INFAISABLE à SUCCES."""
    eleves = [eleve("E1"), eleve("E2")]
    quotas = [
        quota("K1", "Maths", "S1", heure_debut="14:00", duree_preparation=0, duree_kholle=20, nombre_eleves=2),
        quota("K1", "Physique", "S2", heure_debut="14:00", duree_preparation=0, duree_kholle=20, nombre_eleves=2),
    ]

    result = resoudre(eleves=eleves, quotas=quotas)

    assert result.statut == "INFAISABLE"


def test_infaisable_conflit_salle_structurel():
    """Même principe que le conflit kholleur ci-dessus, mais côté salle :
    deux kholleurs différents (donc pas de conflit kholleur), tous deux
    affectés à la même salle au même horaire. Les capacités sont par
    ailleurs exactement équilibrées (2 élèves, 2 places Maths, 2 places
    Physique) pour que la seule cause d'infaisabilité possible soit le
    partage de salle, jamais un manque de places. Vérifié par mutation :
    en désactivant temporairement AddNoOverlap(intervals_salle) dans
    solver.py, ce scénario précis passe de INFAISABLE à SUCCES — la preuve
    que ce test isole bien la contrainte salle et non autre chose."""
    eleves = [eleve("E1"), eleve("E2")]
    quotas = [
        quota("K1", "Maths", "S1", heure_debut="14:00", duree_preparation=0, duree_kholle=20, nombre_eleves=2),
        quota("K2", "Physique", "S1", heure_debut="14:00", duree_preparation=0, duree_kholle=20, nombre_eleves=2),
    ]

    result = resoudre(eleves=eleves, quotas=quotas)

    assert result.statut == "INFAISABLE"


def test_aucun_quota_est_infaisable():
    result = resoudre(eleves=[eleve("E1")], quotas=[])
    assert result.statut == "INFAISABLE"


# ---------- Objectifs "soft" vérifiés en configuration contrôlée -----------


def test_objectif_diversite_prefere_un_kholleur_jamais_vu():
    """Sans aucun historique, OR-Tools affecte déjà E1 à K2 par simple
    ordre de résolution interne (vérifié manuellement) : historiser E1 sur
    K1 et vérifier qu'il atterrit sur K2 ne prouverait donc rien à soi
    seul. Le test historise au contraire sur K2 (le choix "par défaut") et
    vérifie que le résultat bascule vers K1 — un renversement par rapport
    au défaut, qui ne peut s'expliquer que par l'objectif de diversité."""
    eleves = [eleve("E1"), eleve("E2")]
    quotas = [
        quota("K1", "Maths", "S1", heure_debut="14:00", nombre_eleves=1),
        quota("K2", "Maths", "S2", heure_debut="14:00", nombre_eleves=1),
    ]

    result = resoudre(
        eleves=eleves,
        quotas=quotas,
        historique_eleve_kholleur={"E1|Maths|K2": 2},
    )

    assert_toutes_contraintes_dures(eleves, quotas, result)
    kholleur_e1 = next(c["kholleurId"] for c in result.creneaux if "E1" in c["eleveIds"])
    assert kholleur_e1 == "K1", "E1 aurait dû être affecté au kholleur jamais vu (K1) plutôt qu'à K2 (déjà vu 2 fois)"


def test_objectif_horaire_privilegie_le_creneau_tot_pour_eleve_deja_penalise():
    """Vérifié manuellement que, SANS aucun historique, OR-Tools affecte
    déjà par défaut E1 au créneau tardif (18h) sur ce scénario — le résultat
    attendu ci-dessous (14h une fois E1 historiquement pénalisé) va donc à
    l'inverse du défaut, ce qui ne peut s'expliquer que par l'objectif
    d'équilibrage horaire."""
    eleves = [eleve("E1"), eleve("E2")]
    quotas = [
        quota("K1", "Maths", "S1", heure_debut="14:00", duree_preparation=0, duree_kholle=20, nombre_eleves=1),
        quota("K1", "Maths", "S1", heure_debut="18:00", duree_preparation=0, duree_kholle=20, nombre_eleves=1),
    ]

    result = resoudre(
        eleves=eleves,
        quotas=quotas,
        historique_score_horaire_eleve={"E1": 100},
    )

    assert_toutes_contraintes_dures(eleves, quotas, result)
    heure_e1 = next(c["heureDebut"] for c in result.creneaux if "E1" in c["eleveIds"])
    assert heure_e1 == "14:00", "E1, déjà pénalisé par l'historique, aurait dû recevoir le créneau le plus tôt"


# ---------- Sanity du vérificateur lui-même --------------------------------
# Un vérificateur qui ne peut jamais échouer ne prouve rien : les tests
# ci-dessous injectent volontairement une violation dans un résultat par
# ailleurs valide et s'assurent qu'assert_toutes_contraintes_dures la
# détecte bien (pytest.raises), plutôt que de supposer que "tous les tests
# du dessus passent" suffit à faire confiance au vérificateur.


def _resultat_valide_pour_mutation() -> tuple[list[dict], list[dict], SolveResult]:
    eleves = [eleve("E1"), eleve("E2")]
    quotas = [quota("K1", "Maths", "S1", heure_debut="14:00", duree_preparation=0, duree_kholle=20, nombre_eleves=2)]
    result = resoudre(eleves=eleves, quotas=quotas)
    assert result.statut == "SUCCES"
    return eleves, quotas, result


def test_checker_detecte_un_chevauchement_eleve():
    eleves, quotas, result = _resultat_valide_pour_mutation()
    # Duplique le premier créneau à l'identique (même horaire) en y mettant
    # aussi E1 : chevauchement strict avec lui-même, indépendamment du
    # nombre de passages par discipline (qui deviendrait aussi faux ici,
    # mais le chevauchement est vérifié en premier dans le checker).
    creneau_double = dict(result.creneaux[0])
    creneau_double["eleveIds"] = ["E1"]
    creneaux_casses = [dict(result.creneaux[0], eleveIds=["E1"]), creneau_double]
    result_casse = SolveResult(statut="SUCCES", creneaux=creneaux_casses)

    with pytest.raises(AssertionError, match="Chevauchement"):
        assert_toutes_contraintes_dures(eleves, quotas, result_casse)


def test_checker_detecte_un_quota_sous_rempli():
    # effectif_partiel=True pour que retirer un créneau ne casse pas AUSSI,
    # accessoirement, la contrainte "un passage par discipline" (couverte
    # par un autre test ci-dessus) : ici on isole bien le remplissage exact
    # du quota lui-même.
    eleves = [eleve("E1"), eleve("E2"), eleve("E3")]
    quotas = [quota("K1", "Maths", "S1", heure_debut="14:00", duree_preparation=0, duree_kholle=20, nombre_eleves=2)]
    result = resoudre(eleves=eleves, quotas=quotas, effectif_partiel=True)
    assert result.statut == "SUCCES"
    creneaux_casses = [dict(c) for c in result.creneaux][:-1]  # supprime un créneau
    result_casse = SolveResult(statut="SUCCES", creneaux=creneaux_casses)

    with pytest.raises(AssertionError, match="attendu 2"):
        assert_toutes_contraintes_dures(eleves, quotas, result_casse, effectif_partiel=True)


def test_checker_detecte_un_eleve_avec_deux_passages_meme_discipline():
    # Utilise 2 disciplines pour que le double-passage soit détecté sans
    # être aussi, accessoirement, un chevauchement horaire (ce que
    # test_checker_detecte_un_chevauchement_eleve couvre déjà séparément).
    eleves = [eleve("E1")]
    quotas = [
        quota("K1", "Maths", "S1", heure_debut="14:00", duree_preparation=0, duree_kholle=20, nombre_eleves=1),
        quota("K2", "Physique", "S2", heure_debut="16:00", duree_preparation=0, duree_kholle=20, nombre_eleves=1),
    ]
    result = resoudre(eleves=eleves, quotas=quotas)
    assert result.statut == "SUCCES"
    creneau_maths = next(c for c in result.creneaux if c["disciplineId"] == "Maths")
    # Deuxième créneau de Maths, à un horaire différent pour ne pas non plus
    # créer un chevauchement (couvert par un autre test).
    creneau_maths_bis = dict(creneau_maths, heureDebut="20:00", heureFin="20:20", heureDebutPreparation="20:00")
    creneaux_casses = [dict(c) for c in result.creneaux] + [creneau_maths_bis]
    result_casse = SolveResult(statut="SUCCES", creneaux=creneaux_casses)

    with pytest.raises(AssertionError, match="attendu == 1"):
        assert_toutes_contraintes_dures(eleves, quotas, result_casse)


def test_checker_detecte_une_langue_non_eligible():
    eleves = [eleve("E1", lv1="Espagnol", lv2="Allemand")]
    quotas = [quota("K1", "Italien", "S1", heure_debut="14:00", duree_preparation=0, duree_kholle=20, nombre_eleves=1)]
    creneaux_casses = [
        {
            "kholleurId": "K1",
            "salleId": "S1",
            "disciplineId": "Italien",
            "date": "2027-01-04",
            "heureDebutPreparation": "14:00",
            "heureDebut": "14:00",
            "heureFin": "14:20",
            "eleveIds": ["E1"],
        }
    ]
    result_casse = SolveResult(statut="SUCCES", creneaux=creneaux_casses)

    with pytest.raises(AssertionError, match="alors qu'aucune de ses langues n'est offerte"):
        assert_toutes_contraintes_dures(eleves, quotas, result_casse, disciplines_langue={"Italien"})


def test_charge_kholleur_deja_entierement_fixee_par_les_quotas():
    """Note de comportement (pas un bug) : contrairement à la diversité ou à
    l'horaire, l'objectif d'équilibrage de charge des kholleurs n'a ici
    AUCUN levier de décision — le kholleur de chaque créneau est déjà fixé
    par le quota fourni par l'admin, jamais choisi par le solveur. charge_max
    est donc une constante pour un jeu de quotas donné, quel que soit
    l'historique_charge_kholleur : ce test le documente en vérifiant que la
    résolution reste SUCCES et cohérente même avec un historique extrême sur
    l'unique kholleur disponible (rien à équilibrer puisqu'il n'y a pas
    d'alternative)."""
    eleves = [eleve("E1"), eleve("E2")]
    quotas = [quota("K1", "Maths", "S1", nombre_eleves=2)]

    result = resoudre(eleves=eleves, quotas=quotas, historique_charge_kholleur={"K1": 500})

    assert_toutes_contraintes_dures(eleves, quotas, result)
