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

## Démarrage

```bash
cp .env.example .env
docker compose up -d          # démarre PostgreSQL
npm install
npx prisma migrate dev
npm run dev
```

Le microservice de planification se lance séparément :

```bash
cd services/planning-solver
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

## Stack

- Next.js 15 (App Router) + TypeScript
- PostgreSQL + Prisma ORM
- NextAuth pour l'authentification par rôles (kholleur / référent / admin)
- Python + FastAPI + OR-Tools (CP-SAT) pour la planification sous contraintes
