import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { KholleursForm } from "@/components/admin/KholleursForm";

export default async function KholleursPage() {
  await requirePageSession(["ADMIN"]);

  const [kholleurs, disciplines] = await Promise.all([
    prisma.utilisateur.findMany({
      where: { roles: { has: "KHOLLEUR" } },
      include: { competences: { include: { discipline: true } }, _count: { select: { disponibilites: true } } },
      orderBy: [{ nom: "asc" }],
    }),
    prisma.discipline.findMany({ orderBy: { nom: "asc" } }),
  ]);

  return (
    <main className="container">
      <h1>Kholleurs</h1>
      <KholleursForm
        kholleursInitiaux={kholleurs.map((k) => ({
          id: k.id,
          nom: k.nom,
          prenom: k.prenom,
          email: k.email,
          disciplines: k.competences.map((c) => c.discipline.nom),
          disciplineIds: k.competences.map((c) => c.disciplineId),
          nbDisponibilites: k._count.disponibilites,
        }))}
        disciplines={disciplines.map((d) => ({ id: d.id, nom: d.nom }))}
      />
    </main>
  );
}
