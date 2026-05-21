# 01 — Backend

This folder holds the server-side code for PrintLoop. The backend handles:

- User authentication (sign in, sign up, OTP)
- Print job creation, payment, and code generation
- Kiosk authentication and job dispatch
- Group printing sessions
- Admin dashboard data (stats, audit log)
- Webhooks (Paystack payment confirmation, Termii SMS delivery)
- Background workers (file cleanup, watermarking, scheduled tasks)
- Refunds and wallet transactions

## What's inside

```
01-backend/
├── app.ts                   ← Main Express app setup
├── server.ts                ← Server entry point (run this)
├── controllers/             ← Request handlers (the "doors" customers knock on)
├── services/                ← Business logic (what happens behind those doors)
├── entities/                ← Database table definitions
├── middleware/              ← Things that run before every request
│                              (auth checks, rate limiting, etc.)
├── routes/                  ← URL → controller mapping
├── workers/                 ← Background jobs (queue processors)
├── migrations/              ← Database schema changes
├── scripts/                 ← Utility scripts (seed data, etc.)
├── config/                  ← Redis, queue configuration
├── DIRECTORY_MAPPING.md     ← Detailed file-by-file map
└── .env.example             ← Template for your config file
```

## How to run it

See **`PrintLoop-Setup-Manual.docx`** in the parent folder, Parts 3-4.
Quick local-dev version:

```
npm install
npm run dev
```

Server listens on `http://localhost:4000` by default.

The current local dev server uses a small persisted JSON store at `data/dev-store.json` so the frontend can run end-to-end without MySQL, Redis, Paystack, or Cloudinary.

## Tech stack

- **Node.js + TypeScript** — runtime and language
- **Express** — web server framework
- **TypeORM** — database access (talks to MySQL)
- **MySQL** — database
- **Redis + BullMQ** — job queues (background workers)
- **Cloudinary** — file storage
- **Paystack** — payment processing
- **Termii** — SMS delivery
- **JWT** — authentication tokens

## Environment variables you'll need

The full list is in `.env.example`. The most important ones:

- `DATABASE_*` — MySQL connection details
- `REDIS_*` — Redis connection details
- `JWT_SECRET` — a long random string used to sign auth tokens
- `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` — get these at https://dashboard.paystack.com
- `TERMII_API_KEY` — get this at https://termii.com
- `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` — get these at https://cloudinary.com
- `WATERMARK_LOGO_URL` — public URL to PrintLoop logo for group session watermarks

## When deploying

Set all these environment variables in your hosting provider (Railway, Render, Fly.io). Run `npm run migration:run` once after deployment so the database structure is created.

## When something doesn't work

The setup manual has a "When something goes wrong" appendix. Most issues are:
- MySQL/Redis not running locally
- Wrong password in `.env`
- Forgot to run `npm install`
- Port 4000 already in use
