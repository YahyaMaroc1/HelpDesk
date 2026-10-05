# HelpDesk

AI-powered ticket management system: receives support emails, creates tickets, and uses Claude to classify, summarize and suggest replies. Agents work tickets; one admin manages users.

## Key documents

- `project-scope.md` – features, ticket statuses/categories, roles. The source of truth for requirements.
- `tech-stack.md` – the agreed stack. Don't add technologies outside it without asking.
- `implementation-plan.md` – phased task list. Follow the phase order and tick off tasks (`- [x]`) as they're completed.

## Documentation

Always use the Context7 MCP server (`resolve-library-id`, then `query-docs`) to fetch up-to-date documentation before writing or changing code that uses a library, framework, SDK, CLI or API (Bun, Express, React, React Router, Tailwind CSS, Prisma, PostgreSQL, the Claude API, SendGrid/Mailgun, Docker, etc.). Do this even for well-known libraries — versions here are recent (Express 5, React 19, TypeScript 7, Bun 1.4) and may differ from training data. Fall back to the official docs sites only if Context7 has no match or isn't available in the session.

## Structure

Bun workspaces with a single `bun.lock` at the root:

```
client/   React 19 + TypeScript, bundled by Bun (no Vite)
  dev.ts      Bun dev server: HMR + proxies /api to the server
  build.ts    production build (Bun.build + Tailwind plugin) into dist/
  bunfig.toml enables bun-plugin-tailwind for the dev server
  index.html  entry point
  src/        app code (React Router: App.tsx route table, pages/, components/)
  src/styles.css  Tailwind + shadcn theme (CSS variables, light and .dark)
  src/components/ui/  shadcn/ui components (generated; add with `bunx shadcn add <name>` from client/)
  src/lib/auth-client.ts  Better Auth React client (useSession, signIn, signOut)
  src/components/RequireAuth.tsx  protected layout route; redirects to /login without a session
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

## Authentication

Better Auth with email/password only. Sessions live in the Postgres `session` table (no cookie cache or secondary storage) and are sent as an httpOnly cookie.

**Server**
- Config is in `server/src/lib/auth.ts`. It reads `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` from `server/.env` and exports `auth` plus the `Session` type (`Session["user"]` includes `role`).
- The handler is mounted at `/api/auth/*splat` **before** `express.json()`, because it needs the raw body.
- Protect a route with the `requireAuth` middleware (`server/src/middleware/requireAuth.ts`). It answers 401 `{ error: "Unauthorized" }` without a session; otherwise it sets `res.locals.user` / `res.locals.session` (type them with `Session["user"]`, as in `routes/me.ts`). Elsewhere, call `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })`.
- No role-based middleware exists yet. Admin-only routes need a check on `res.locals.user.role === Role.ADMIN` after `requireAuth`, with `Role` imported from `src/generated/prisma/enums.ts`.
- `GET /api/me` returns the current user and is the example of a protected route.

**Users and roles**
- `User.role` is a Prisma `Role` enum (`ADMIN`, `AGENT`; default `AGENT`). It's registered in `auth.ts` as an `additionalField` with `input: false`, so it's on the session user but clients can never set it.
- Public sign-up is disabled (`disableSignUp`), which also blocks `auth.api.signUpEmail`. Create users server-side the way `prisma/seed.ts` does: `(await auth.$context).internalAdapter.createUser(...)`, then `linkAccount({ providerId: "credential", accountId: user.id, password: await ctx.password.hash(pw) })`, lowercasing the email.
- `bun run db:seed` (from `server/`) creates the admin from `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `server/.env`, and skips it if it already exists.
- Better Auth's tables (`user`, `session`, `account`, `verification`) are generated with `bunx auth@latest generate --config src/lib/auth.ts --output prisma/schema.prisma`. Re-run it after changing the auth config or plugins, then `bun run db:migrate`. The generator writes `role` as `String`, so restore the `Role` enum before migrating.

**Client**
- `client/src/lib/auth-client.ts` exports `authClient` (`useSession`, `signIn.email`, `signOut`). It uses the default base URL `/api/auth` (same origin through the dev proxy). `inferAdditionalFields` types `role` on the session user, but only as `string`, so keep it in sync with `auth.ts` if fields change.
- `components/RequireAuth.tsx` is a layout route: it shows "Loading…" while the session loads and redirects to `/login` without one. Put every signed-in page under it in `App.tsx`.
- `components/RequireAdmin.tsx` is a layout route nested inside `RequireAuth`/`Layout`: it redirects non-admins to `/`. Put admin-only pages (e.g. `/users`) under it. It's a UI guard only; admin API routes still need their own server-side role check.
- `pages/LoginPage.tsx` signs in with `authClient.signIn.email` and redirects to `/` once `useSession` has a session; it also redirects already-signed-in users. `Layout.tsx` has the nav bar (admin-only links like Users, shown when `session.user.role === "ADMIN"`) and the sign-out button. Both rely on the session store refetching rather than navigating by hand.

**Origin check (CSRF)**
- `trustedOrigins` is only `CLIENT_ORIGIN` (`http://localhost:5173` in `.env.example`). The dev proxy forwards the browser's `Origin`, so cookie-bearing auth requests (sign-in, sign-out) from any other origin get 403 `INVALID_ORIGIN`. This includes a test client on another port. In production the API serves the client, so the page's origin is `BETTER_AUTH_URL`, which Better Auth trusts by default. Set `CLIENT_ORIGIN` only when the client is served from a different origin.

## Commands

Run from the project root:

- `bun install` – install dependencies (use `bun add` inside `client/` or `server/` to add packages; never npm/yarn)
- `bun run dev` – API on :3000, client on :5173. The user often leaves it running: check the ports before starting another. Restart it after changing a `tsconfig.json`, because the dev server reads path aliases only at startup (`bun run build` and `tsc` pick them up immediately).
- `bun run build` – build the client into `client/dist`
- `bun run start` – production: API + built client on :3000
- `bun run typecheck` – type-check both packages; run it after every change

## Conventions

- All API routes live under `/api`; the client calls relative `/api/...` URLs.
- Express 5: async handlers forward rejected promises to the error handler automatically (no manual `next(err)`); wildcards must be named (`/*splat`).
- Local imports include the `.ts`/`.tsx` extension. In the client, `@/*` maps to `client/src/*`.
- shadcn/ui is set up manually (`client/components.json`, style `base-nova`, neutral) because the CLI can't detect a framework with Bun's bundler, so `init` fails but `add` works. `add` doesn't always install a component's npm dependencies (e.g. `@base-ui/react`): `bun add` them yourself if typecheck can't find them.
- Build UI from shadcn components and theme tokens (`bg-background`, `text-muted-foreground`, `text-destructive`, …), not raw Tailwind palette colors like `gray-500`. `pages/LoginPage.tsx` is the reference form: React Hook Form + Zod with `Field`/`FieldLabel`/`Input`/`FieldError`, plus an `Alert` for server errors. `Layout.tsx` and `HomePage.tsx` still use the old raw styling.
- `styles.css` hides Chrome's autofill colors with an unlayered `:autofill` rule (a long transition delay, because Chrome's background is `!important`). Keep it outside `@layer`, or the `transition-colors` utility on `Input` overrides it.
- Bun loads `.env` automatically; keep `.env.example` files up to date and never commit `.env`.
- Ticket statuses: `OPEN`, `RESOLVED`, `CLOSED`. Categories: `GENERAL_QUESTION`, `TECHNICAL_QUESTION`, `REFUND_REQUEST`. Roles: `ADMIN`, `AGENT`.
