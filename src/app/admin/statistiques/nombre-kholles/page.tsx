import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GraphiqueAnneau } from "@/components/admin/GraphiqueAnneau";
import { SelecteurClasseOuToutes } from "@/components/admin/SelecteurClasseOuToutes";

export default async function NombreKhollesPage({
  searchParams,
}: {
  searchParams: Promise<{ classeId?: string }>;
}) {
  await requirePageSession(["ADMIN"]);
  const { classeId } = await searchParams;

  const classes = await prisma.classe.findMany({ orderBy: { nom: "asc" } });
  // "" = toutes les classes confondues ; un classeId invalide ou disparu
  // retombe aussi sur "toutes" plutôt que de planter.
  const classeValide = classeId && classes.some((c) => c.id === classeId) ? classeId : "";

  const [sessions, passages] = await Promise.all([
    prisma.sessionKholle.findMany({
      where: classeValide ? { classeId: classeValide } : undefined,
      select: { discipline: { select: { nom: true } } },
    }),
    // Khôlles dispensées = une ligne Passage par étudiant et par khôlle
    // (même convention que la colonne "Khôlles dispensées" de l'écran
    // Historique des plannings) : brouillons compris, pas seulement les
    // semaines déjà publiées. Filtré par la classe de la SESSION (pas de
    // l'élève lui-même) pour rester cohérent avec le filtre "sessions"
    // ci-dessus, et pour ne pas dépendre d'un élève ayant changé de classe
    // depuis.
    prisma.passage.findMany({
      where: classeValide ? { creneau: { sessionKholle: { classeId: classeValide } } } : undefined,
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

      <SelecteurClasseOuToutes
        classes={classes.map((c) => ({ id: c.id, nom: c.nom }))}
        classeIdActuelle={classeValide}
        basePath="/admin/statistiques/nombre-kholles"
      />

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
          Une khôlle dispensée = un passage d&apos;un étudiant devant un khôlleur.
        </p>
        <GraphiqueAnneau titre="Nombre de khôlles dispensées par discipline" donnees={khollesParDiscipline} />
      </div>
    </main>
  );
}
