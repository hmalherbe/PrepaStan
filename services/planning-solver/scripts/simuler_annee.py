"""Simulation d'une année scolaire complète pour valider empiriquement les
objectifs "soft" du solveur (diversité des kholleurs, équilibrage des
horaires, équirépartition de la charge) sur la durée, pas seulement sur une
semaine isolée.

Principe : on appelle resoudre() semaine après semaine sur un scénario
synthétique, en faisant vivre l'historique (comme le ferait vraiment
calculerHistorique() côté Next.js à partir des sessions déjà publiées), puis
on calcule des statistiques (moyenne, écart-type, min, max) sur les
comptages qui nous intéressent.

Usage :
    cd services/planning-solver
    pip install -r requirements.txt
    python scripts/simuler_annee.py
"""

import statistics
import sys
from collections import defaultdict
from datetime import datetime, timedelta

sys.path.insert(0, ".")
from app.solver import resoudre  # noqa: E402

# ---------- Paramètres du scénario ----------
N_ELEVES = 20
N_KHOLLEURS_PAR_DISCIPLINE = 3
N_SEMAINES = 32  # ~ une année scolaire de khôlles (hors vacances)
DISCIPLINES = ["Maths", "Physique", "Anglais"]

eleves = [{"id": f"E{i}"} for i in range(N_ELEVES)]
salles = [{"id": f"S{i}"} for i in range(5)]

kholleurs_par_discipline: dict[str, list[str]] = {
    d: [f"{d}_K{i}" for i in range(N_KHOLLEURS_PAR_DISCIPLINE)] for d in DISCIPLINES
}
competences = [
    {"kholleurId": k, "disciplineId": d} for d, kholleurs in kholleurs_par_discipline.items() for k in kholleurs
]


def disponibilites_semaine(date_lundi: datetime) -> list[dict]:
    """Chaque kholleur est disponible 14h-18h le jour de sa discipline,
    toutes les semaines (disponibilité récurrente simulée par génération
    d'une disponibilité ponctuelle fraîche à chaque semaine)."""
    jour = date_lundi.strftime("%Y-%m-%d")
    return [
        {"kholleurId": k, "date": jour, "heureDebut": "14:00", "heureFin": "18:00"}
        for kholleurs in kholleurs_par_discipline.values()
        for k in kholleurs
    ]


def main() -> None:
    historique_eleve_kholleur: dict[str, int] = defaultdict(int)
    historique_charge_kholleur: dict[str, int] = defaultdict(int)
    historique_tardif_eleve: dict[str, int] = defaultdict(int)

    date_lundi = datetime(2025, 9, 1)
    semaines_infaisables = 0

    for semaine in range(N_SEMAINES):
        discipline_semaine = DISCIPLINES[semaine % len(DISCIPLINES)]

        resultat = resoudre(
            eleves=eleves,
            disponibilites=disponibilites_semaine(date_lundi),
            competences=competences,
            salles=salles,
            disciplines_semaine=[discipline_semaine],
            historique_eleve_kholleur=dict(historique_eleve_kholleur),
            historique_charge_kholleur=dict(historique_charge_kholleur),
            historique_tardif_eleve=dict(historique_tardif_eleve),
            max_temps_secondes=10.0,
        )

        if resultat.statut != "SUCCES":
            semaines_infaisables += 1
            print(f"Semaine {semaine + 1:2d} ({discipline_semaine}) : {resultat.statut} — {resultat.message}")
        else:
            for c in resultat.creneaux:
                historique_charge_kholleur[c["kholleurId"]] += 1
                tardif = c["heureDebut"] >= "17:00"
                for eleve_id in c["eleveIds"]:
                    historique_eleve_kholleur[f"{eleve_id}|{c['disciplineId']}|{c['kholleurId']}"] += 1
                    if tardif:
                        historique_tardif_eleve[eleve_id] += 1

        date_lundi += timedelta(days=7)

    print(f"\n{N_SEMAINES} semaines simulées, {semaines_infaisables} infaisable(s).\n")
    rapport(historique_eleve_kholleur, historique_charge_kholleur, historique_tardif_eleve)


def rapport(
    historique_eleve_kholleur: dict[str, int],
    historique_charge_kholleur: dict[str, int],
    historique_tardif_eleve: dict[str, int],
) -> None:
    def stats(valeurs: list[float], label: str) -> None:
        if not valeurs:
            print(f"{label} : aucune donnée")
            return
        print(
            f"{label} : moyenne={statistics.mean(valeurs):.2f}  "
            f"écart-type={statistics.pstdev(valeurs):.2f}  "
            f"min={min(valeurs):.2f}  max={max(valeurs):.2f}"
        )

    print("=== Équirépartition de la charge des kholleurs (par discipline) ===")
    for discipline, kholleurs in kholleurs_par_discipline.items():
        charges = [historique_charge_kholleur.get(k, 0) for k in kholleurs]
        stats(charges, f"  {discipline:10s}")

    print("\n=== Diversité des kholleurs par élève (par discipline) ===")
    print("(écart-type du nombre de fois où un élève retombe sur un même")
    print(" kholleur de la discipline ; 0 = parfaitement réparti)")
    for discipline, kholleurs in kholleurs_par_discipline.items():
        ecarts_types = []
        for e in eleves:
            comptages = [historique_eleve_kholleur.get(f"{e['id']}|{discipline}|{k}", 0) for k in kholleurs]
            if sum(comptages) > 0:
                ecarts_types.append(statistics.pstdev(comptages))
        stats(ecarts_types, f"  {discipline:10s}")

    print("\n=== Équilibrage des horaires de passage ===")
    print("(nombre de créneaux tardifs >= 17h reçus par élève sur l'année)")
    valeurs_tardif = [historique_tardif_eleve.get(e["id"], 0) for e in eleves]
    stats(valeurs_tardif, "  Tous élèves")


if __name__ == "__main__":
    main()
