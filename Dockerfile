# Image de production de l'appli Next.js (le microservice solveur a son
# propre Dockerfile dans services/planning-solver/). Basé sur des images
# Debian "slim" (pas Alpine) : le moteur Prisma a besoin de glibc/OpenSSL, et
# rester sur une seule famille de libc entre build et exécution évite les
# soucis de binaryTargets.

# ---------- 1. Dépendances ----------
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---------- 2. Build ----------
FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Le projet n'a pas de dossier public/ (aucun asset statique), mais Next.js
# standalone et l'étape suivante s'attendent à ce qu'il existe.
RUN mkdir -p ./public
RUN npx prisma generate
RUN npm run build

# ---------- 3. Exécution ----------
FROM node:20-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
# Next.js standalone : serveur Node minimal + uniquement les dépendances
# réellement utilisées (voir next.config.mjs, output: "standalone").
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Le client Prisma généré (.prisma/client, moteur binaire inclus) est déjà
# repéré par le traçage automatique du build standalone ci-dessus. En
# revanche, le paquet CLI "prisma" et ses dépendances (@prisma/engines,
# fetch-engine, get-platform, debug...) ne sont jamais importés par le code
# de l'appli, seulement utilisés en ligne de commande : ils ne sont donc pas
# tracés, et doivent être copiés à la main pour pouvoir lancer les
# migrations au démarrage (voir docker-entrypoint.sh).
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# bcryptjs est inliné dans le bundle Next.js (donc utilisable normalement
# par l'appli), mais pas présent tel quel dans node_modules : copié à la
# main pour permettre son usage en ligne de commande (ex. création manuelle
# du compte admin via `docker compose exec app node -e "..."`).
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY docker-entrypoint.sh ./

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
