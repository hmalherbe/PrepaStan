import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ElevesForm } from "@/components/admin/ElevesForm";

export default async function ElevesPage() {
  await requirePageSession(["ADMIN"]);

  const [eleves, classes] = await Promise.all([
    prisma.eleve.findMany({
      include: { classe: { select: { id: true, nom: true } }, utilisateur: { select: { email: true } } },
      orderBy: [{ classe: { nom: "asc" } }, { nom: "asc" }],
    }),
    prisma.classe.findMany({ orderBy: { nom: "asc" } }),
  ]);

  return (
    <main className="container">
      <h1>Étudiants</h1>
      <ElevesForm
        elevesInitiaux={eleves.map((e) => ({
          id: e.id,
          nom: e.nom,
          prenom: e.prenom,
          classeId: e.classeId,
          classe: e.classe.nom,
          aUnCompte: e.utilisateurId !== null,
          email: e.utilisateur?.email ?? null,
        }))}
        classes={classes.map((c) => ({ id: c.id, nom: c.nom }))}
      />
    </main>
  );
}
