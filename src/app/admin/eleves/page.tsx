import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ElevesForm } from "@/components/admin/ElevesForm";
import { ImportCsv } from "@/components/admin/ImportCsv";

export default async function ElevesPage() {
  await requirePageSession(["ADMIN"]);

  const [eleves, classes, languesVivantes] = await Promise.all([
    prisma.eleve.findMany({
      include: {
        classe: { select: { id: true, nom: true } },
        utilisateur: { select: { email: true } },
        lv1: { select: { id: true, nom: true } },
        lv2: { select: { id: true, nom: true } },
      },
      orderBy: [{ classe: { nom: "asc" } }, { nom: "asc" }],
    }),
    prisma.classe.findMany({ orderBy: { nom: "asc" } }),
    prisma.discipline.findMany({ where: { estLangueVivante: true }, orderBy: { nom: "asc" } }),
  ]);

  return (
    <main className="container">
      <h1>Étudiants</h1>
      <ImportCsv
        endpoint="/api/admin/eleves/import"
        colonnes="classe, nom, prenom, lv1, lv2, email"
        exemple={"classe,nom,prenom,lv1,lv2,email\nL1,Dupont,Marie,Anglais,Espagnol,marie.dupont@exemple.fr"}
      />
      <ElevesForm
        elevesInitiaux={eleves.map((e) => ({
          id: e.id,
          nom: e.nom,
          prenom: e.prenom,
          classeId: e.classeId,
          classe: e.classe.nom,
          lv1Id: e.lv1Id,
          lv1: e.lv1?.nom ?? null,
          lv2Id: e.lv2Id,
          lv2: e.lv2?.nom ?? null,
          aUnCompte: e.utilisateurId !== null,
          email: e.utilisateur?.email ?? null,
        }))}
        classes={classes.map((c) => ({ id: c.id, nom: c.nom }))}
        languesVivantes={languesVivantes.map((d) => ({ id: d.id, nom: d.nom }))}
      />
    </main>
  );
}
