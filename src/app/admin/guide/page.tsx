import { requirePageSession } from "@/lib/auth";

export default async function GuidePage() {
  await requirePageSession(["ADMIN"]);

  return (
    <main className="container">
      <h1>Guide d&apos;utilisation</h1>

      <div className="carte">
        <p>
          Cette page est réservée aux administrateurs. Elle explique comment gérer PrepaStan au quotidien, et
          détaille aussi ce que voient et font les khôlleurs, les professeurs référents et les étudiants — pour que
          vous puissiez répondre à leurs questions ou reprendre certains passages dans un message d&apos;accueil.
        </p>
      </div>

      <div className="carte">
        <h2>Vue d&apos;ensemble</h2>
        <p>
          PrepaStan organise les khôlles (colles) d&apos;une classe préparatoire, semaine par semaine. Le cycle
          habituel :
        </p>
        <ol>
          <li>
            L&apos;admin fixe les quotas de la semaine (qui khôlle quoi, avec quel khôlleur, à quelle heure) et lance
            le calcul automatique du planning.
          </li>
          <li>L&apos;admin relit le résultat, ajuste si besoin, puis le publie — les khôlleurs sont notifiés par email.</li>
          <li>Chaque khôlleur saisit les notes et appréciations de ses créneaux, puis valide sa grille.</li>
          <li>
            Une fois tous les khôlleurs d&apos;une session (classe + discipline + semaine) validés, le professeur
            référent de cette discipline est notifié : il valide à son tour la session.
          </li>
          <li>Les notes et appréciations deviennent alors visibles aux étudiants concernés (email de notification).</li>
        </ol>
        <p>Quatre rôles existent, une même personne pouvant cumuler plusieurs rôles sous un seul compte :</p>
        <ul>
          <li><strong>Administrateur</strong> — gère toutes les données et le planning.</li>
          <li><strong>Khôlleur</strong> — fait passer des khôlles, saisit notes et appréciations.</li>
          <li><strong>Professeur référent</strong> — valide les sessions d&apos;une discipline pour une classe.</li>
          <li><strong>Étudiant</strong> — consulte ses notes (si un compte lui a été créé).</li>
        </ul>
      </div>

      <div className="carte">
        <h2>Pour vous, administrateur</h2>

        <h3>Les données de base</h3>
        <ul>
          <li>
            <strong>Classes</strong> — une classe appartient à une année scolaire (sélecteur en haut de l&apos;écran).
            Vous lui assignez des disciplines, et pouvez la supprimer même si elle contient déjà des étudiants, des
            sessions ou des notes : un avertissement détaillé liste ce qui sera perdu avant confirmation.
          </li>
          <li>
            <strong>Disciplines</strong> — une discipline marquée « langue vivante » (LV) se comporte différemment :
            seul le sous-groupe d&apos;étudiants l&apos;ayant en LV1 ou LV2 y est éligible, pas toute la classe (voir
            plus bas, « effectif attendu »).
          </li>
          <li>
            <strong>Étudiants</strong> — ajout un par un ou import CSV. LV1/LV2 pour les langues vivantes,
            coordonnées (email de contact, téléphone, Parcoursup, établissement d&apos;origine) purement
            informationnelles et sans lien avec un compte de connexion. Un compte de connexion est optionnel : il ne
            se crée que si vous renseignez un email.
          </li>
          <li>
            <strong>Khôlleurs</strong> — un compte par khôlleur, avec les disciplines qu&apos;il peut faire passer
            (« compétences ») et ses disponibilités (récurrentes par jour de semaine, ou ponctuelles).
          </li>
          <li>
            <strong>Référents</strong> — un ou plusieurs professeurs référents peuvent être associés à une même
            (classe, discipline) au fil du temps : c&apos;est un vivier de personnes éligibles, pas une seule
            personne figée. Lors de la génération du planning d&apos;une semaine, vous choisissez lequel de ce
            vivier est le référent effectif pour cette semaine précise.
          </li>
          <li>
            <strong>Salles</strong> — utilisées pour éviter les conflits d&apos;occupation au même horaire.
          </li>
        </ul>
        <p>
          Sur la plupart de ces écrans, un bouton permet de <strong>tout supprimer d&apos;un coup</strong> et un
          panneau <strong>« Importer depuis un fichier CSV »</strong> accepte un export Excel ou un copier-coller.
          Une ligne déjà présente (même personne) est mise à jour plutôt que dupliquée.
        </p>

        <h3>Planifier une semaine</h3>
        <p>
          Sur l&apos;écran <strong>Planification</strong>, choisissez la classe et le lundi de la semaine à
          planifier, puis ajoutez une ligne de quota par (jour, discipline, khôlleur) avec le nombre
          d&apos;étudiants, l&apos;heure de début et la salle — le solveur (OR-Tools) choisit ensuite lui-même quels
          étudiants précis remplissent chaque quota, en tenant compte de l&apos;historique (diversité des khôlleurs,
          équilibrage des horaires) et de l&apos;alternance LV1/LV2.
        </p>
        <p>
          En dessous du tableau, choisissez le <strong>référent de la semaine</strong> pour chaque discipline
          utilisée (une seule sélection, valable pour toutes les lignes de cette discipline). Le
          <strong> récapitulatif par discipline</strong> vous indique, pour chacune, le nombre d&apos;étudiants
          affectés face à l&apos;effectif attendu : l&apos;effectif entier de la classe pour une matière normale,
          mais seulement le sous-groupe concerné pour une langue vivante. Un total en écart (✗) doit être corrigé
          avant de lancer le calcul.
        </p>
        <p>
          Une fois le calcul terminé, vous atterrissez sur l&apos;écran de relecture du planning : vous pouvez
          ajuster un créneau (horaire, salle, khôlleur), puis <strong>publier</strong> — ce qui envoie l&apos;email
          récapitulatif à chaque khôlleur concerné. Republier une semaine déjà publiée la repasse en brouillon
          (les khôlleurs doivent revalider). L&apos;écran <strong>Historique</strong> liste tous les plannings
          générés, avec qui a validé ou non.
        </p>

        <h3>Suivre l&apos;avancement</h3>
        <p>
          L&apos;écran <strong>Statistiques</strong> (filtrable par classe) montre la charge de chaque khôlleur, le
          score horaire moyen par étudiant, la diversité des khôlleurs vus par étudiant et par discipline, ainsi que
          le taux d&apos;alternance LV1/LV2.
        </p>

        <h3>Paramètres</h3>
        <p>
          Sur l&apos;écran <strong>Paramètres</strong>, réglez le délai avant l&apos;envoi d&apos;un rappel
          automatique à un khôlleur qui n&apos;a pas encore saisi ses notes, et personnalisez (ou désactivez) le
          corps des emails envoyés à chaque rôle (khôlleurs, référents, étudiants).
        </p>
      </div>

      <div className="carte">
        <h2>Pour les khôlleurs</h2>
        <p>
          Après connexion, l&apos;écran <strong>Mes sessions</strong> liste leurs créneaux à venir et passés. Pour
          chaque session déjà khôllée, ils saisissent la note et l&apos;appréciation de chaque étudiant (une pièce
          jointe PDF ou Word est possible), puis cliquent sur <strong>Valider ma grille</strong> une fois tout
          saisi. Cette validation est définitive de leur côté : le professeur référent est notifié dès que tous les
          khôlleurs d&apos;une session ont validé.
        </p>
      </div>

      <div className="carte">
        <h2>Pour les professeurs référents</h2>
        <p>
          Après connexion, l&apos;écran <strong>Sessions à valider</strong> liste les sessions de leur(s)
          discipline(s), avec l&apos;état de validation de chaque khôlleur. Une fois tous les khôlleurs
          d&apos;une session validés, ils peuvent la <strong>valider</strong> à leur tour : les notes et
          appréciations deviennent alors visibles aux étudiants concernés, qui en sont notifiés par email.
        </p>
      </div>

      <div className="carte">
        <h2>Pour les étudiants</h2>
        <p>
          Un étudiant n&apos;a un accès que si un compte de connexion lui a été créé (ce n&apos;est jamais
          automatique). Une fois connecté, l&apos;écran <strong>Mes notes</strong> affiche ses notes et
          appréciations, uniquement pour les sessions déjà validées par le professeur référent.
        </p>
      </div>

      <div className="carte">
        <h2>Connexion et mots de passe</h2>
        <p>
          Je n&apos;ai pas accès à votre base de données de production, et les mots de passe y sont de toute façon
          chiffrés de façon irréversible (même avec un accès direct, ils ne peuvent pas être « lus » en clair) — je
          ne peux donc pas lister ici les identifiants réels de vos comptes. Voici en revanche comment ça
          fonctionne, et où trouver les emails déjà enregistrés :
        </p>
        <ul>
          <li>
            <strong>Votre compte administrateur</strong> — vous seul connaissez votre mot de passe ; PrepaStan ne le
            stocke jamais en clair. En cas d&apos;oubli, utilisez <strong>« Mot de passe oublié »</strong> sur
            l&apos;écran de connexion.
          </li>
          <li>
            <strong>Comptes créés un par un</strong> (khôlleur, référent, étudiant) — vous choisissez leur mot de
            passe initial au moment de la création.
          </li>
          <li>
            <strong>Comptes créés par import CSV</strong> — un mot de passe par défaut identique pour tous
            (<code>demo1234</code>) est utilisé si aucun n&apos;est précisé.
          </li>
          <li>
            <strong>Email d&apos;activation automatique</strong> — à chaque création de compte (individuelle ou par
            import), la personne reçoit désormais un email avec un lien à usage unique (valable 7 jours) pour
            choisir elle-même son mot de passe avant sa première connexion, plutôt que d&apos;utiliser celui par
            défaut. C&apos;est la façon recommandée de distribuer les accès : vous n&apos;avez ainsi jamais besoin
            de communiquer un mot de passe vous-même.
          </li>
        </ul>
        <p>
          Pour retrouver l&apos;email associé à un compte existant, consultez les écrans <strong>Étudiants</strong>
          , <strong>Khôlleurs</strong> ou <strong>Référents</strong> — ils affichent l&apos;email de chaque compte,
          jamais son mot de passe.
        </p>
      </div>
    </main>
  );
}
