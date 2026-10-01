# HelpDesk

AI-powered ticket management system. See `project-scope.md`, `tech-stack.md` and `implementation-plan.md`.

## Structure

```
client/   React + TypeScript, bundled by Bun
server/   Express 5 + TypeScript, running on Bun
```

The two packages are Bun workspaces sharing one `bun.lock`.

## Requirements

- [Bun](https://bun.com) 1.4+
- PostgreSQL (local install), with a database named `helpdesk`

## Database setup

1. Copy `server/.env.example` to `server/.env` and set `DATABASE_URL` to your PostgreSQL credentials. URL-encode special characters in the password (e.g. `@` → `%40`).
2. Create the database: `CREATE DATABASE helpdesk;`
3. `bun install` generates the Prisma client automatically.

## Commands

Run from the project root:

| Command | What it does |
|---|---|
| `bun install` | Install dependencies for both packages |
| `bun run dev` | Start the API on :3000 and the client on :5173 (hot reload); the client proxies `/api` to the API |
| `bun run build` | Build the client into `client/dist` |
| `bun run start` | Run the server in production mode, serving the API and the built client on :3000 |
| `bun run typecheck` | Type-check both packages |

Database commands, run from `server/`:

| Command | What it does |
|---|---|
| `bun run db:migrate` | Create and apply a migration after changing `prisma/schema.prisma` |
| `bun run db:generate` | Regenerate the Prisma client |
| `bun run db:deploy` | Apply pending migrations (production) |
| `bun run db:studio` | Open Prisma Studio to browse data |

## Environment

`server/.env` is required (`DATABASE_URL`). Copy `client/.env.example` to `client/.env` only to change client ports. Bun loads `.env` files automatically.
