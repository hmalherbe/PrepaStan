import { requirePageSession } from "@/lib/auth";
import { ComptePasswordForm } from "@/components/ComptePasswordForm";

export default async function ComptePage() {
  const session = await requirePageSession(["ADMIN", "KHOLLEUR", "PROFESSEUR_REFERENT", "ELEVE"]);

  return (
    <main>
      <h1>Mon compte</h1>
      <p>
        Connecté en tant que {session.user.prenom} {session.user.nom} ({session.user.email})
      </p>
      <h2>Changer mon mot de passe</h2>
      <ComptePasswordForm />
    </main>
  );
}
