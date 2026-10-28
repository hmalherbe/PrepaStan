import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GraphiqueAnneau } from "@/components/admin/GraphiqueAnneau";

export default async function NombreKhollesPage() {
  await requirePageSession(["ADMIN"]);

  const [sessions, passages] = await Promise.all([
    prisma.sessionKholle.findMany({ select: { discipline: { select: { nom: true } } } }),
    // Khôlles dispensées = une ligne Passage par étudiant et par khôlle
    // (même convention que la colonne "Khôlles dispensées" de l'écran
    // Historique des plannings) : brouillons compris, pas seulement les
    // semaines déjà publiées.
    prisma.passage.findMany({
      select: { creneau: { select: { sessionKholle: { select: { discipline: { select: { nom: true } } } } } } },
    }),
  ]);

  function compter<T>(lignes: T[], disciplineNom: (ligne: T) => string) {
    const parDiscipline = new Map<string, number>();
    for (const l of lignes) {
      const nom = disciplineNom(l);
      parDiscipline.set(nom, (parDiscipline.get(nom) ?? 0) + 1);
    }
    return [...parDiscipline.entries()]
      .map(([label, valeur]) => ({ label, valeur }))
      .sort((a, b) => b.valeur - a.valeur);
  }

  const sessionsParDiscipline = compter(sessions, (s) => s.discipline.nom);
  const khollesParDiscipline = compter(passages, (p) => p.creneau.sessionKholle.discipline.nom);

  return (
    <main className="container">
      <h1>Nombre de khôlles</h1>

      <div className="carte">
        <h2>Nombre de sessions par discipline</h2>
        <p style={{ color: "var(--couleur-texte-discret)", fontSize: "0.9rem", marginTop: -8 }}>
          Une session = une (classe, discipline, semaine) planifiée, brouillon ou publiée.
        </p>
        <GraphiqueAnneau titre="Nombre de sessions par discipline" donnees={sessionsParDiscipline} />
      </div>

      <div className="carte">
        <h2>Nombre de khôlles dispensées par discipline</h2>
        <p style={{ color: "var(--couleur-texte-discret)", fontSize: "0.9rem", marginTop: -8 }}>
          Une khôlle dispensée = un passage d&apos;un étudiant devant un khôlleur, toutes classes confondues.
        </p>
        <GraphiqueAnneau titre="Nombre de khôlles dispensées par discipline" donnees={khollesParDiscipline} />
      </div>
    </main>
  );
}
