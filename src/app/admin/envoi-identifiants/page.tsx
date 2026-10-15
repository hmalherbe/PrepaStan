import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EnvoiIdentifiantsForm } from "@/components/admin/EnvoiIdentifiantsForm";

export default async function EnvoiIdentifiantsPage() {
  await requirePageSession(["ADMIN"]);

  const utilisateurs = await prisma.utilisateur.findMany({
    where: {
      OR: [
        { roles: { hasSome: ["KHOLLEUR", "PROFESSEUR_REFERENT"] } },
        // Un compte ELEVE orphelin (non rattaché à une fiche élève via
        // Eleve.utilisateurId) n'est joignable par personne : exclu, sinon
        // il apparaîtrait comme un doublon fantôme à côté du vrai compte de
        // l'étudiant (voir aussi la page Étudiants, qui elle part toujours
        // de la fiche élève et ne peut donc pas montrer ce genre d'orphelin).
        { roles: { has: "ELEVE" }, eleve: { isNot: null } },
      ],
    },
    select: { id: true, nom: true, prenom: true, email: true, roles: true, derniereConnexion: true },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
  });

  return (
    <main className="container">
      <h1>Envoi des identifiants de connexion</h1>
      <div className="carte">
        <p>
          Envoie à chaque personne sélectionnée un email avec un lien à usage unique (valable 7 jours) pour
          choisir elle-même son mot de passe avant sa première connexion — jamais un mot de passe en clair.
          C&apos;est le même mécanisme que l&apos;email reçu automatiquement à la création d&apos;un compte,
          ici déclenchable à nouveau pour des comptes déjà existants.
        </p>
        <p>
          <strong>Colonne « Dernière connexion »</strong> : ce suivi vient d&apos;être mis en place, donc un
          compte qui l&apos;utilise déjà depuis longtemps peut tout de même apparaître « jamais connecté »
          tant qu&apos;il ne s&apos;est pas reconnecté depuis. Les cases sont pré-cochées uniquement pour ces
          comptes « jamais connecté » — décochez ceux que vous savez déjà actifs avant d&apos;envoyer.
        </p>
      </div>
      <EnvoiIdentifiantsForm
        utilisateurs={utilisateurs.map((u) => ({
          id: u.id,
          nom: u.nom,
          prenom: u.prenom,
          email: u.email,
          roles: u.roles,
          derniereConnexion: u.derniereConnexion?.toISOString() ?? null,
        }))}
      />
    </main>
  );
}
