-- Crée (ou met à jour le mot de passe d'un) rôle Postgres dédié, en
-- LECTURE SEULE, pour connecter Looker Studio (voir "Connexion Looker
-- Studio" dans le README) — jamais les identifiants de l'appli elle-même.
--
-- Pas de mot de passe en clair dans ce fichier : :'looker_password' est
-- substitué par psql AVANT envoi au serveur (simple remplacement textuel,
-- apostrophes incluses, donc littéral déjà correctement échappé — y
-- compris à l'intérieur du bloc $$ ... $$ ci-dessous, qui ne contient donc
-- plus que du SQL statique une fois reçu par Postgres).
--
-- Usage (depuis /root/PrepaStan sur le VPS) :
--   docker compose -f docker-compose.prod.yml exec -T db \
--     psql -U prepastan -d prepastan \
--     -v looker_password="UN_MOT_DE_PASSE_FORT_ICI" \
--     -f - < scripts/creer-role-looker-studio.sql
--
-- Rejouable sans risque (idempotent) : change juste le mot de passe si le
-- rôle existe déjà.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'looker_ro') THEN
    CREATE ROLE looker_ro WITH LOGIN PASSWORD :'looker_password' CONNECTION LIMIT 5;
  ELSE
    ALTER ROLE looker_ro WITH PASSWORD :'looker_password';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE prepastan TO looker_ro;
GRANT USAGE ON SCHEMA public TO looker_ro;

-- Toutes les tables en lecture seule...
GRANT SELECT ON ALL TABLES IN SCHEMA public TO looker_ro;

-- ...SAUF Utilisateur (contient le hash bcrypt du mot de passe : aucun
-- outil externe ne doit pouvoir le lire, même haché) et les tokens de
-- réinitialisation — une vue sans colonne sensible est exposée à la place
-- pour Utilisateur, sans équivalent utile pour les tokens.
REVOKE SELECT ON "Utilisateur" FROM looker_ro;
REVOKE SELECT ON "TokenReinitialisationMotDePasse" FROM looker_ro;

CREATE OR REPLACE VIEW utilisateur_looker AS
SELECT id, email, nom, prenom, roles, "derniereConnexion", "createdAt", "updatedAt"
FROM "Utilisateur";
GRANT SELECT ON utilisateur_looker TO looker_ro;

-- Tables créées par une future migration : lecture seule accordée
-- automatiquement à looker_ro, pas besoin de rejouer ce script à chaque fois
-- (seule Utilisateur doit rester explicitement protégée si son schéma change).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO looker_ro;

SELECT 'Rôle looker_ro prêt.' AS resultat;
