# syntax=docker/dockerfile:1.7

FROM cgr.dev/chainguard/node@sha256:51042bb0c3f282bc5694e8c9b3a06847ef847d566115f91dee6ad2cd88a7d26e AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM cgr.dev/chainguard/node@sha256:51042bb0c3f282bc5694e8c9b3a06847ef847d566115f91dee6ad2cd88a7d26e AS build
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY package.json package-lock.json astro.config.mjs tsconfig.json ./
COPY src/ ./src/
COPY public/ ./public/
RUN npm ci --ignore-scripts && npm run build

FROM cgr.dev/chainguard/node@sha256:51042bb0c3f282bc5694e8c9b3a06847ef847d566115f91dee6ad2cd88a7d26e AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM cgr.dev/chainguard/node@sha256:51042bb0c3f282bc5694e8c9b3a06847ef847d566115f91dee6ad2cd88a7d26e AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json package-lock.json ./

USER node
EXPOSE 4321

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4321/api/public/dashboard.json').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--allow-fs=/app", "--allow-fs=/tmp", "--allow-net", "dist/server/entry.mjs"]