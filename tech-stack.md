# Tech Stack

## Frontend

* React with TypeScript
* Tailwind CSS
* shadcn/ui (Base UI primitives, default theme)
* React Router
* React Hook Form + Zod for forms and validation
* Axios for API requests, with TanStack Query for fetching and caching server data
* TanStack Table (headless) for data tables, with sorting done on the server

## Backend

* Node.js with Express and TypeScript
* Better Auth (email/password, database sessions) for authentication

## Database

* PostgreSQL

## ORM

* Prisma

## Testing

* Playwright for end-to-end tests, against a separate `helpdesk_test` database
* bun test + React Testing Library (with happy-dom) for client component tests
* bun test for server route unit tests, with Prisma mocked

## AI

* Claude API (Anthropic) for ticket classification, summaries, and suggested replies

## Email

* SendGrid or Mailgun for outbound replies and inbound webhooks

## Deployment

* Docker + cloud provider (AWS, Railway, Fly.io, etc.)
