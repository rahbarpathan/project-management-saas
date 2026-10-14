# SprintFlow

SprintFlow is a real-time project management SaaS built as a modular monolith.

## Architecture & Workspaces

- `apps/api`: Node, Express, TypeScript, Prisma, PostgreSQL, Socket.IO, Pino, Vitest + Supertest.
- `apps/web`: React, TypeScript, Vite, React Router, TanStack Query, Zod.
- `packages/shared`: Shared types, schemas (Zod), and contracts across API and Web.

## Prerequisites

- [Node.js](https://nodejs.org/) (v20+ or v22+)
- [pnpm](https://pnpm.io/) (v9+)
- [Docker & Docker Compose](https://www.docker.com/)

## Local Setup

### 1. Clone & Install Dependencies

```bash
pnpm install
```

### 2. Environment Variables

Copy the example environment files for both API and Web:

```bash
# Backend environment
cp apps/api/.env.example apps/api/.env

# Frontend environment
cp apps/web/.env.example apps/web/.env
```

#### Variables in `apps/api/.env`:
| Variable | Description | Default |
|---|---|---|
| `NODE_ENV` | Environment mode (`development`, `test`, `production`) | `development` |
| `PORT` | API server port | `4000` |
| `DATABASE_URL` | PostgreSQL connection string for development | `postgresql://postgres:postgres@localhost:5432/sprintflow_dev?schema=public` |
| `TEST_DATABASE_URL` | PostgreSQL connection string for tests | `postgresql://postgres:postgres@localhost:5432/sprintflow_test?schema=public` |
| `CLIENT_URL` | Frontend origin allowed for CORS / sockets | `http://localhost:3000` |

The API uses a fail-fast Zod configuration module ([apps/api/src/config/env.ts](apps/api/src/config/env.ts)) that validates all required variables on startup and halts execution if variables are missing or misconfigured.

### 3. Start PostgreSQL with Docker Compose

Start the PostgreSQL service in detached mode:

```bash
docker compose up -d
```

This launches a PostgreSQL container configured with:
- **Dev database**: `sprintflow_dev`
- **Test database**: `sprintflow_test` (automatically initialized via `docker/postgres/init-test-db.sql`)
- **Named persistent volume**: `postgres_data`
- **Healthcheck**: Verified via `pg_isready`

Check container status and health:
```bash
docker compose ps
```

### 4. Running Development Servers

```bash
# Run both API and Web concurrently
pnpm dev

# Or run separately:
pnpm dev:api    # Starts API on http://localhost:4000
pnpm dev:web    # Starts Web on http://localhost:3000
```

### 5. Automated Checks & Tests

```bash
pnpm lint       # ESLint across monorepo
pnpm typecheck  # TypeScript strict check across all workspaces
pnpm test       # Vitest unit & integration test suites
pnpm build      # Build shared package and applications
```
