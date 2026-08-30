#!/bin/sh
# Applique les migrations en attente à chaque démarrage du conteneur, avant
# de lancer le serveur : évite d'avoir à se souvenir de lancer
# `prisma migrate deploy` à la main après chaque déploiement. Idempotent
# (ne fait rien si la base est déjà à jour), donc sans risque à chaque
# redémarrage.
set -e

npx prisma migrate deploy

exec "$@"
