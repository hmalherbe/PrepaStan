import Link from "next/link";
import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
      creneaux: { select: { passages: { select: { eleveId: true } } } },
    },
    orderBy: [{ dateDebut: "desc" }],
  });

  type Groupe = {
    classeId: string;
    classeNom: string;
    semaine: number;
    dateDebut: Date;
    disciplines: Set<string>;
    nbKholles: number;
    eleves: Set<string>;
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
      };
      groupes.set(cle, g);
    }
    g.disciplines.add(s.discipline.nom);
    for (const c of s.creneaux) {
      g.nbKholles += c.passages.length;
      for (const p of c.passages) g.eleves.add(p.eleveId);
    }
  }

  const lignes = [...groupes.values()].sort((a, b) => b.dateDebut.getTime() - a.dateDebut.getTime());

  return (
    <main className="container">
      <h1>Historique des plannings</h1>
      {lignes.length === 0 && <p>Aucun planning généré pour le moment.</p>}
      {lignes.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Semaine</th>
              <th>Classe</th>
              <th>Période</th>
              <th>Disciplines</th>
              <th>Khôlles dispensées</th>
              <th>Étudiants interrogés</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((g) => (
              <tr key={`${g.classeId}_${g.semaine}`}>
                <td>
                  <Link href={`/admin/planification/${g.classeId}/${g.semaine}`}>{g.semaine}</Link>
                </td>
                <td>{g.classeNom}</td>
                <td>
                  {formatDateUTC(g.dateDebut)} – {formatDateUTC(dimancheDeLaSemaine(g.dateDebut))}
                </td>
                <td>{[...g.disciplines].sort().join(", ")}</td>
                <td>{g.nbKholles}</td>
                <td>{g.eleves.size}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
