FROM oven/bun:1.4.4 AS bun

FROM node:22-bookworm-slim AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV CI=1 EXPO_NO_TELEMETRY=1
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run web:build

FROM oven/bun:1.4.4 AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8081
COPY --from=build --chown=bun:bun /app/node_modules/expo-server ./node_modules/expo-server
COPY --from=build --chown=bun:bun /app/dist ./dist
COPY --from=build --chown=bun:bun /app/scripts/serve-web.ts ./scripts/serve-web.ts
USER bun
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:8081/app/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "scripts/serve-web.ts"]
