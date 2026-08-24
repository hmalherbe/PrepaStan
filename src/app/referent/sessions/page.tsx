import Link from "next/link";
import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/components/StatusBadge";

export default async function ReferentSessionsPage() {
  const session = await requirePageSession(["PROFESSEUR_REFERENT"]);

  const referents = await prisma.professeurReferent.findMany({
    where: { utilisateurId: session.user.id },
  });

  const sessions = await prisma.sessionKholle.findMany({
    where: {
      OR: referents.map((r) => ({ classeId: r.classeId, disciplineId: r.disciplineId })),
    },
    include: {
      classe: true,
      discipline: true,
      creneaux: { select: { kholleurId: true }, distinct: ["kholleurId"] },
      validationReferent: true,
    },
    orderBy: [{ semaine: "desc" }],
  });

  const sessionIds = sessions.map((s) => s.id);
  const validationsGrilles = await prisma.validationGrille.findMany({
    where: { sessionKholleId: { in: sessionIds } },
  });

  return (
    <main className="container">
      <h1>Sessions à valider</h1>
      <table>
        <thead>
          <tr>
            <th>Semaine</th>
            <th>Classe</th>
            <th>Discipline</th>
            <th>Kholleurs validés</th>
            <th>Statut</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => {
            const total = s.creneaux.length;
            const valides = validationsGrilles.filter(
              (v) => v.sessionKholleId === s.id && v.statut === "VALIDE"
            ).length;
            return (
              <tr key={s.id}>
                <td>{s.semaine}</td>
                <td>{s.classe.nom}</td>
                <td>{s.discipline.nom}</td>
                <td>
                  {valides}/{total}
                  <div className="barre-progression" style={{ marginTop: 4 }}>
                    <div style={{ width: total ? `${(valides / total) * 100}%` : "0%" }} />
                  </div>
                </td>
                <td>
                  <StatusBadge statut={s.validationReferent?.statut === "VALIDE" ? "VALIDE" : "EN_ATTENTE"} />
                </td>
                <td>
                  <Link href={`/referent/sessions/${s.id}`}>Ouvrir</Link>
                </td>
              </tr>
            );
          })}
          {sessions.length === 0 && (
            <tr>
              <td colSpan={6}>Aucune session pour le moment.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
