# SprintFlow Production Deployment Guide

This guide provides end-to-end instructions for deploying SprintFlow to production environments supporting **persistent WebSockets**, **managed PostgreSQL**, **automatic database migrations on deploy**, **HTTPS**, **CORS**, and **secure cookie handling**.

---

## 1. Architecture & Hosting Strategy

SprintFlow is designed as a modular monolith:
- **Backend API (`apps/api`)**: Node.js/Express with Socket.IO for real-time collaboration. Requires long-lived TCP/WebSocket connections.
- **Frontend SPA (`apps/web`)**: React/Vite single-page application served via NGINX or static CDN with client-side routing.
- **Database**: Managed PostgreSQL 16 with ACID transactions and connection pooling.

### Recommended Providers:
| Provider | Persistent WebSockets | Managed PostgreSQL | Migration on Deploy | Free SSL (HTTPS) |
| :--- | :---: | :---: | :---: | :---: |
| **Render** | Yes (Native) | Yes (v16) | Yes (Pre-Deploy Hooks) | Yes (Let's Encrypt) |
| **Railway** | Yes | Yes (v16) | Yes (Deploy Command) | Yes |
| **Fly.io** | Yes | Yes (Litefs/Postgres) | Yes (Release Command) | Yes |
| **AWS ECS + RDS** | Yes (via ALB) | Yes (Aurora/RDS) | Yes (Migration Task) | Yes (ACM) |

---

## 2. Step-by-Step Deployment (Render Walkthrough)

### Step 1: Provision Managed PostgreSQL 16
1. In the [Render Dashboard](https://dashboard.render.com), click **New +** -> **PostgreSQL**.
2. Settings:
   - **Name**: `sprintflow-db`
   - **Database**: `sprintflow_prod`
   - **User**: `sprintflow_user`
   - **Region**: Choose closest to your users (e.g., `Oregon (US West)` or `Frankfurt (EU)`)
   - **PostgreSQL Version**: `16`
3. Click **Create Database**.
4. Once created, copy the **Internal Database URL** (for services hosted inside Render) and **External Database URL** (for remote admin).

---

### Step 2: Deploy the Backend API (`apps/api`)
1. Click **New +** -> **Web Service**.
2. Connect your GitHub/GitLab repository.
3. Configure the service:
   - **Name**: `sprintflow-api`
   - **Region**: Same region as your database
   - **Branch**: `main` or `master`
   - **Runtime**: `Node` or `Docker`
   
   #### Option A: Docker Deployment (Recommended)
   - **Dockerfile Path**: `apps/api/Dockerfile`
   - **Docker Context**: `.` (monorepo root)
   
   #### Option B: Native Node Runtime
   - **Build Command**:
     ```bash
     corepack enable && pnpm install --frozen-lockfile && pnpm --filter @sprintflow/shared build && pnpm --filter @sprintflow/api db:generate && pnpm --filter @sprintflow/api build
     ```
   - **Pre-Deploy Command** (runs before traffic cuts over):
     ```bash
     pnpm --filter @sprintflow/api db:migrate
     ```
   - **Start Command**:
     ```bash
     pnpm --filter @sprintflow/api start
     ```

4. Configure Environment Variables:
   | Variable | Value / Notes |
   | :--- | :--- |
   | `NODE_ENV` | `production` |
   | `PORT` | `4000` |
   | `DATABASE_URL` | Connect using Render's secret reference to `sprintflow-db` |
   | `CLIENT_URL` | `https://app.yourdomain.com` (or your frontend Render URL) |
   | `JWT_ACCESS_SECRET` | 32+ character random secret (generated via `openssl rand -base64 32`) |
   | `JWT_REFRESH_SECRET` | 32+ character random secret (generated via `openssl rand -base64 32`) |

5. Configure Health Check:
   - **Health Check Path**: `/health`

6. Click **Create Web Service**.

---

### Step 3: Deploy the Frontend Web Client (`apps/web`)
1. Click **New +** -> **Static Site** (or **Web Service** if deploying `apps/web/Dockerfile` with custom NGINX reverse proxy).
2. Configure Settings:
   - **Name**: `sprintflow-web`
   - **Branch**: `main`
   - **Build Command**:
     ```bash
     corepack enable && pnpm install --frozen-lockfile && pnpm --filter @sprintflow/shared build && pnpm --filter @sprintflow/web build
     ```
   - **Publish Directory**: `apps/web/dist`
3. Configure Environment Variables:
   | Variable | Value |
   | :--- | :--- |
   | `VITE_API_URL` | `https://sprintflow-api.onrender.com` (your backend URL) |
4. Configure SPA Rewrite Rules (for client-side routing):
   - **Source**: `/*`
   - **Destination**: `/index.html`
   - **Action**: `Rewrite`

---

## 3. HTTPS, CORS, and Secure Cookie Policy

In production, user authentication is managed via `httpOnly` secure cookies.

### 1. SameSite & Secure Configuration
In `apps/api/src/modules/auth/auth.service.ts`:
- **`httpOnly: true`**: Prevents client-side JavaScript access, defending against XSS attacks.
- **`secure: true`**: Enforced automatically when `NODE_ENV=production`, ensuring cookies are only transmitted over TLS/HTTPS connections.
- **`sameSite: 'lax'`**: For same-domain / same-site deployments (e.g., `app.sprintflow.dev` and `api.sprintflow.dev`).
  > If hosting API and Web on completely different third-party domains (e.g. `sprintflow.vercel.app` and `sprintflow.onrender.com`), set `sameSite: 'none'` and `secure: true`.

### 2. CORS Allowlist
The API enforces strict origin validation:
```typescript
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
  }),
);
```

---

## 4. Running Migrations on Deploy

To prevent running unmigrated code against an outdated schema:

1. **Pre-Deploy Hooks**:
   The migration command executes before the new application instance boots:
   ```bash
   pnpm --filter @sprintflow/api db:migrate
   # Equivalent to: prisma migrate deploy
   ```
2. **Safety Invariants**:
   - `prisma migrate deploy` is idempotent and applies pending `.sql` migrations in chronological order.
   - If a migration fails, the deployment halts immediately, and existing instances continue serving traffic without disruption.
3. **Zero-Downtime Migration Pattern (Expand & Contract)**:
   - **Expand**: Add new nullable columns or tables first. Deploy code that reads/writes the new structure.
   - **Backfill**: Populate legacy rows in the background.
   - **Contract**: Remove old columns in a subsequent deployment.

---

## 5. Secret Rotation & Key Generation

Never commit `.env` files or hardcoded credentials to version control.

### Generating Strong Cryptographic Secrets:
```bash
# Generate 256-bit base64-encoded secrets
openssl rand -base64 32
```

### Rotating Secrets Safely:
1. **JWT Access Secret Rotation**:
   - Access tokens have a short lifespan (15 minutes). Rotating `JWT_ACCESS_SECRET` invalidates active access tokens; clients will automatically hit `/api/auth/refresh` using their rotating refresh tokens.
2. **JWT Refresh Secret Rotation**:
   - Refresh tokens are stored hashed/indexed in PostgreSQL. Rotating `JWT_REFRESH_SECRET` gracefully invalidates long-lived sessions, prompting users to re-authenticate without corrupting data.

---

## 6. Horizontal Scaling with Redis

For multi-instance deployments behind a load balancer:
1. Provision a managed Redis cluster (e.g., Redis Cloud, Upstash, or AWS ElastiCache).
2. Set the `REDIS_URL` environment variable on the API containers:
   ```env
   REDIS_URL=rediss://default:password@cluster.redis.cache.amazonaws.com:6379
   ```
3. See [docs/realtime.md](./realtime.md) for full Redis Adapter configuration and presence state sync.
