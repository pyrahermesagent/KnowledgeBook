# ---------- build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---------- runtime ----------
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NUXT_DATABASE_PATH=/app/.data/knowledgebook.db \
    NUXT_UPLOADS_DIR=/app/.data/uploads \
    PORT=3000

COPY --from=build /app/.output ./.output

RUN mkdir -p /app/.data && chown -R node:node /app/.data
USER node
VOLUME /app/.data
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
