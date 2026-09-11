import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NotesElevesTable } from "@/components/admin/NotesElevesTable";

export default async function NotesElevesPage({
  searchParams,
}: {
  searchParams: Promise<{ classeId?: string }>;
}) {
  await requirePageSession(["ADMIN"]);
  const { classeId: classeIdParam } = await searchParams;

  const classes = await prisma.classe.findMany({ orderBy: { nom: "asc" } });
  const classe = classeIdParam ? classes.find((c) => c.id === classeIdParam) : classes[0];

  if (!classe) {
    return (
      <main className="container">
        <h1>Notes par étudiant</h1>
        <p>Aucune classe créée pour le moment.</p>
      </main>
    );
  }

  const [eleves, disciplines, passages] = await Promise.all([
    prisma.eleve.findMany({ where: { classeId: classe.id }, orderBy: [{ nom: "asc" }, { prenom: "asc" }] }),
    prisma.discipline.findMany({
      where: { classes: { some: { classeId: classe.id } } },
      orderBy: { nom: "asc" },
    }),
    prisma.passage.findMany({
      where: {
        eleve: { classeId: classe.id },
        note: { valeur: { not: null } },
      },
      select: {
        eleveId: true,
        eleve: { select: { nom: true, prenom: true } },
        note: { select: { valeur: true } },
        creneau: {
          select: {
            kholleurId: true,
            kholleur: { select: { nom: true, prenom: true } },
            sessionKholle: {
              select: { semaine: true, disciplineId: true, discipline: { select: { nom: true } } },
            },
          },
        },
      },
    }),
  ]);

  const kholleursParId = new Map<string, { nom: string; prenom: string }>();
  for (const p of passages) {
    kholleursParId.set(p.creneau.kholleurId, p.creneau.kholleur);
  }
  const kholleurs = [...kholleursParId.entries()]
    .map(([id, k]) => ({ id, nom: `${k.prenom} ${k.nom}` }))
    .sort((a, b) => a.nom.localeCompare(b.nom));

  const notes = passages.map((p) => ({
    eleveId: p.eleveId,
    eleveNom: p.eleve.nom,
    elevePrenom: p.eleve.prenom,
    disciplineId: p.creneau.sessionKholle.disciplineId,
    disciplineNom: p.creneau.sessionKholle.discipline.nom,
    kholleurId: p.creneau.kholleurId,
    kholleurNom: `${p.creneau.kholleur.prenom} ${p.creneau.kholleur.nom}`,
    semaine: p.creneau.sessionKholle.semaine,
    valeur: Number(p.note!.valeur),
  }));

  return (
    <main className="container">
      <h1>Notes par étudiant</h1>
      <NotesElevesTable
        classes={classes.map((c) => ({ id: c.id, nom: c.nom }))}
        classeIdActuelle={classe.id}
        eleves={eleves.map((e) => ({ id: e.id, nom: `${e.prenom} ${e.nom}` }))}
        disciplines={disciplines.map((d) => ({ id: d.id, nom: d.nom }))}
        kholleurs={kholleurs}
        notes={notes}
      />
    </main>
  );
}
