# AIShortvideo

AI-generated novel and short-video production system.

## Workspace

```text
apps/admin-web  # Vite + Vue 3 + Element Plus admin frontend
apps/api        # Node.js + TypeScript + Fastify API, MySQL via Prisma
packages/shared # Shared types and constants, reserved for frontend/backend contracts
docs            # Product requirements and architecture docs
```

## Scripts

```bash
npm run dev:admin
npm run build:admin
npm run dev:api
npm run build:api
npm run typecheck
```

## Backend

The backend uses Fastify as the Node.js web framework, TypeScript for application code, MySQL as the database, and Prisma for database schema and client generation.

Copy `apps/api/.env.example` to `apps/api/.env` before running database-backed features.
