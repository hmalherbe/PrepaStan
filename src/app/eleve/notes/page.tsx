import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function NotesElevePage() {
  const session = await requirePageSession(["ELEVE"]);

  const eleve = await prisma.eleve.findUnique({ where: { utilisateurId: session.user.id } });
  if (!eleve) notFound();

  // Les khôlles déjà passées sont listées dès leur publication (pas
  // seulement une fois entièrement validées) pour que l'élève voie que sa
  // khôlle a bien eu lieu, avec un statut "En attente" tant que le
  // kholleur/référent n'a pas terminé — plutôt que de la faire disparaître
  // entièrement jusqu'à validation complète.
  const passages = await prisma.passage.findMany({
    where: {
      eleveId: eleve.id,
      creneau: {
        date: { lte: new Date() },
        sessionKholle: { statut: { not: "PLANIFICATION" } },
      },
    },
    include: {
      note: { select: { valeur: true, appreciation: true, fichierNom: true } },
      creneau: { include: { sessionKholle: { include: { discipline: true, validationReferent: true } } } },
    },
    orderBy: [{ creneau: { date: "desc" } }],
  });

  return (
    <main className="container">
      <h1>Mes notes</h1>
      <table>
        <thead>
          <tr>
            <th>Semaine</th>
            <th>Discipline</th>
            <th>Date</th>
            <th>Note</th>
            <th>Appréciation</th>
            <th>Pièce jointe</th>
          </tr>
        </thead>
        <tbody>
          {passages.map((p) => {
            const valide = p.creneau.sessionKholle.validationReferent?.statut === "VALIDE";
            return (
              <tr key={p.id}>
                <td>{p.creneau.sessionKholle.semaine}</td>
                <td>{p.creneau.sessionKholle.discipline.nom}</td>
                <td>{p.creneau.date.toLocaleDateString("fr-FR")}</td>
                {valide ? (
                  <>
                    <td>{p.note?.valeur ? Number(p.note.valeur) : "—"}</td>
                    <td>{p.note?.appreciation || "—"}</td>
                    <td>
                      {p.note?.fichierNom ? (
                        <a href={`/api/passages/${p.id}/fichier`} target="_blank" rel="noreferrer">
                          {p.note.fichierNom}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </>
                ) : (
                  <td colSpan={3} style={{ color: "#777" }}>
                    En attente
                  </td>
                )}
              </tr>
            );
          })}
          {passages.length === 0 && (
            <tr>
              <td colSpan={6}>Aucune khôlle passée pour le moment.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
