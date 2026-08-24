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

## Workflow métier

1. Un admin/référent déclenche la génération du planning d'une semaine
   (`POST /api/admin/planification/jobs`) → le microservice OR-Tools calcule
   les créneaux et les élèves affectés, puis les écrit en brouillon
   (`SessionKholle.statut = PLANIFICATION`).
2. Après relecture, l'admin publie (`POST .../publier`) → les créneaux
   deviennent visibles aux kholleurs.
3. Chaque kholleur saisit notes et appréciations puis valide sa grille
   (`ValidationGrille.statut = VALIDE`).
4. Une fois tous les kholleurs d'une session validés, le professeur référent
   valide à son tour (`ValidationReferent.statut = VALIDE`) → les notes
   deviennent visibles aux élèves.

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

Le microservice de planification se lance séparément :

```bash
cd services/planning-solver
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

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
  `/admin/planification` (classe MP2I-1, semaine 3, les 3 disciplines).

Le seed est idempotent (upserts + vérifications avant création) : le
relancer ne duplique rien.

## Stack

- Next.js 15 (App Router) + TypeScript
- PostgreSQL + Prisma ORM
- NextAuth pour l'authentification par rôles (kholleur / référent / admin)
- Python + FastAPI + OR-Tools (CP-SAT) pour la planification sous contraintes
