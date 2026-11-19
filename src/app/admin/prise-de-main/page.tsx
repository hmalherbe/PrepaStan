import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PriseDeMainForm } from "@/components/admin/PriseDeMainForm";

export default async function PriseDeMainPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  await requirePageSession(["ADMIN"]);
  const { email } = await searchParams;

  // Comptes qu'on peut effectivement incarner (jamais un compte uniquement
  // ADMIN) — sert à proposer des suggestions dans le champ email, pas à
  // restreindre la saisie : le serveur revalide de toute façon à la
  // connexion.
  const personnes = await prisma.utilisateur.findMany({
    where: { roles: { hasSome: ["KHOLLEUR", "PROFESSEUR_REFERENT", "ELEVE"] } },
    select: { email: true, nom: true, prenom: true },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
  });

  return (
    <main className="container">
      <h1>Prendre la main sur un profil</h1>
      <div className="carte">
        <p>
          Permet de se connecter temporairement en tant qu&apos;un étudiant, un khôlleur ou un professeur
          référent — par exemple pour vérifier ce qu&apos;il voit, ou l&apos;aider à distance. Il suffit de son
          email, sans connaître ni ressaisir aucun mot de passe. Réservé aux administrateurs ; impossible sur un
          compte administrateur.
        </p>
      </div>
      <PriseDeMainForm emailInitial={email ?? ""} personnes={personnes} />
    </main>
  );
}
