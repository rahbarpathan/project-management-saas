# syntax=docker/dockerfile:1

# -------------------------------------------------------------
# Stage 1: Build Web Application
# -------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Enable pnpm via Corepack
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Copy workspace configuration and lockfile
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Build shared package first
RUN pnpm --filter @sprintflow/shared build

# Build Web Vite production bundle
RUN pnpm --filter @sprintflow/web build

# -------------------------------------------------------------
# Stage 2: Production NGINX Server
# -------------------------------------------------------------
FROM nginx:1.27-alpine AS runner

# Install wget for healthcheck
RUN apk --no-cache add wget

# Remove default nginx static files and config
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# Copy custom NGINX configuration
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from builder stage
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Grant ownership to non-root nginx user
RUN chown -R nginx:nginx /usr/share/nginx/html \
    && chmod -R 755 /usr/share/nginx/html \
    && chown -R nginx:nginx /var/cache/nginx \
    && chown -R nginx:nginx /var/log/nginx \
    && chown -R nginx:nginx /etc/nginx/conf.d \
    && touch /var/run/nginx.pid \
    && chown -R nginx:nginx /var/run/nginx.pid

# Expose HTTP port
EXPOSE 80

# Healthcheck checking /health endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/health || exit 1

# Start NGINX in foreground
CMD ["nginx", "-g", "daemon off;"]
