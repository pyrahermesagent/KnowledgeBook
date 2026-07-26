# ---------- build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Puppeteer's install script downloads Chrome, which fails on slim images
# (no unzip) and would be discarded with this stage anyway — the runtime
# stage provides Chromium via apt instead.
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---------- runtime ----------
FROM node:22-bookworm-slim
WORKDIR /app
# Chromium for the PDF export (server/utils/pdf-export.ts); puppeteer picks
# it up via PUPPETEER_EXECUTABLE_PATH instead of its own downloaded Chrome.
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    NUXT_DATABASE_PATH=/app/.data/knowledgebook.db \
    NUXT_UPLOADS_DIR=/app/.data/uploads \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PORT=3000

COPY --from=build /app/.output ./.output

RUN mkdir -p /app/.data && chown -R node:node /app/.data
USER node
VOLUME /app/.data
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
