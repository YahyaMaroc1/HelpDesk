# Implementation Plan

Based on `project-scope.md` and `tech-stack.md`. Each task is small enough to finish and verify on its own. Phases are in build order; each one ends with something working.

## Phase 1 – Project Setup

- [x] 1.1 Create the repo structure: `client/` (React + TypeScript) and `server/` (Express + TypeScript)
- [x] 1.2 Set up the server: Express app, TypeScript config, dev script, `GET /health` endpoint
- [x] 1.3 Set up the client: React + TypeScript
- [ ] 1.4 Add a `docker-compose.yml` with a local PostgreSQL database
- [x] 1.5 Add Prisma to the server and connect it to the database
- [ ] 1.6 Add `.env.example` files for client and server (database URL, Claude API key, email keys, admin credentials)
- [x] 1.7 Configure the client dev server to proxy `/api` requests to the server 

**Done when:** client and server both run locally and the server can reach the database.

## Phase 2 – Database Schema

- [ ] 2.1 `User` model: name, email, password hash, role (`ADMIN` / `AGENT`), active flag, timestamps
- [x] 2.2 `Session` model: session ID, user ID, expiry
- [x] 2.3 `Ticket` model: subject, sender email and name, status (`OPEN` / `RESOLVED` / `CLOSED`), category (`GENERAL_QUESTION` / `TECHNICAL_QUESTION` / `REFUND_REQUEST`, nullable until classified), AI summary, assigned agent, timestamps
- [x] 2.4 `Message` model: ticket ID, sender type (customer / agent), body, sender, email message ID (for threading), timestamp
- [ ] 2.5 `KnowledgeBaseArticle` model: title, content, timestamps
- [ ] 2.6 Run the first migration
- [ ] 2.7 Seed script: create the admin from environment variables, plus a few knowledge base articles

**Done when:** the migration applies cleanly and the seed creates the admin.

## Phase 3 – Authentication

- [x] 3.1 Password hashing (handled by Better Auth)
- [x] 3.2 Login: Better Auth `POST /api/auth/sign-in/email` (creates a session row, sets an `HttpOnly` cookie)
- [x] 3.3 Logout: Better Auth `POST /api/auth/sign-out`
- [x] 3.4 `GET /api/me`: return the current user (also `GET /api/auth/get-session`)
- [ ] 3.5 `requireAuth` middleware: look up the session, reject expired sessions and inactive users
- [x] 3.6 `requireAdmin` middleware
- [x] 3.7 Client: login page
- [x] 3.8 Client: load the session on startup (Better Auth `useSession` → `GET /api/auth/get-session`)
- [x] 3.9 Client: protected routes that redirect to login, and a logout button

**Done when:** the seeded admin can log in, reload the page and stay logged in, and log out.

## Phase 4 – User Management (Admin Only)

- [x] 4.1 `GET /api/users`: list users
- [x] 4.2 `POST /api/users`: create an agent
- [ ] 4.3 `PATCH /api/users/:id`: edit name/email, activate or deactivate
- [ ] 4.4 Deactivating a user deletes their sessions so it takes effect immediately
- [ ] 4.5 Validate request bodies and return clear errors (e.g. duplicate email)
- [x] 4.6 Client: users page with a table of users
- [ ] 4.7 Client: create-agent form and edit/deactivate actions
- [x] 4.8 Client: hide the users page from agents in the navigation
- [x] 4.9 Soft-delete agents (`DELETE /api/users/:id` + confirmation on the users page); admins can't be deleted

**Done when:** the admin can create an agent, the agent can log in, and deactivating the agent logs them out.

## Phase 5 – Tickets Core

- [x] 5.1 `GET /api/tickets`: list tickets with filters (status, category, assigned agent, search text), sorting (created, updated) and pagination
- [x] 5.2 `GET /api/tickets/:id`: ticket with its messages
- [x] 5.3 `PATCH /api/tickets/:id`: change status, category or assigned agent
- [x] 5.4 Script to create sample tickets for development
- [ ] 5.5 Client: app layout (sidebar navigation, header with current user)
- [x] 5.6 Client: ticket list page with a table of tickets
- [x] 5.7 Client: filter controls (status, category, agent, search)
- [x] 5.8 Client: sortable columns and pagination
- [ ] 5.9 Keep filters and sorting in the URL so views can be shared and survive reloads
- [x] 5.10 Client: ticket detail page showing the message thread
- [x] 5.11 Client: controls on the detail page to change status, category and assignee

**Done when:** an agent can browse, filter, sort and open sample tickets and update them.

## Phase 6 – Inbound Email

- [ ] 6.1 Choose the provider (SendGrid or Mailgun) and set up an inbound domain/route
- [x] 6.2 `POST /api/webhooks/inbound-email`: parse sender, subject, body and message ID
- [x] 6.3 Verify the webhook signature or secret so only the provider can call it (shared secret in `X-Webhook-Secret`; add the provider's signature check in 6.1)
- [x] 6.4 New email → create a ticket (status Open) with its first message
- [x] 6.5 Reply to an existing thread → add a message to the existing ticket (match on `In-Reply-To` / `References`), and reopen it if it was Resolved
- [x] 6.6 Ignore duplicate deliveries of the same message ID
- [ ] 6.7 Strip quoted reply text and signatures where possible
- [x] 6.8 Test locally by sending sample webhook payloads to the endpoint

**Done when:** sending an email to the support address creates a ticket that shows up in the list.

## Phase 7 – Outbound Email

- [ ] 7.1 Email service wrapper for the chosen provider
- [ ] 7.2 `POST /api/tickets/:id/replies`: send the reply and save it as an outbound message (saving is done; sending waits for 7.1)
- [ ] 7.3 Set `In-Reply-To` / `References` headers so replies thread in the customer's inbox
- [ ] 7.4 Option to mark the ticket Resolved when sending a reply
- [x] 7.5 Client: reply box on the ticket detail page
- [ ] 7.6 Handle send failures: show an error and don't save the message as sent

**Done when:** an agent can reply from the app and the customer receives it in the same email thread.

## Phase 8 – AI Classification and Summaries

- [ ] 8.1 Claude API client wrapper with the API key from the environment, timeouts and retries
- [x] 8.2 Classification: prompt that returns exactly one of the three categories in a structured format; validate the response
- [x] 8.3 Summary: prompt that produces a short summary of the ticket thread
- [ ] 8.4 Run classification and summary after a ticket is created, without blocking the webhook response (classification is done; the automatic summary is still to do)
- [ ] 8.5 Re-run the summary when a new inbound message arrives
- [ ] 8.6 If an AI call fails, keep the ticket usable (category empty, no summary) and log the error
- [ ] 8.7 Client: show the category and summary on the ticket list and detail page
- [ ] 8.8 Client: agents can override the AI category manually
- [ ] 8.9 Test the prompts against a set of sample emails for each category

**Done when:** new tickets are classified and summarized automatically within a few seconds.

## Phase 9 – Knowledge Base and AI Suggested Replies

- [ ] 9.1 Knowledge base API: list, create, edit and delete articles (admin only for changes)
- [ ] 9.2 Client: knowledge base page to manage articles
- [ ] 9.3 Find relevant articles for a ticket using PostgreSQL full-text search
- [ ] 9.4 Suggested reply: prompt Claude with the ticket thread and matching articles to write a friendly, personalized reply
- [ ] 9.5 Instruct the model to say when the knowledge base doesn't cover the question instead of guessing
- [ ] 9.6 `POST /api/tickets/:id/suggested-reply`: generate a suggestion on demand
- [ ] 9.7 Generate a suggestion automatically for new tickets
- [ ] 9.8 Client: "Use suggestion" fills the reply box so the agent can edit it before sending
- [ ] 9.9 Client: "Regenerate" button
- [x] 9.10 Auto-resolve new tickets that the knowledge base (`knowledge-base.md`) answers: tickets start New, are Processing while a background job tries to answer them with AI, then become Resolved (with the AI's reply) or Open; New and Processing tickets are hidden from the list

**Done when:** an agent opens a ticket, sees a suggested reply based on the knowledge base, edits it and sends it.

## Phase 10 – Dashboard

- [ ] 10.1 `GET /api/dashboard`: ticket counts by status and category, tickets per agent, unassigned open tickets
- [ ] 10.2 Client: dashboard page with summary cards
- [ ] 10.3 Client: lists of recent and unassigned tickets that link to the ticket detail page
- [ ] 10.4 Make the dashboard the landing page after login

**Done when:** an agent or admin can see the state of all tickets at a glance and jump into any of them.

## Phase 11 – Polish and Hardening

- [ ] 11.1 Loading, empty and error states on every page
- [ ] 11.2 Consistent API error format and a global error handler
- [ ] 11.3 Rate limiting on login
- [ ] 11.4 Security headers and CORS restricted to the client origin
- [ ] 11.5 Clean up expired sessions periodically
- [ ] 11.6 Tests for auth, permissions, the inbound webhook and ticket updates
- [ ] 11.7 Review the responsive layout and basic accessibility (labels, keyboard navigation)

**Done when:** the main flows work end to end with no unhandled errors.

## Phase 12 – Deployment

- [ ] 12.1 Dockerfile for the server (build TypeScript, run migrations on start)
- [ ] 12.2 Build the client and serve it from the server or a static host
- [ ] 12.3 Choose a cloud provider (AWS, Railway, Fly.io, etc.) and create a managed PostgreSQL database
- [ ] 12.4 Set production environment variables and secrets
- [ ] 12.5 Deploy and run the seed script to create the admin
- [ ] 12.6 Point the email provider's inbound webhook at the production URL
- [ ] 12.7 Verify the full flow in production: email in → ticket created → classified and summarized → suggested reply → reply sent → customer receives it

**Done when:** the system is live and handles real support email.
