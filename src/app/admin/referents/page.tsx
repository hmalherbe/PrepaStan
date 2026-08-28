import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReferentsForm } from "@/components/admin/ReferentsForm";

export default async function ReferentsPage() {
  await requirePageSession(["ADMIN"]);

  const [referents, classes, disciplines, comptesExistants] = await Promise.all([
    prisma.professeurReferent.findMany({
      include: { utilisateur: true, discipline: true, classe: true },
      orderBy: [{ classe: { nom: "asc" } }],
    }),
    prisma.classe.findMany({
      include: { disciplines: { include: { discipline: true } } },
      orderBy: { nom: "asc" },
    }),
    prisma.discipline.findMany({ orderBy: { nom: "asc" } }),
    prisma.utilisateur.findMany({
      where: { role: "PROFESSEUR_REFERENT" },
      select: { id: true, nom: true, prenom: true, email: true },
      orderBy: [{ nom: "asc" }],
    }),
  ]);

  return (
    <main className="container">
      <h1>Professeurs référents</h1>
      <ReferentsForm
        referentsInitiaux={referents.map((r) => ({
          id: r.id,
          nom: r.utilisateur.nom,
          prenom: r.utilisateur.prenom,
          email: r.utilisateur.email,
          classeId: r.classeId,
          classe: r.classe.nom,
          disciplineId: r.disciplineId,
          discipline: r.discipline.nom,
        }))}
        classes={classes.map((c) => ({
          id: c.id,
          nom: c.nom,
          disciplines: c.disciplines.map((cd) => ({ id: cd.discipline.id, nom: cd.discipline.nom })),
        }))}
        disciplines={disciplines.map((d) => ({ id: d.id, nom: d.nom }))}
        comptesExistants={comptesExistants}
      />
    </main>
  );
}
