#!/bin/sh
# Applique les migrations en attente à chaque démarrage du conteneur, avant
# de lancer le serveur : évite d'avoir à se souvenir de lancer
# `prisma migrate deploy` à la main après chaque déploiement. Idempotent
# (ne fait rien si la base est déjà à jour), donc sans risque à chaque
# redémarrage.
set -e

# Exécuté directement via le fichier réel du paquet (et non via le lien
# symbolique node_modules/.bin/prisma ou npx) : le CLI Prisma résout le
# chemin de ses fichiers annexes (ex. prisma_schema_build_bg.wasm) à partir
# de __dirname, qui suit le lien symbolique tel quel dans ce conteneur au
# lieu d'être résolu vers son vrai dossier.
node ./node_modules/prisma/build/index.js migrate deploy

exec "$@"
