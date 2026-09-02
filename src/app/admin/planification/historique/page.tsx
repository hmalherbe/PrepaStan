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
          passages: { select: { eleveId: true, note: { select: { valeur: true, appreciation: true } } } },
        },
      },
    },
    orderBy: [{ dateDebut: "desc" }],
  });

  type Kholleur = { id: string; nom: string; prenom: string; total: number; termines: number };
  type Groupe = {
    classeId: string;
    classeNom: string;
    semaine: number;
    dateDebut: Date;
    disciplines: Set<string>;
    nbKholles: number;
    eleves: Set<string>;
    toutesSessionsCloturees: boolean;
    kholleurs: Map<string, Kholleur>;
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
        toutesSessionsCloturees: true,
        kholleurs: new Map(),
      };
      groupes.set(cle, g);
    }
    g.disciplines.add(s.discipline.nom);
    if (s.statut !== "CLOTUREE") g.toutesSessionsCloturees = false;
    for (const c of s.creneaux) {
      g.nbKholles += c.passages.length;
      let k = g.kholleurs.get(c.kholleurId);
      if (!k) {
        k = { id: c.kholleurId, nom: c.kholleur.nom, prenom: c.kholleur.prenom, total: 0, termines: 0 };
        g.kholleurs.set(c.kholleurId, k);
      }
      for (const p of c.passages) {
        g.eleves.add(p.eleveId);
        k.total += 1;
        if (p.note?.valeur != null && p.note?.appreciation) k.termines += 1;
      }
    }
  }

  const lignes = [...groupes.values()]
    .sort((a, b) => b.dateDebut.getTime() - a.dateDebut.getTime())
    .map((g) => {
      const kholleursTermines = [...g.kholleurs.values()]
        .filter((k) => k.total > 0 && k.termines === k.total)
        .map((k) => ({ id: k.id, nom: k.nom, prenom: k.prenom }))
        .sort((a, b) => a.nom.localeCompare(b.nom));

      return {
        classeId: g.classeId,
        classeNom: g.classeNom,
        semaine: g.semaine,
        periode: `${formatDateUTC(g.dateDebut)} – ${formatDateUTC(dimancheDeLaSemaine(g.dateDebut))}`,
        disciplines: [...g.disciplines].sort().join(", "),
        nbKholles: g.nbKholles,
        nbEleves: g.eleves.size,
        etatTermine: g.toutesSessionsCloturees,
        kholleursTermines,
      };
    });

  return (
    <main className="container">
      <h1>Historique des plannings</h1>
      <HistoriquePlanningsTable lignes={lignes} />
    </main>
  );
}
