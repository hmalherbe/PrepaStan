import { ReinitialiserMotDePasseForm } from "@/components/ReinitialiserMotDePasseForm";

export default async function ReinitialiserMotDePassePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main>
      <h1>Réinitialisation du mot de passe</h1>
      <ReinitialiserMotDePasseForm token={token ?? ""} />
    </main>
  );
}
