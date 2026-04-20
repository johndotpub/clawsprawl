# syntax=docker/dockerfile:1.7

FROM cgr.dev/chainguard/node:latest AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM cgr.dev/chainguard/node:latest AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json astro.config.mjs tsconfig.json ./
COPY src/ ./src/
COPY public/ ./public/
RUN npm ci --ignore-scripts && npm run build

FROM cgr.dev/chainguard/node:latest AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM cgr.dev/chainguard/node:latest AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json package-lock.json ./

USER node
EXPOSE 4321

CMD ["node", "--allow-fs=/app", "--allow-fs=/tmp", "--allow-net", "dist/server/entry.mjs"]