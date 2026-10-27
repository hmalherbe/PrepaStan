import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function moyenne(vs: number[]): number {
  return vs.reduce((a, b) => a + b, 0) / (vs.length || 1);
}

function stats(valeurs: number[]) {
  return {
    min: Math.min(...valeurs),
    max: Math.max(...valeurs),
    moyenne: moyenne(valeurs),
    nbNotes: valeurs.length,
  };
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
      creneau: {
        select: {
          kholleurId: true,
          kholleur: { select: { nom: true, prenom: true } },
          sessionKholle: { select: { disciplineId: true, discipline: { select: { nom: true } } } },
        },
      },
    },
  });

  // Arborescence à deux niveaux : discipline, puis khôlleur. Un même
  // khôlleur khôllant plusieurs disciplines apparaît sous chacune, avec ses
  // stats propres à cette discipline (pas ses stats toutes disciplines
  // confondues, voir la vue par khôlleur seul plus bas).
  const parDiscipline = new Map<
    string,
    { nom: string; valeurs: number[]; parKholleur: Map<string, { nom: string; valeurs: number[] }> }
  >();
  for (const p of passages) {
    const { disciplineId, discipline } = p.creneau.sessionKholle;
    const { kholleurId, kholleur } = p.creneau;
    const valeur = Number(p.note!.valeur);

    const entreeDiscipline = parDiscipline.get(disciplineId) ?? {
      nom: discipline.nom,
      valeurs: [],
      parKholleur: new Map<string, { nom: string; valeurs: number[] }>(),
    };
    entreeDiscipline.valeurs.push(valeur);

    const entreeKholleur = entreeDiscipline.parKholleur.get(kholleurId) ?? {
      nom: `${kholleur.prenom} ${kholleur.nom}`,
      valeurs: [],
    };
    entreeKholleur.valeurs.push(valeur);
    entreeDiscipline.parKholleur.set(kholleurId, entreeKholleur);

    parDiscipline.set(disciplineId, entreeDiscipline);
  }

  const arbre = [...parDiscipline.values()]
    .map((d) => ({
      nom: d.nom,
      ...stats(d.valeurs),
      kholleurs: [...d.parKholleur.values()]
        .map((k) => ({ nom: k.nom, ...stats(k.valeurs) }))
        .sort((a, b) => a.nom.localeCompare(b.nom)),
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom));

  return (
    <main className="container">
      <h1>Notes par khôlleur</h1>
      <p style={{ color: "#777", fontSize: "0.9rem" }}>
        Toutes classes confondues, regroupé par discipline puis par khôlleur (cliquez sur une discipline pour
        la déplier) : note minimale, maximale, moyenne et nombre de notes attribuées — utile pour repérer un
        correcteur nettement plus sévère ou plus généreux que les autres sur une même discipline.
      </p>
      {arbre.length === 0 ? (
        <p>Aucune note saisie pour le moment.</p>
      ) : (
        <div className="arbre-stats">
          {arbre.map((d) => (
            <details key={d.nom} className="arbre-noeud">
              <summary>
                <span className="arbre-noeud-nom">{d.nom}</span>
                <span className="arbre-noeud-stats">
                  min {d.min} · max {d.max} · moyenne {d.moyenne.toFixed(2)} · {d.nbNotes} note(s)
                </span>
              </summary>
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
                  {d.kholleurs.map((k) => (
                    <tr key={k.nom}>
                      <td>{k.nom}</td>
                      <td>{k.min}</td>
                      <td>{k.max}</td>
                      <td>{k.moyenne.toFixed(2)}</td>
                      <td>{k.nbNotes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ))}
        </div>
      )}
    </main>
  );
}
