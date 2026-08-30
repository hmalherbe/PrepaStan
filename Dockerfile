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
# Le client Prisma généré (@prisma/client, moteur binaire inclus) est déjà
# repéré par le traçage automatique du build standalone ci-dessus. Seul le
# paquet CLI "prisma" ne l'est pas (jamais importé par le code, seulement
# utilisé en ligne de commande) : copié à la main, nécessaire pour lancer
# les migrations au démarrage (voir docker-entrypoint.sh).
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder /app/prisma ./prisma
COPY docker-entrypoint.sh ./

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
