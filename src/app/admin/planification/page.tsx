import { requirePageSession } from "@/lib/auth";
import { dureesParDefaut } from "@/lib/parametresDiscipline";
import { prisma } from "@/lib/prisma";
import { GenererPlanningForm } from "@/components/admin/GenererPlanningForm";

export default async function PlanificationPage({
  searchParams,
}: {
  searchParams: Promise<{ classeId?: string; date?: string }>;
}) {
  await requirePageSession(["ADMIN"]);
  const { classeId: classeIdParam, date: dateParam } = await searchParams;

  const [classes, salles, chargeParKholleur, parametresDiscipline] = await Promise.all([
    prisma.classe.findMany({
      orderBy: { nom: "asc" },
      include: {
        eleves: { select: { id: true, nom: true, prenom: true, lv1Id: true, lv2Id: true } },
        referents: true,
        disciplines: {
          include: {
            discipline: {
              include: {
                competences: {
                  include: { kholleur: { select: { id: true, nom: true, prenom: true } } },
                },
                referents: {
                  include: { utilisateur: { select: { id: true, nom: true, prenom: true } } },
                },
              },
            },
          },
        },
      },
    }),
    prisma.salle.findMany({ orderBy: { nom: "asc" } }),
    // Nombre de créneaux déjà publiés par kholleur (tous temps confondus) :
    // sert uniquement à trier les listes déroulantes de kholleurs ci-dessous
    // (les moins sollicités en premier), pour inciter naturellement l'admin
    // à mieux répartir la charge — le solveur, lui, ne choisit jamais le
    // kholleur d'un quota (fixé par l'admin), voir solver.py.
    prisma.creneau.groupBy({
      by: ["kholleurId"],
      where: { sessionKholle: { statut: { not: "PLANIFICATION" } } },
      _count: { id: true },
    }),
    // Durées de préparation/khôlle propres à chaque (classe, discipline) —
    // voir écran Paramètres — sert à GenererPlanningForm pour calculer
    // l'heure de fin de la dernière khôlle de chaque ligne de quota.
    prisma.parametreDiscipline.findMany(),
  ]);
  const chargeParKholleurId = new Map(chargeParKholleur.map((c) => [c.kholleurId, c._count.id]));
  const parametreParClasseDiscipline = new Map(
    parametresDiscipline.map((p) => [`${p.classeId}|${p.disciplineId}`, p])
  );

  const classesAvecDisciplines = classes.map((c) => ({
    id: c.id,
    nom: c.nom,
    effectif: c.eleves.length,
    // LV1/LV2 de chaque élève : sert à GenererPlanningForm pour calculer
    // l'effectif attendu propre à chaque discipline de langue (un
    // sous-groupe de la classe, pas la classe entière — voir aussi
    // nbElevesParDiscipline sur l'écran Classes).
    eleves: c.eleves
      .map((e) => ({ id: e.id, nom: `${e.prenom} ${e.nom}`, lv1Id: e.lv1Id, lv2Id: e.lv2Id }))
      .sort((a, b) => a.nom.localeCompare(b.nom)),
    disciplines: c.disciplines.map((cd) => {
      const referentsUniques = new Map(
        cd.discipline.referents.map((r) => [
          r.utilisateur.id,
          { id: r.utilisateur.id, nom: `${r.utilisateur.prenom} ${r.utilisateur.nom}` },
        ])
      );
      const referentActuel = c.referents.find((r) => r.disciplineId === cd.disciplineId);
      const parametre = parametreParClasseDiscipline.get(`${c.id}|${cd.disciplineId}`);
      const { dureePreparationMinutes, dureeKholleMinutes } =
        parametre ?? dureesParDefaut(cd.discipline.estLangueVivante);
      return {
        id: cd.discipline.id,
        nom: cd.discipline.nom,
        estLangueVivante: cd.discipline.estLangueVivante,
        dureePreparationMinutes,
        dureeKholleMinutes,
        kholleurs: cd.discipline.competences
          .map((comp) => ({
            id: comp.kholleur.id,
            nom: `${comp.kholleur.prenom} ${comp.kholleur.nom}`,
            charge: chargeParKholleurId.get(comp.kholleur.id) ?? 0,
          }))
          .sort((a, b) => a.charge - b.charge || a.nom.localeCompare(b.nom))
          .map(({ id, nom }) => ({ id, nom })),
        referents: [...referentsUniques.values()],
        referentActuelId: referentActuel?.utilisateurId ?? null,
      };
    }),
  }));

  return (
    <main className="container">
      <h1>Générer le planning</h1>
      <GenererPlanningForm
        classes={classesAvecDisciplines}
        salles={salles.map((s) => ({ id: s.id, nom: s.nom }))}
        classeIdInitiale={classeIdParam}
        dateDebutSemaineInitiale={dateParam}
      />
    </main>
  );
}
