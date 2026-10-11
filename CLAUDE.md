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
  src/lib/api.ts  shared axios instance (`api`, baseURL /api) and `apiErrorMessage(err)`
  src/lib/query-client.ts  the TanStack Query `QueryClient` (provided in main.tsx; retry policy)
  src/lib/role.ts  re-exports the Prisma `Role` enum for client code (compare `Role.ADMIN`, never `"ADMIN"`)
  src/components/RequireAuth.tsx  protected layout route; redirects to /login without a session
  src/**/*.test.tsx  component tests (bun test + React Testing Library); src/test/ has shared helpers
  happydom.ts, test-setup.ts, testing.d.ts  component test setup (preloaded via bunfig.toml)
server/   Express 5 + TypeScript, running on Bun
  src/index.ts   starts the server
  src/app.ts     Express app, routes, error handler, serves client/dist in production (and NODE_ENV=test)
  src/routes/    one router per resource, mounted under /api
  src/**/*.test.ts  route unit tests (bun test, Prisma mocked; see "Server unit tests")
  src/lib/prisma.ts  the shared PrismaClient (import `prisma` from here; never create another)
  src/lib/auth.ts    Better Auth config (email/password, sessions stored in Postgres)
  src/middleware/requireAuth.ts  401s without a session; sets res.locals.user / res.locals.session
  src/middleware/requireAdmin.ts 403s non-admins; use after requireAuth
  src/generated/     generated Prisma client (gitignored; don't edit)
  prisma/schema.prisma, prisma.config.ts   Prisma 7 schema and CLI config
e2e/      Playwright end-to-end tests (runs on Node, not Bun)
  playwright.config.ts  starts a test server on :3100 against the test database
  test-env.ts  loads e2e/.env, test port/URL, the seeded test admin (`testAdmin`)
  tests/       *.spec.ts files
```

## Which tests to write

**Unit tests by default; e2e tests only for what unit tests can't check.** This is a strict rule, not a preference.

- Cover every behavior with unit tests: client work with component tests, server routes with server unit tests (both below). That includes validation, status codes, lookups and what gets written, rendering states, what a form or mutation sends, and what a role sees given a stubbed session.
- Write an e2e test only when the behavior can't be checked with the API, Prisma or Better Auth stubbed:
  - real sessions and cookies: sign-in/sign-out, session invalidation (deleted user, changed password), origin checks, sign-in rules Better Auth applies (e.g. case-insensitive email)
  - that a server-side guard is wired to a route: `requireAuth` / `requireAdmin` on a router mount (one 401/403 check per mount, not per route)
  - flows across systems: e.g. an emailed reply arriving through the webhook and showing on the ticket page, the signed-in user recorded as a reply's sender
- Never write an e2e test for something a unit test covers or could cover. If the unit test is missing, write it instead. Before adding an e2e test, say what it checks that no unit test can; if you can't, don't add it.
- When a new unit test covers something an existing e2e test checks, delete that e2e test. Don't keep several e2e tests for one flow either: one test through the real stack is enough.

## Component tests

Component tests are the default for client work: fast, no server or database. Client components are tested with `bun test` + React Testing Library on happy-dom, with the API stubbed (no server or database). `client/src/pages/UsersPage.test.tsx` is the reference.

**Running**
- `bun run test` from the root runs the client and server tests. From `client/`: `bun run test` (all once), `bun run test:watch` (reruns on save, while writing tests), `bun test UsersPage` (files whose path matches), `bun test -t "empty state"` (tests whose name matches).
- Never run `bun test` from the root: it would also pick up the Playwright specs in `e2e/`.
- After writing or changing tests, run `bun run test` and `bun run typecheck` (the test runner doesn't type-check).

**Setup** (already done; don't repeat it per file)
- `client/bunfig.toml` preloads `happydom.ts` (registers the DOM; must load before Testing Library) and `test-setup.ts` (jest-dom matchers, `cleanup()` after each test, and `BASE_UI_ANIMATIONS_DISABLED` so Base UI dialogs unmount on close instead of waiting for exit animations happy-dom never finishes). `client/testing.d.ts` types the matchers on `bun:test`'s `expect`.
- `client/src/test/` holds shared test helpers, e.g. `renderWithQuery`.

**Writing**
- Put `Name.test.tsx` next to the component. Import `describe`/`test`/`expect`/`spyOn`/`mock` from `bun:test` (not Jest or Vitest) and queries from `@testing-library/react`.
- Render with `renderWithQuery(<Page />)` from `@/test/render-with-query.tsx`; it wraps the component in the app's real `queryClient` (with its retry policy). Components that use React Router (`Link`, `useNavigate`, …) also need a `<MemoryRouter>` around them.
- Stub requests with `spyOn(api, "get")` (or `post`/`patch`/`delete`) on the shared `api` instance from `@/lib/api.ts`, resolving to `{ data }` or rejecting with an `AxiosError` that has a `response` (see `mockGetUsers` / `httpError` in the reference). Assert the path and arguments the component sent. Don't mock axios or TanStack Query themselves.
- In `afterEach`, call `queryClient.clear()` (cached data would leak into the next test) and `mock.restore()` (undoes the spies).
- Cover each state the component renders: pending (a never-settling promise), data, empty and error. Use 4xx errors for error states: 5xx and network errors are retried once with a delay, which slows the test.
- Query the way users and assistive tech see the page: `getByRole` (with `name`), `getByText`, `within(...)`; avoid class names, test IDs and `container.querySelector`. Use `findBy*` to wait for data, and `queryBy*` with `.not.toBeInTheDocument()` for absence. To wait for something to disappear, use `waitForElementToBeRemoved(el)`, not `waitFor(() => expect(...).not.toBeInTheDocument())`: each failed attempt makes Bun format a happy-dom element for the error message, which can take tens of seconds.
- Simulate input with `fireEvent` from `@testing-library/react` (`user-event` isn't installed).
- Better Auth's `authClient` can't be created under happy-dom (it needs the page's URL), so for components that use it, `mock.module("@/lib/auth-client.ts", ...)` with a stub `useSession` / `signIn.email` before `await import()`-ing the component. `pages/LoginPage.test.tsx` is the example.
- Build locale-dependent expectations the way the component does (e.g. `new Date(x).toLocaleDateString()`), not hard-coded strings.

## Server unit tests

Route logic (validation, lookups, status codes) is unit-tested with `bun test` in `server/`, without a database or server process. `server/src/routes/tickets.test.ts` is the reference.

- Run with `bun run test` from `server/` (or the root, with the client tests).
- `mock.module("../lib/prisma.ts", () => ({ prisma }))` with a fake `prisma` of `mock()` functions, then `await import()` the router, so the real client (which needs `DATABASE_URL`) never loads. Reset the mocks in `beforeEach` and give them default results.
- Mount the router on its own `express()` app behind `express.json()`, `listen(0)` in `beforeAll` (close it in `afterAll`) and call it with `fetch`. Sessions are checked by `requireAuth` in `app.ts`, not by routers, so these tests leave auth out. A route that reads `res.locals.user` or `res.locals.session` gets them from a small middleware in the test app (see the replies tests in `tickets.test.ts`).
- Routes that call Better Auth (`routes/users.ts`) also get `mock.module("../lib/auth.ts", ...)` with a fake `auth.$context` (`internalAdapter`, `password.hash`) and `passwordLength`; see `users.test.ts`. The webhook router is mounted without `express.json()`, as in `app.ts`, and its tests set `INBOUND_EMAIL_SECRET`; see `webhooks.test.ts`.
- Assert the status and body, the arguments sent to Prisma, and that nothing is written when a request is rejected.

## End-to-end tests

- **Last resort.** Only for what unit tests can't check; see "Which tests to write" above. Start each new spec with a comment saying what it checks that the unit tests don't. If unsure whether a change warrants one, write unit tests and ask before adding e2e coverage.
- **Write e2e tests with the `e2e-test-writer` subagent** (`.claude/agents/e2e-test-writer.md`, Sonnet). Don't write them inline. Delegate whenever a task adds, extends or fixes Playwright tests. In the prompt, say what to cover (pages, flows, roles, edge cases) and point to the relevant routes and components; it starts without this conversation's context. It knows the test setup and conventions, checks its work with `bun run typecheck` and `bunx playwright test --list`, but doesn't run the tests. Afterwards, review its report and changes, pass on the command it gives for running the tests (e.g. `! bun run test:e2e`), and ask the user to run it.
- `bun run test:e2e` (root) or `bun run test` / `test:ui` / `report` from `e2e/`. Browsers: `bunx playwright install chromium` from `e2e/`.
- The tests use their own database, `TEST_DATABASE_URL` in `e2e/.env` (copy `e2e/.env.example`). The name must end in `_test`, or `test-env.ts` refuses to run, because every run wipes it.
- On every run (no server reuse), Playwright's `webServer` runs `prisma migrate reset --force` (it creates the DB if missing), then `prisma db seed` (Prisma 7 no longer seeds on reset), then builds the client and starts the API with `NODE_ENV=test` on `TEST_PORT` (3100), which serves the built client like production but without rate limiting. The browser and API share one origin, so no `CLIENT_ORIGIN` is needed. It's separate from the dev server on :3000/:5173, so both can run at once. Its env overrides `server/.env`; `BETTER_AUTH_SECRET` still comes from `server/.env`.
- The seed creates `testAdmin` (from `test-env.ts`); right after it, `server/prisma/seed-e2e.ts` (run by the `webServer` command, not part of `bun run db:seed`) creates the AGENT users `testAgent` and `testEscalationAgent` from the `E2E_AGENTS` env var. Import them in tests rather than hard-coding credentials. Use `testEscalationAgent` for tests that try to mutate a user; `testAgent` is shared and read-only.
- A `setup` project (`tests/auth.setup.ts`) signs in as admin and agent through the API and saves `e2e/playwright/.auth/admin.json` / `agent.json` (`adminAuthFile` / `agentAuthFile` in `test-env.ts`); the `chromium` project depends on it. Use them via `test.use({ storageState })`, and `{ cookies: [], origins: [] }` for signed-out tests. Tests that sign out must sign in themselves, or they delete the shared session server-side.
- Rate limiting is off on the test server (`NODE_ENV=test`), so tests can sign in as often as they need. Saving a `storageState` is still faster than signing in in every test.
- Prisma blocks `migrate reset` when Claude Code runs it, so `bun run test:e2e` fails when run by an agent unless the user explicitly consents (`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`).

## Database

- Local PostgreSQL 18 (Windows service). Dev database `helpdesk` (`DATABASE_URL` in `server/.env`); e2e database `helpdesk_test` (`TEST_DATABASE_URL` in `e2e/.env`), which every e2e run wipes and re-seeds.
- Prisma 7.10.0 (pinned; the npm `latest` tag for `prisma` is an 8.0 RC — don't upgrade to it). Uses the `prisma-client` generator with the `@prisma/adapter-pg` driver adapter.
- Run Prisma CLI through the `db:*` scripts in `server/` (they use `bun --bun prisma ...`). After changing the schema: `bun run db:migrate` from `server/`.
- `psql` is not on PATH: use `"/c/Program Files/PostgreSQL/18/bin/psql.exe"`.

## Authentication

Better Auth with email/password only. Sessions live in the Postgres `session` table (no cookie cache or secondary storage) and are sent as an httpOnly cookie.

**Server**
- Config is in `server/src/lib/auth.ts`. It reads `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` from `server/.env` and exports `auth` plus the `Session` type (`Session["user"]` includes `role`).
- The handler is mounted at `/api/auth/*splat` **before** `express.json()`, because it needs the raw body.
- Protect a route with the `requireAuth` middleware (`server/src/middleware/requireAuth.ts`). It answers 401 `{ error: "Unauthorized" }` without a session; otherwise it sets `res.locals.user` / `res.locals.session` (type them with `Session["user"]`, as in `routes/me.ts`). Elsewhere, call `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })`.
- Protect admin-only routes with `requireAdmin` after `requireAuth` (403 `{ error: "Forbidden" }` unless `role === Role.ADMIN`). Mount it on the whole router, e.g. `app.use("/api/users", requireAuth, requireAdmin, usersRouter)`. The client's `RequireAdmin` only hides pages; every admin API route needs this server-side check.
- `GET /api/me` returns the current user and is the example of a protected route.

**Users and roles**
- `User.role` is a Prisma `Role` enum (`ADMIN`, `AGENT`; default `AGENT`). It's registered in `auth.ts` as an `additionalField` with `input: false`, so it's on the session user but clients can never set it. **Never hard-code role strings** (`"ADMIN"`, `"AGENT"`): use the enum. On the server, `import { Role } from "../generated/prisma/enums.ts"` and set or compare `Role.AGENT` / `Role.ADMIN` (e.g. `POST /api/users` creates users with `role: Role.AGENT`). In the client, import the same enum from `@/lib/role.ts` (a re-export of the generated file) for comparisons like `session.user.role === Role.ADMIN` and for typing API data (`role: Role`).
- Public sign-up is disabled (`disableSignUp`), which also blocks `auth.api.signUpEmail`. Create users server-side the way `prisma/seed.ts` and `POST /api/users` (`routes/users.ts`) do: `(await auth.$context).internalAdapter.createUser(...)`, then `linkAccount({ providerId: "credential", accountId: user.id, password: await ctx.password.hash(pw) })`, lowercasing the email. Hashing directly skips Better Auth's password-length check (8–128 characters, from `passwordLength` in `auth.ts`), so check it yourself: the seed reads `ctx.password.config`; routes use `passwordLength` in their Zod schema.
- `bun run db:seed` (from `server/`) creates the admin from `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `server/.env`, and skips it if it already exists.
- Better Auth's tables (`user`, `session`, `account`, `verification`) are generated with `bunx auth@latest generate --config src/lib/auth.ts --output prisma/schema.prisma`. Re-run it after changing the auth config or plugins, then `bun run db:migrate`. The generator writes `role` as `String` and doesn't know `deletedAt`, so restore the `Role` enum and the `deletedAt` column before migrating.
- Users are **soft-deleted** (`DELETE /api/users/:id` sets `User.deletedAt` and deletes their sessions; admins can't be deleted). Query active users with `where: { deletedAt: null }` (e.g. lists, agent pickers); a deleted user's row and email stay, so their email can't be reused (409). The `session.create.before` hook in `auth.ts` blocks their sign-in with the same error as a wrong password.

**Client**
- `client/src/lib/auth-client.ts` exports `authClient` (`useSession`, `signIn.email`, `signOut`). It uses the default base URL `/api/auth` (same origin through the dev proxy). `inferAdditionalFields` types `role` on the session user, but only as `string`, so keep it in sync with `auth.ts` if fields change.
- `components/RequireAuth.tsx` is a layout route: it shows "Loading…" while the session loads and redirects to `/login` without one. Put every signed-in page under it in `App.tsx`.
- `components/RequireAdmin.tsx` is a layout route nested inside `RequireAuth`/`Layout`: it redirects non-admins to `/`. Put admin-only pages (e.g. `/users`) under it. It's a UI guard only; admin API routes still need their own server-side role check.
- `pages/LoginPage.tsx` signs in with `authClient.signIn.email` and redirects to `/` once `useSession` has a session; it also redirects already-signed-in users. `Layout.tsx` has the nav bar (admin-only links like Users, shown when `session.user.role === "ADMIN"`) and the sign-out button. Both rely on the session store refetching rather than navigating by hand.

**Rate limiting**
- Better Auth's rate limiter is on only when `NODE_ENV=production` (`bun run start`): `rateLimit: { enabled: process.env.NODE_ENV === "production", storage: "database" }`, with counters in the `rateLimit` table. Sign-in then allows 3 requests per 10 s per IP (429 `Too many requests`). It's off in dev (`bun run dev`) and on the e2e test server (`NODE_ENV=test`).
- Better Auth reads the client IP from `X-Forwarded-For`. `app.ts` overwrites that header on `/api/auth` with Express's `req.ip`, so clients can't spoof it. Behind a reverse proxy, set `TRUST_PROXY` (Express's `trust proxy` value: proxy address/CIDR or hop count) so `req.ip` is the real client; otherwise everyone shares the proxy's IP and one limit.

**Origin check (CSRF)**
- `trustedOrigins` is only `CLIENT_ORIGIN` (`http://localhost:5173` in `.env.example`). The dev proxy forwards the browser's `Origin`, so cookie-bearing auth requests (sign-in, sign-out) from any other origin get 403 `INVALID_ORIGIN`. This includes a test client on another port. In production the API serves the client, so the page's origin is `BETTER_AUTH_URL`, which Better Auth trusts by default. Set `CLIENT_ORIGIN` only when the client is served from a different origin.

## Commands

Run from the project root:

- `bun install` – install dependencies (use `bun add` inside `client/`, `server/` or `e2e/` to add packages; never npm/yarn)
- `bun run dev` – API on :3000, client on :5173. The user often leaves it running: check the ports before starting another. Restart it after changing a `tsconfig.json`, because the dev server reads path aliases only at startup (`bun run build` and `tsc` pick them up immediately).
- `bun run build` – build the client into `client/dist`
- `bun run start` – production: API + built client on :3000, with `NODE_ENV=production` (turns on rate limiting). Deployments must set `NODE_ENV=production` too, or login isn't rate-limited.
- `bun run typecheck` – type-check all workspaces (client, server, e2e); run it after every change

## Inbound email

- No email provider is chosen yet (task 6.1). `POST /api/webhooks/inbound-email` (`server/src/routes/webhooks.ts`) takes a provider-neutral JSON email: `from`, `fromName?`, `subject?`, `text`, `messageId`, and the raw `inReplyTo?` / `references?` headers. A provider adapter will translate its payload into this shape.
- It's not session-authenticated: every request needs the `X-Webhook-Secret` header matching `INBOUND_EMAIL_SECRET` (401 otherwise; 503 if the variable is unset). The router is mounted before the app-wide `express.json()` so it checks the secret first and accepts bodies up to 1 MB.
- New email → 201 `{ ticketId, result: "created" }` (an `OPEN` ticket with its first `CUSTOMER` message). A reply whose `In-Reply-To`/`References` matches a stored `Message.emailMessageId` → 200 `"appended"` to that ticket, reopening it if `RESOLVED`. A repeated Message-ID → 200 `"duplicate"` (unique index, so concurrent redeliveries are safe too). Message-IDs are stored without angle brackets.
- `bun run email:sample` (from `server/`, needs the API running) posts a sample email; `--reply-to <Message-ID>` sends a reply to it. `API_URL` targets another server.
- `bun run tickets:sample` (from `server/`) inserts 100 varied sample tickets into the dev database through Prisma (statuses, categories incl. unclassified, assignees from the active users incl. unassigned, dates over the last 90 days), for trying out sorting and filtering. It refuses if they exist; `--reset` replaces them. They are marked by `@sample.helpdesk.invalid` Message-IDs, so `--reset` leaves other tickets alone.

## AI reply polishing

- The ticket page's reply form has a **Polish** button: `POST /api/tickets/:id/replies/polish` (same body as `/replies`) rewrites the draft with Google Gemini `gemini-3.5-flash-lite` (free tier) through the Vercel AI SDK and returns `{ body }` without saving; the agent reviews it and sends it as usual. The code, not the model, adds the greeting (`Hi <customer's first name>,`, or `Hi there,`) and the sign-off (`Best regards,` + the agent's name); the prompt tells the model to leave both out.
- The AI call lives in `server/src/lib/ai.ts` (`polishReply`, `isPolishConfigured`); route tests `mock.module("../lib/ai.ts", ...)` so they never reach Gemini. It needs `GOOGLE_GENERATIVE_AI_API_KEY` in `server/.env` (503 without it; 502 if the call fails).

## Data fetching (client)

**Always use axios + TanStack Query for API calls in the client.** Never call `fetch` directly and never load data with `useEffect` + `useState`.

- **Reads:** `useQuery`. The `queryFn` calls axios through the shared `api` instance from `@/lib/api.ts` (baseURL `/api`, so paths are like `"/users"`) and passes the query's `signal` so the request is cancelled when it's no longer needed:
  ```tsx
  const { data: users, error } = useQuery({
    queryKey: ["users"],
    queryFn: async ({ signal }) => (await api.get<{ users: User[] }>("/users", { signal })).data.users,
  });
  ```
  `pages/UsersPage.tsx` is the reference, including its loading, error and empty states.
- **Writes:** `useMutation` with `api.post` / `api.patch` / `api.delete`, then `queryClient.invalidateQueries({ queryKey: [...] })` (from `useQueryClient()`) for every query the change affects.
- **Query keys** start with the resource name: `["users"]`, `["users", id]`, `["tickets", filters]`.
- **Data tables** use TanStack Table v9 (`useTable` with `tableFeatures`; the v8 API differs) in manual mode: the sort, filters and page live in React state, go into the query key and the request params (leave out empty filters), and the server sorts, filters and pages the rows (`manualSorting` / `manualPagination: true`, `rowCount` from the response's `total`, no client row models). A new sort or filter goes back to the first page. Debounce search text with `useDebouncedValue` (`@/hooks/use-debounced-value.ts`). Use `placeholderData: keepPreviousData` so the current rows stay while a new sort, filter or page loads. `GET /api/tickets` takes `page` (1-based) and `pageSize` (default 10, max 100) and returns `{ tickets, total }`. `pages/TicketsPage.tsx` (with `components/TicketFilters.tsx`) is the reference. Filter dropdowns use shadcn `NativeSelect`, which is accessible and testable with `fireEvent.change`. `GET /api/assignees` lists active users (id, name) for any signed-in user, for assignee pickers; `/api/users` is admin only.
- **Errors:** show them with `apiErrorMessage(error)` from `@/lib/api.ts` (the API's `{ error }` message, else `HTTP <status>`, else the network error).
- **One of each:** use the existing `api` instance and the `queryClient` from `@/lib/query-client.ts` (provided in `main.tsx`). Don't create another axios instance or `QueryClient`. Its retry policy (never retry 4xx; retry 5xx/network errors once) keeps errors fast; don't override it per query without a reason.
- **Sign-out** calls `queryClient.clear()` (`Layout.tsx`) so cached data never leaks to the next user on the same tab. Keep this if sign-out moves.
- **Exceptions:** Better Auth calls go through `authClient` (`useSession`, `signIn.email`, `signOut`), not axios or TanStack Query. `client/dev.ts` is the dev server's proxy, not app code, and keeps using `fetch`.

## Conventions

- All API routes live under `/api`; the client calls them as described in "Data fetching" above.
- Express 5: async handlers forward rejected promises to the error handler automatically (no manual `next(err)`); wildcards must be named (`/*splat`).
- **Validate data with Zod** (v4, `import { z } from "zod"`) on both sides. Client forms: React Hook Form + `zodResolver` (`pages/LoginPage.tsx` is the reference form). Server: give every route that takes input (body, params, query) a Zod schema and parse it with `validate(schema, input, res)` from `server/src/lib/validate.ts` (`const body = validate(schema, req.body, res); if (!body) return;`). On failure it answers 400 `{ error }` with the first issue's message (pass a status as the 4th argument, e.g. 404 for an invalid `:id`); use only its return value afterwards. Don't call `safeParse` and build the error response by hand in routes. Put the user-facing message on each rule, and on `z.string({ error })` so a missing or wrong-typed field gets it too. Keep a form's schema and its route's schema in sync (same rules and messages): `components/UserForm.tsx` and `routes/users.ts` are the reference pair. Don't hand-roll validation or add another validation library.
- Local imports include the `.ts`/`.tsx` extension. In the client, `@/*` maps to `client/src/*`.
- shadcn/ui is set up manually (`client/components.json`, style `base-nova`, neutral) because the CLI can't detect a framework with Bun's bundler, so `init` fails but `add` works. `add` doesn't always install a component's npm dependencies (e.g. `@base-ui/react`): `bun add` them yourself if typecheck can't find them.
- Build UI from shadcn components and theme tokens (`bg-background`, `text-muted-foreground`, `text-destructive`, …), not raw Tailwind palette colors like `gray-500`. `pages/LoginPage.tsx` is the reference form: React Hook Form + Zod with `Field`/`FieldLabel`/`Input`/`FieldError`, plus an `Alert` for server errors. `Layout.tsx` and `HomePage.tsx` still use the old raw styling.
- `styles.css` hides Chrome's autofill colors with an unlayered `:autofill` rule (a long transition delay, because Chrome's background is `!important`). Keep it outside `@layer`, or the `transition-colors` utility on `Input` overrides it.
- Bun loads `.env` automatically (Playwright runs on Node, so `e2e/test-env.ts` loads `e2e/.env` itself); keep `.env.example` files up to date and never commit `.env`.
- Ticket statuses: `OPEN`, `RESOLVED`, `CLOSED`. Categories: `GENERAL_QUESTION`, `TECHNICAL_QUESTION`, `REFUND_REQUEST`. Roles: `ADMIN`, `AGENT`.
