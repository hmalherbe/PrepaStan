import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SallesForm } from "@/components/admin/SallesForm";

export default async function SallesPage() {
  await requirePageSession(["ADMIN"]);

  const salles = await prisma.salle.findMany({
    include: { _count: { select: { creneaux: true } } },
    orderBy: { nom: "asc" },
  });

  return (
    <main className="container">
      <h1>Salles</h1>
      <SallesForm
        sallesInitiales={salles.map((s) => ({ id: s.id, nom: s.nom, nbCreneaux: s._count.creneaux }))}
      />
    </main>
  );
}
