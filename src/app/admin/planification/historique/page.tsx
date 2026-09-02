import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HistoriquePlanningsTable } from "@/components/admin/HistoriquePlanningsTable";

function formatDateUTC(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

function dimancheDeLaSemaine(lundi: Date): Date {
  const d = new Date(lundi);
  d.setUTCDate(d.getUTCDate() + 6);
  return d;
}

export default async function HistoriquePlanningsPage() {
  await requirePageSession(["ADMIN"]);

  const sessions = await prisma.sessionKholle.findMany({
    include: {
      classe: { select: { nom: true } },
      discipline: { select: { nom: true } },
      creneaux: {
        select: {
          kholleurId: true,
          kholleur: { select: { nom: true, prenom: true } },
          passages: { select: { eleveId: true } },
        },
      },
      validationGrilles: { select: { kholleurId: true, statut: true } },
    },
    orderBy: [{ dateDebut: "desc" }],
  });

  // Une seule requête pour tous les référents des (classe, discipline)
  // concernées, plutôt qu'une requête par session.
  const pairesClasseDiscipline = [...new Set(sessions.map((s) => `${s.classeId}|${s.disciplineId}`))].map((p) => {
    const [classeId, disciplineId] = p.split("|");
    return { classeId, disciplineId };
  });
  const referentsRows = pairesClasseDiscipline.length
    ? await prisma.professeurReferent.findMany({
        where: { OR: pairesClasseDiscipline },
        include: { utilisateur: { select: { id: true, nom: true, prenom: true } } },
      })
    : [];
  const referentsParPaire = new Map<string, { id: string; nom: string; prenom: string }[]>();
  for (const r of referentsRows) {
    const cle = `${r.classeId}_${r.disciplineId}`;
    const liste = referentsParPaire.get(cle) ?? [];
    liste.push({ id: r.utilisateur.id, nom: r.utilisateur.nom, prenom: r.utilisateur.prenom });
    referentsParPaire.set(cle, liste);
  }

  type Personne = { id: string; nom: string; prenom: string; discipline: string; valide: boolean };
  type Groupe = {
    classeId: string;
    classeNom: string;
    semaine: number;
    dateDebut: Date;
    disciplines: Set<string>;
    nbKholles: number;
    eleves: Set<string>;
    // clé = `${kholleurId}_${disciplineId}` ou `${referentId}_${disciplineId}`
    kholleurs: Map<string, Personne>;
    referents: Map<string, Personne>;
  };

  const groupes = new Map<string, Groupe>();
  for (const s of sessions) {
    const cle = `${s.classeId}_${s.semaine}`;
    let g = groupes.get(cle);
    if (!g) {
      g = {
        classeId: s.classeId,
        classeNom: s.classe.nom,
        semaine: s.semaine,
        dateDebut: s.dateDebut,
        disciplines: new Set(),
        nbKholles: 0,
        eleves: new Set(),
        kholleurs: new Map(),
        referents: new Map(),
      };
      groupes.set(cle, g);
    }
    g.disciplines.add(s.discipline.nom);

    const statutParKholleur = new Map(s.validationGrilles.map((v) => [v.kholleurId, v.statut]));
    for (const c of s.creneaux) {
      g.nbKholles += c.passages.length;
      for (const p of c.passages) g.eleves.add(p.eleveId);

      const cleKholleur = `${c.kholleurId}_${s.disciplineId}`;
      if (!g.kholleurs.has(cleKholleur)) {
        g.kholleurs.set(cleKholleur, {
          id: c.kholleurId,
          nom: c.kholleur.nom,
          prenom: c.kholleur.prenom,
          discipline: s.discipline.nom,
          valide: statutParKholleur.get(c.kholleurId) === "VALIDE",
        });
      }
    }

    const referentsDiscipline = referentsParPaire.get(`${s.classeId}_${s.disciplineId}`) ?? [];
    for (const r of referentsDiscipline) {
      const cleReferent = `${r.id}_${s.disciplineId}`;
      g.referents.set(cleReferent, {
        id: r.id,
        nom: r.nom,
        prenom: r.prenom,
        discipline: s.discipline.nom,
        valide: s.statut === "CLOTUREE",
      });
    }
  }

  const lignes = [...groupes.values()]
    .sort((a, b) => b.dateDebut.getTime() - a.dateDebut.getTime())
    .map((g) => {
      const tri = (a: Personne, b: Personne) => a.nom.localeCompare(b.nom) || a.discipline.localeCompare(b.discipline);
      return {
        classeId: g.classeId,
        classeNom: g.classeNom,
        semaine: g.semaine,
        periode: `${formatDateUTC(g.dateDebut)} – ${formatDateUTC(dimancheDeLaSemaine(g.dateDebut))}`,
        disciplines: [...g.disciplines].sort().join(", "),
        nbKholles: g.nbKholles,
        nbEleves: g.eleves.size,
        nbDisciplines: g.disciplines.size,
        kholleurs: [...g.kholleurs.values()].sort(tri),
        referents: [...g.referents.values()].sort(tri),
      };
    });

  return (
    <main className="container">
      <h1>Historique des plannings</h1>
      <HistoriquePlanningsTable lignes={lignes} />
    </main>
  );
}
