import Link from "next/link";
import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/components/StatusBadge";

export default async function KholleurSessionsPage() {
  const session = await requirePageSession(["KHOLLEUR"]);
  const kholleurId = session.user.id;

  const sessions = await prisma.sessionKholle.findMany({
    where: { creneaux: { some: { kholleurId } } },
    include: { classe: true, discipline: true },
    orderBy: [{ semaine: "desc" }],
  });

  const validations = await prisma.validationGrille.findMany({
    where: { kholleurId, sessionKholleId: { in: sessions.map((s) => s.id) } },
  });
  const statutParSession = new Map(validations.map((v) => [v.sessionKholleId, v.statut]));

  return (
    <main className="container">
      <h1>Mes sessions de khôlle</h1>
      <table>
        <thead>
          <tr>
            <th>Semaine</th>
            <th>Classe</th>
            <th>Discipline</th>
            <th>Statut</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id}>
              <td>{s.semaine}</td>
              <td>{s.classe.nom}</td>
              <td>{s.discipline.nom}</td>
              <td>
                {/* CLOTUREE = le référent a validé : seul ce moment gèle
                    réellement la grille de ce kholleur pour cette session
                    (voir GrilleForm.tsx), donc "Gelée" prime sur son propre
                    statut de validation. */}
                <StatusBadge statut={s.statut === "CLOTUREE" ? "GELEE" : statutParSession.get(s.id) ?? "EN_ATTENTE"} />
              </td>
              <td>
                <Link href={`/kholleur/sessions/${s.id}`}>Ouvrir</Link>
              </td>
            </tr>
          ))}
          {sessions.length === 0 && (
            <tr>
              <td colSpan={5}>Aucune session pour le moment.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
