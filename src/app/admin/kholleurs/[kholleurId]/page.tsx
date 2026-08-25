import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DisponibilitesKholleur } from "@/components/admin/DisponibilitesKholleur";

export default async function DetailKholleurPage({
  params,
}: {
  params: Promise<{ kholleurId: string }>;
}) {
  await requirePageSession(["ADMIN"]);
  const { kholleurId } = await params;

  const kholleur = await prisma.utilisateur.findUnique({
    where: { id: kholleurId },
    include: {
      competences: { include: { discipline: true } },
      disponibilites: { orderBy: [{ jourSemaine: "asc" }, { heureDebut: "asc" }] },
    },
  });
  if (!kholleur || kholleur.role !== "KHOLLEUR") notFound();

  return (
    <main className="container">
      <h1>
        {kholleur.prenom} {kholleur.nom}
      </h1>
      <p>Disciplines : {kholleur.competences.map((c) => c.discipline.nom).join(", ") || "aucune"}</p>
      <DisponibilitesKholleur
        kholleurId={kholleur.id}
        disponibilitesInitiales={kholleur.disponibilites.map((d) => ({
          id: d.id,
          jourSemaine: d.jourSemaine,
          heureDebut: d.heureDebut,
          heureFin: d.heureFin,
        }))}
      />
    </main>
  );
}
