# syntax=docker/dockerfile:1

# -------------------------------------------------------------
# Stage 1: Base & Dependencies
# -------------------------------------------------------------
FROM node:20-alpine AS dependencies

WORKDIR /app

# Enable pnpm via Corepack
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Copy workspace configuration and lockfile
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install dependencies (including devDependencies required for build & prisma generate)
RUN pnpm install --frozen-lockfile

# -------------------------------------------------------------
# Stage 2: Builder
# -------------------------------------------------------------
FROM dependencies AS builder

WORKDIR /app

# Copy source code across workspaces
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Build shared package
RUN pnpm --filter @sprintflow/shared build

# Generate Prisma client
RUN pnpm --filter @sprintflow/api db:generate

# Build API TypeScript project
RUN pnpm --filter @sprintflow/api build

# Prune devDependencies for a lean production bundle
RUN pnpm --filter @sprintflow/api --prod deploy /app/pruned-api

# -------------------------------------------------------------
# Stage 3: Production Runner
# -------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Install wget for healthcheck (included in alpine)
RUN apk --no-cache add wget ca-certificates

# Copy deployed pruned production dependencies and runtime assets
COPY --from=builder /app/pruned-api/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/apps/api/package.json ./package.json

# Ensure correct file permissions for non-root 'node' user
RUN chown -R node:node /app

# Switch to non-root user (UID 1000)
USER node

EXPOSE 4000

# Healthcheck checking shallow /health endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

# Execute production server
CMD ["node", "dist/server.js"]
