# HelpDesk

AI-powered ticket management system: receives support emails, creates tickets, and uses Claude to classify, summarize and suggest replies. Agents work tickets; one admin manages users.

## Key documents

- `project-scope.md` – features, ticket statuses/categories, roles. The source of truth for requirements.
- `tech-stack.md` – the agreed stack. Don't add technologies outside it without asking.
- `implementation-plan.md` – phased task list. Follow the phase order and tick off tasks (`- [x]`) as they're completed.

## Documentation

Always use the Context7 MCP server (`resolve-library-id`, then `query-docs`) to fetch up-to-date documentation before writing or changing code that uses a library, framework, SDK, CLI or API (Bun, Express, React, React Router, Tailwind CSS, Prisma, PostgreSQL, the Claude API, SendGrid/Mailgun, Docker, etc.). Do this even for well-known libraries — versions here are recent (Express 5, React 19, TypeScript 7, Bun 1.4) and may differ from training data. Fall back to the official docs sites only if Context7 has no match.

## Structure

Bun workspaces with a single `bun.lock` at the root:

```
client/   React 19 + TypeScript, bundled by Bun (no Vite)
  dev.ts      Bun dev server: HMR + proxies /api to the server
  index.html  entry point
  src/        app code
server/   Express 5 + TypeScript, running on Bun
  src/index.ts   starts the server
  src/app.ts     Express app, routes, error handler, serves client/dist in production
  src/routes/    one router per resource, mounted under /api
  src/lib/prisma.ts  the shared PrismaClient (import `prisma` from here; never create another)
  src/lib/auth.ts    Better Auth config (email/password, sessions stored in Postgres)
  src/middleware/requireAuth.ts  401s without a session; sets res.locals.user / res.locals.session
  src/generated/     generated Prisma client (gitignored; don't edit)
  prisma/schema.prisma, prisma.config.ts   Prisma 7 schema and CLI config
```

## Database

- Local PostgreSQL 18 (Windows service), database `helpdesk`. Connection string is `DATABASE_URL` in `server/.env`.
- Prisma 7.10.0 (pinned; the npm `latest` tag for `prisma` is an 8.0 RC — don't upgrade to it). Uses the `prisma-client` generator with the `@prisma/adapter-pg` driver adapter.
- Run Prisma CLI through the `db:*` scripts in `server/` (they use `bun --bun prisma ...`). After changing the schema: `bun run db:migrate` from `server/`.
- `psql` is not on PATH: use `"/c/Program Files/PostgreSQL/18/bin/psql.exe"`.

## Commands

Run from the project root:

- `bun install` – install dependencies (use `bun add` inside `client/` or `server/` to add packages; never npm/yarn)
- `bun run dev` – API on :3000, client on :5173
- `bun run build` – build the client into `client/dist`
- `bun run start` – production: API + built client on :3000
- `bun run typecheck` – type-check both packages; run it after every change

## Conventions

- All API routes live under `/api`; the client calls relative `/api/...` URLs.
- Better Auth is mounted at `/api/auth/*splat` **before** `express.json()` (it needs the raw body). Its tables (`user`, `session`, `account`, `verification`) are generated with `bunx auth@latest generate --config src/lib/auth.ts --output prisma/schema.prisma`; re-run after changing auth config/plugins, then `bun run db:migrate` (the generator writes `role` as `String`, so restore the `Role` enum before migrating). `User.role` is registered in `auth.ts` as an `additionalField` with `input: false`, so it is on the session user but clients can never set it. Public sign-up is disabled (`disableSignUp`), which also blocks `auth.api.signUpEmail`; create users server-side via `internalAdapter.createUser` + `linkAccount` as in `prisma/seed.ts`. Seed the admin with `bun run db:seed` (from `ADMIN_*` in `server/.env`).
- Express 5: async handlers forward rejected promises to the error handler automatically (no manual `next(err)`); wildcards must be named (`/*splat`).
- Local imports include the `.ts`/`.tsx` extension.
- Bun loads `.env` automatically; keep `.env.example` files up to date and never commit `.env`.
- Ticket statuses: `OPEN`, `RESOLVED`, `CLOSED`. Categories: `GENERAL_QUESTION`, `TECHNICAL_QUESTION`, `REFUND_REQUEST`. Roles: `ADMIN`, `AGENT`.
