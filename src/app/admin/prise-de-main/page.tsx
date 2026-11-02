import { requirePageSession } from "@/lib/auth";
import { PriseDeMainForm } from "@/components/admin/PriseDeMainForm";

export default async function PriseDeMainPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  await requirePageSession(["ADMIN"]);
  const { email } = await searchParams;

  return (
    <main className="container">
      <h1>Prendre la main sur un profil</h1>
      <div className="carte">
        <p>
          Permet de se connecter temporairement en tant qu&apos;un étudiant, un khôlleur ou un professeur
          référent — par exemple pour vérifier ce qu&apos;il voit, ou l&apos;aider à distance. Authentifié par
          <strong> votre</strong> mot de passe administrateur, jamais celui de la personne. Impossible sur un
          compte administrateur.
        </p>
      </div>
      <PriseDeMainForm emailInitial={email ?? ""} />
    </main>
  );
}
