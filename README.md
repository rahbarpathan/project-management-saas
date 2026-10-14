# SprintFlow

SprintFlow is a real-time project management SaaS built as a modular monolith.

## Workspace Structure

- `apps/api`: Node, Express, TypeScript, Prisma, PostgreSQL, Socket.IO, Vitest + Supertest.
- `apps/web`: React, TypeScript, Vite, React Router, TanStack Query.
- `packages/shared`: Shared types, schemas (Zod), and contracts across API and Web.

## Scripts

- `pnpm dev`: Run applications in development mode.
- `pnpm build`: Build all packages and applications.
- `pnpm lint`: Run ESLint across the repository.
- `pnpm typecheck`: Run TypeScript type-checking across all workspaces.
- `pnpm test`: Run test suites across the repository.
