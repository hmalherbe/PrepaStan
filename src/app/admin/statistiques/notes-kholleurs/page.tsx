import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function moyenne(vs: number[]): number {
  return vs.reduce((a, b) => a + b, 0) / (vs.length || 1);
}

export default async function NotesKholleursPage() {
  await requirePageSession(["ADMIN"]);

  // Toutes classes confondues (contrairement aux autres écrans Statistiques,
  // filtrés par classe) : un khôlleur khôllant plusieurs classes doit voir
  // ses notes agrégées, pas seulement celles de la classe sélectionnée.
  const passages = await prisma.passage.findMany({
    where: { note: { valeur: { not: null } } },
    select: {
      note: { select: { valeur: true } },
      creneau: { select: { kholleurId: true, kholleur: { select: { nom: true, prenom: true } } } },
    },
  });

  const notesParKholleur = new Map<string, { nom: string; valeurs: number[] }>();
  for (const p of passages) {
    const { kholleurId, kholleur } = p.creneau;
    const entree = notesParKholleur.get(kholleurId) ?? { nom: `${kholleur.prenom} ${kholleur.nom}`, valeurs: [] };
    entree.valeurs.push(Number(p.note!.valeur));
    notesParKholleur.set(kholleurId, entree);
  }

  const lignes = [...notesParKholleur.values()]
    .map(({ nom, valeurs }) => ({
      nom,
      min: Math.min(...valeurs),
      max: Math.max(...valeurs),
      moyenne: moyenne(valeurs),
      nbNotes: valeurs.length,
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom));

  return (
    <main className="container">
      <h1>Notes par khôlleur</h1>
      <p style={{ color: "#777", fontSize: "0.9rem" }}>
        Toutes classes confondues : note minimale, maximale, moyenne et nombre de notes attribuées par chaque
        khôlleur — utile pour repérer un correcteur nettement plus sévère ou plus généreux que les autres.
      </p>
      {lignes.length === 0 ? (
        <p>Aucune note saisie pour le moment.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Khôlleur</th>
              <th>Note min</th>
              <th>Note max</th>
              <th>Note moyenne</th>
              <th>Nombre de notes</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.nom}>
                <td>{l.nom}</td>
                <td>{l.min}</td>
                <td>{l.max}</td>
                <td>{l.moyenne.toFixed(2)}</td>
                <td>{l.nbNotes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
