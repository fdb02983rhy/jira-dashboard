FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Build frontend
FROM deps AS build
COPY . .
RUN bun run build

# Production
FROM base AS production
ENV NODE_ENV=production

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY server/ ./server/
COPY --from=build /app/dist ./dist

EXPOSE 3456

CMD ["bun", "run", "server/index.ts"]
