# PrepaStan

Application de gestion des khôlles en classe préparatoire : planification des
créneaux sous contraintes, notation par les kholleurs, validation en cascade
par les professeurs référents.

## Architecture

- **`src/`** — application web Next.js (App Router, TypeScript), API + écrans.
- **`prisma/schema.prisma`** — modèle de données (PostgreSQL).
- **`services/planning-solver/`** — microservice Python (FastAPI + OR-Tools
  CP-SAT) qui calcule le planning des créneaux sous contraintes. Appelé de
  façon asynchrone par l'app web via un callback HTTP.
- **`docker-compose.yml`** — PostgreSQL local pour le développement.

## Administration

Écrans réservés à l'admin pour gérer le référentiel (avant, tout passait
par `prisma/seed.ts`) :

- `/admin/classes` — créer des classes ; `/admin/classes/[id]` gère ses
  élèves (avec compte de connexion optionnel) et les disciplines qui lui
  sont assignées (table `ClasseDiscipline`, indépendante du référent).
- `/admin/disciplines` — créer les disciplines (Maths, Physique...).
- `/admin/kholleurs` — créer un kholleur et ses compétences (disciplines) ;
  `/admin/kholleurs/[id]` gère ses disponibilités récurrentes par jour de
  semaine.
- `/admin/referents` — assigner un professeur référent à une classe pour
  une discipline (celle-ci doit déjà être assignée à la classe).

La génération de planning (`/admin/planification`) demande la date du
lundi de la semaine ciblée, puis des **quotas** saisis ligne par ligne :
pour chaque (jour de la semaine, discipline, kholleur), le nombre d'élèves
à lui affecter. Un récapitulatif par discipline vérifie en direct que la
somme des quotas correspond exactement à l'effectif de la classe avant
d'activer le bouton de génération. OR-Tools ne choisit donc plus le
nombre d'élèves par kholleur (fixé par l'admin) mais uniquement **quels
élèves précis** et **à quel horaire** remplissent chaque quota, dans le
respect des objectifs soft habituels (diversité, équilibrage). Les
disponibilités récurrentes (par jour de semaine) sont converties en dates
concrètes pour cette semaine avant l'appel au solveur (voir
`expanserDisponibilites()` dans
`src/app/api/admin/planification/jobs/route.ts`).

## Workflow métier

1. Un admin/référent déclenche la génération du planning d'une semaine
   (`POST /api/admin/planification/jobs`) → le microservice OR-Tools calcule
   les créneaux et les élèves affectés, puis les écrit en brouillon
   (`SessionKholle.statut = PLANIFICATION`).
2. Après relecture, l'admin publie (`POST .../publier`) → les créneaux
   deviennent visibles aux kholleurs, qui reçoivent chacun un email
   récapitulatif de leurs créneaux de la semaine (voir "Notifications par
   email" ci-dessous).
3. Chaque kholleur saisit notes et appréciations puis valide sa grille
   (`ValidationGrille.statut = VALIDE`).
4. Une fois tous les kholleurs d'une session validés, le professeur référent
   valide à son tour (`ValidationReferent.statut = VALIDE`) → les notes
   deviennent visibles aux élèves.

## Notifications par email

À la publication d'un planning (`POST /api/admin/planification/[classeId]/[semaine]/publier`),
chaque kholleur concerné reçoit un email récapitulant ses créneaux de la
semaine (jour, horaire, discipline, salle, élèves), envoyé via
[Resend](https://resend.com) (`src/lib/email.ts`).

- Créez un compte gratuit sur [resend.com](https://resend.com), récupérez
  une clé API et renseignez `RESEND_API_KEY` dans `.env`.
- Sans `RESEND_API_KEY`, l'envoi est simplement ignoré (message loggé en
  console) — la publication du planning n'est jamais bloquée par un souci
  d'email.
- Tant que vous n'avez pas vérifié votre propre nom de domaine sur Resend,
  laissez `RESEND_FROM_EMAIL` à sa valeur par défaut
  (`PrepaStan <onboarding@resend.dev>`) : les emails ne peuvent alors être
  envoyés qu'à l'adresse de votre propre compte Resend, ce qui suffit pour
  tester. Pour notifier de vraies adresses de kholleurs, il faut vérifier un
  domaine sur Resend puis mettre `RESEND_FROM_EMAIL` à une adresse de ce
  domaine.

## Authentification

NextAuth (provider Credentials, email + mot de passe) avec un rôle par
compte (`ADMIN`, `KHOLLEUR`, `PROFESSEUR_REFERENT`, `ELEVE`). Chaque route
API vérifie le rôle via `requireRole()` (`src/lib/auth.ts`), et
`src/middleware.ts` filtre en plus par préfixe d'URL (`/api/admin`,
`/api/kholleur`, `/api/referent`, `/api/eleve`) en défense en profondeur.
Un élève ne peut se connecter que si son enregistrement `Eleve` est lié à un
`Utilisateur` (`Eleve.utilisateurId`) — sinon il n'a pas de compte.

## Démarrage

```bash
cp .env.example .env
docker compose up -d          # démarre PostgreSQL
npm install
npx prisma migrate dev        # applique la migration versionnée dans prisma/migrations
npm run prisma:seed           # crée le compte admin + le jeu de données de démo
npm run dev
```

Le microservice de planification se lance séparément (Python 3.9 ou plus) :

```bash
cd services/planning-solver
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

Sur Windows, si `uvicorn` n'est pas reconnu comme commande après
l'installation, utilisez `python -m uvicorn app.main:app --port 8001`
(évite les soucis de PATH).

Le service `planning-solver` du `docker-compose.yml` est volontairement
sur un profile séparé (`solver`) : un simple `docker compose up -d` ne
démarre donc que PostgreSQL, jamais le microservice en même temps que
l'`uvicorn` lancé à la main ci-dessus — les deux tournant sur le même
port 8001, le conteneur masquerait sinon silencieusement le processus
local (source d'un bug difficile à diagnostiquer). Pour lancer le
microservice en conteneur plutôt qu'en local, utilisez explicitement
`docker compose --profile solver up -d planning-solver`.

## Jeu de données de démonstration

`npm run prisma:seed` (voir `prisma/seed.ts`) crée une classe complète
(MP2I-1, 6 élèves, 3 disciplines, 4 kholleurs, 3 référents, 3 salles) avec
mot de passe commun `demo1234` pour tous les comptes de démo (l'admin garde
son mot de passe propre, `changeme` par défaut ou `SEED_ADMIN_PASSWORD`).
Les identifiants complets sont affichés à la fin du script.

Trois parcours sont prêts à tester :

- **Semaine 1 (Mathématiques)** — session déjà clôturée avec notes et
  appréciations validées : connectez-vous avec un compte élève
  (`lea.dupont@eleve.prepastan.local` / `demo1234`) pour voir le résultat
  final immédiatement, sans rejouer le workflow.
- **Semaine 2 (Anglais)** — session planifiée mais pas encore notée : le
  parcours complet se teste avec `kholleur.anglais@prepastan.local` (saisie
  + validation de la grille), puis `referent.anglais@prepastan.local`
  (validation de la session), puis à nouveau un compte élève pour voir la
  note fraîchement publiée.
- **Semaine 3 (planification en direct)** — des disponibilités sont déjà
  saisies pour les 4 kholleurs du 24 au 27 août 2026. Avec le microservice
  OR-Tools lancé (`PLANNING_SOLVER_URL`), connectez-vous en admin
  (`admin@prepastan.local`) et générez le planning depuis
  `/admin/planification` (classe MP2I-1, semaine 3, lundi de la semaine =
  `2026-08-24`), avec par exemple ces quotas (chaque kholleur a 2h de
  dispo ce jour-là, soit exactement 6 créneaux de 20 min) :
  - Lundi — Mathématiques — Claude Bernard — 6 élèves
  - Lundi — Physique-Chimie — Marc Klein — 6 élèves
  - Mardi — Anglais — Julie Faure — 6 élèves

Le seed est idempotent (upserts + vérifications avant création) : le
relancer ne duplique rien.

## Déployer en ligne pour tester (depuis un navigateur, sans terminal)

Le microservice OR-Tools n'est pas nécessaire pour ce test : seuls les
scénarios "semaine 1" et "semaine 2" du jeu de données de démo sont
accessibles (la génération de planning "semaine 3" resterait indisponible
tant que le solveur n'est pas déployé séparément).

1. **Base de données** — sur [neon.tech](https://neon.tech), créer un compte
   gratuit et un projet. Copier la "Connection string" (commence par
   `postgresql://...`) : c'est la valeur de `DATABASE_URL`.
2. **Déploiement** — sur [vercel.com](https://vercel.com), créer un compte
   (connexion possible directement avec GitHub), puis "Add New… → Project"
   et importer le dépôt `hmalherbe/PrepaStan`.
3. Dans les paramètres du projet Vercel, section **Environment Variables**,
   ajouter :
   - `DATABASE_URL` — la chaîne de connexion Neon de l'étape 1
   - `NEXTAUTH_SECRET` — n'importe quelle chaîne aléatoire longue (ex :
     générée sur [generate-secret.vercel.app](https://generate-secret.vercel.app/32))
   - `RUN_SEED` = `1` — pour que le jeu de données de démo soit créé
     automatiquement au premier déploiement
4. Lancer le déploiement (bouton "Deploy"). Vercel exécute `prisma migrate
   deploy` (crée les tables) puis le seed (`RUN_SEED=1`) automatiquement —
   voir le script `vercel-build` dans `package.json`.
5. Une fois déployé, Vercel donne une URL du type
   `https://prepastan.vercel.app`. Ajouter une dernière variable
   d'environnement `NEXTAUTH_URL` avec cette URL exacte, puis redéployer
   (bouton "Redeploy") — l'authentification en a besoin pour fonctionner
   correctement en production.
6. Ouvrir l'URL depuis n'importe quel appareil (y compris un téléphone) et
   se connecter avec les identifiants listés dans "Jeu de données de
   démonstration" ci-dessus.

Pour éviter que `RUN_SEED=1` ne re-crée les données de démo à chaque futur
déploiement une fois que de vraies données existeront, repasser cette
variable à `0` (ou la supprimer) après les premiers tests — le seed est
idempotent donc ce n'est pas dangereux, juste inutile.

## Moteur de planification (OR-Tools)

En plus des contraintes dures (pas de chevauchement élève/kholleur/salle,
une khôlle par discipline demandée, et désormais le respect exact des
quotas (jour, discipline, kholleur, nombre d'élèves) fixés par l'admin —
voir `quotas` dans `resoudre()`), le solveur
(`services/planning-solver/app/solver.py`) optimise trois objectifs
"soft", pondérés (constantes `POIDS_*` en tête de fichier, ajustables) :

- **Équilibrage de la charge des kholleurs**, historique inclus — un
  kholleur déjà très sollicité les semaines précédentes est défavorisé,
  pas seulement celui qui aurait le plus de créneaux cette semaine.
- **Diversité des kholleurs par élève** — pénalise le fait qu'un élève
  retombe sur un kholleur qu'il a déjà eu dans la même discipline.
- **Équilibrage des horaires de passage** — pénalise le fait de redonner
  un créneau tardif (après 17h par défaut) à un élève déjà souvent tombé
  tardif par le passé.

Cet historique est recalculé à chaque génération à partir des sessions déjà
publiées (`SessionKholle.statut != PLANIFICATION`) — pas de table dédiée,
les données existent déjà dans `Creneau`/`Passage`. Voir
`calculerHistorique()` dans `src/app/api/admin/planification/jobs/route.ts`.

### Valider les objectifs sur la durée

`services/planning-solver/scripts/simuler_annee.py` rejoue le solveur sur
une année scolaire synthétique (32 semaines) en faisant vivre l'historique
d'une semaine à l'autre, puis affiche moyenne/écart-type/min/max sur la
charge des kholleurs, la diversité kholleur/élève et les créneaux tardifs.
Utile pour vérifier que les objectifs pondérés tiennent sur la durée, pas
seulement semaine par semaine, ou pour ajuster les constantes `POIDS_*`.

```bash
cd services/planning-solver
pip install -r requirements.txt
python scripts/simuler_annee.py
```

## Stack

- Next.js 15 (App Router) + TypeScript
- PostgreSQL + Prisma ORM
- NextAuth pour l'authentification par rôles (kholleur / référent / admin)
- Python + FastAPI + OR-Tools (CP-SAT) pour la planification sous contraintes
