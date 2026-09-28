# Majlis

University club and event management: clubs, membership, events, registration,
attendance and certificates.

## Stack

- API: NestJS, Prisma, PostgreSQL (`apps/api`)
- Web: Next.js, Tailwind (`apps/web`)
- Shared Zod schemas (`packages/contracts`)
- pnpm workspaces and Turborepo

## Requirements

- Node 22.12 or later
- pnpm 11
- PostgreSQL
- A Supabase project, for image storage

## Setup

```bash
cp .env.example .env
pnpm install
```

Create the `majlis` role with `scripts/bootstrap-db.sql`, then the `majlis_dev` and
`majlis_test` databases. Fill in `.env`, then:

```bash
pnpm --filter @majlis/api prisma:deploy
pnpm --filter @majlis/api db:seed

pnpm --filter @majlis/api start:dev    # http://localhost:3001
pnpm --filter @majlis/web dev          # http://localhost:3000
```

The seeded accounts share the password `Passw0rd!`: `admin@uni.ac.ae`,
`lead@uni.ac.ae`, `ops@uni.ac.ae` and `student@uni.ac.ae`.

## Tests

```bash
pnpm test                                     # unit tests
pnpm --filter @majlis/api test:integration    # needs majlis_test
pnpm --filter @majlis/api test:acceptance     # needs majlis_test
pnpm --filter @majlis/web test:e2e            # needs both servers running
```
