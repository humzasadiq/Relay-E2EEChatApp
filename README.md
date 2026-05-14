# Relay — Installation Guide

> Assumes Node.js (≥ 20) and npm are already installed.

---

## 1. Clone the repository

```bash
git clone https://github.com/humzasadiq/Relay-E2EEChatApp
cd Relay-E2EEChatApp
```

---

## 2. Backend Setup (`relay-backend`)

### 2.1 Install dependencies

```bash
cd relay-backend
npm install
```

### 2.2 Configure environment

Copy the example env file and fill in the values:

```bash
cp .env.example .env
```

Open `.env` and set the following:

```env
# ── Database ──────────────────────────────────────────────────────────────
# Leave blank to run in in-memory mode (no persistence, no PostgreSQL needed).
# Set a full PostgreSQL connection string to enable persistence.
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/relay

# ── Server ────────────────────────────────────────────────────────────────
PORT=4000
CORS_ORIGIN=http://localhost:3000   # comma-separate for multiple origins

# ── Auth (change both secrets before any deployment) ─────────────────────
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d

```

### 2.3 Set up PostgreSQL (skip if using in-memory mode)

Install PostgreSQL if it isn't already running, then create the database: (or you can use neondb or supabase)

```bash
# Example using psql
psql -U postgres -c "CREATE DATABASE relay;"
```

### 2.4 Run database migrations

```bash
npx prisma migrate deploy
```

This applies all migrations under `prisma/migrations/` and generates the Prisma client.

> For local development you can also use `npx prisma migrate dev` which applies migrations and regenerates the client in one step.

```

### 2.6 Start the backend

```bash
# Development (watch mode — auto-restarts on file changes)
npm run start:dev

# Production build + start
npm run build
npm run start:prod
```

The backend will be available at `http://localhost:4000` (or the `PORT` you set).

---

## 3. Frontend Setup (`relay-app`)

### 3.1 Install dependencies

```bash
cd ../relay-app     # from repo root: cd relay-app
npm install
```

### 3.2 Configure environment

```bash
cp .env.local.example .env.local
```

Open `.env.local` and point it at the running backend:

```env
# For local development (default)
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=http://localhost:4000

# For a remote/tunnelled backend (e.g. Cloudflare Tunnel, ngrok)
# NEXT_PUBLIC_API_URL=https://your-tunnel-url.trycloudflare.com
# NEXT_PUBLIC_WS_URL=https://your-tunnel-url.trycloudflare.com
```

### 3.3 Start the frontend

```bash
# Development server (hot-reload)
npm run dev

# Production build + start
npm run build
npm run start
```

The app will be available at `http://localhost:3000`.

---

## 4. Running both together

Open two terminal tabs/windows:

```bash
# Terminal 1 — backend
cd relay-backend && npm run start:dev

# Terminal 2 — frontend
cd relay-app && npm run dev
```

Then open `http://localhost:3000` in your browser.

---

## 6. Quick reference — all npm scripts

### Backend (`relay-backend`)

| Command | Purpose |
|---|---|
| `npm run start:dev` | Dev server with watch/auto-restart |
| `npm run start:prod` | Run compiled production build |
| `npm run build` | Compile TypeScript → `dist/` |
| `npx prisma migrate dev` | Apply migrations + regenerate client (dev) |
| `npx prisma migrate deploy` | Apply migrations only (prod/CI) |
| `npx prisma studio` | Visual DB browser at localhost:5555 |

### Frontend (`relay-app`)

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server with hot-reload |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | Run ESLint |

---

## 7. Common issues

**`DATABASE_URL` invalid / connection refused**
Make sure PostgreSQL is running and the credentials in `.env` match your local setup. Alternatively, leave `DATABASE_URL` empty to use in-memory mode.

**CORS errors in the browser**
Ensure `CORS_ORIGIN` in `relay-backend/.env` matches the exact origin of the frontend (e.g. `http://localhost:3000`).

**WebSocket connection fails**
`NEXT_PUBLIC_WS_URL` must match the backend address. If you're accessing the app from a different device (e.g. a phone on the same network), use the machine's LAN IP instead of `localhost`.

**`prisma: command not found`**
Use `npx prisma` — Prisma is a dev dependency and is not installed globally.


