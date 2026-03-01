# Fruition QA Suite

Custom AI-native QA platform for Fruition's quality assurance workflows.

Built with Next.js (App Router), Supabase, Better Auth, shadcn/ui, and Tailwind CSS.

---

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [Resend](https://resend.com) account (for invite emails)

---

## Local Development Setup

### 1. Clone the repository

```bash
git clone <repo-url>
cd qa-suite
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env.local
```

Open `.env.local` and set the required variables (see [Environment Variables](#environment-variables) below).

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Environment Variables

All variables are documented in `.env.example`. Below is a summary:

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |
| `DATABASE_URL` | Yes | Direct PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Yes | Random secret for signing session tokens |
| `BETTER_AUTH_URL` | Yes | Canonical app URL (e.g. `https://qa.fruition.net`) |
| `NEXT_PUBLIC_APP_URL` | Yes | Public app URL used in emails and invite links |
| `RESEND_API_KEY` | Yes | Resend API key for transactional email |
| `EMAIL_FROM` | Yes | Verified "from" address for outgoing emails |
| `INTERNAL_API_KEY` | Yes | Shared secret for internal API endpoints |
| `NEXT_PUBLIC_DEV_ORG_ID` | No | Dev-only org ID override (defaults to `dev-org`) |

### Obtaining Supabase credentials

1. Go to your [Supabase dashboard](https://supabase.com/dashboard)
2. Select your project → **Project Settings** → **API**
3. Copy **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
4. Copy **anon / public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Copy **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`
6. Go to **Project Settings** → **Database** → **Connection string** (URI) → `DATABASE_URL`

### Generating secrets

```bash
# Better Auth secret
openssl rand -base64 32

# Internal API key
openssl rand -hex 32
```

---

## Deployment (Vercel)

### 1. Connect the repository

Import the repository into [Vercel](https://vercel.com) and select **Next.js** as the framework preset.

### 2. Set environment variables

In the Vercel project dashboard go to **Settings** → **Environment Variables** and add every variable from `.env.example`.

Set `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` to your production domain (e.g. `https://qa.fruition.net`).

### 3. Deploy

Push to `main` (or your production branch). Vercel will build and deploy automatically.

### Production checklist

- [ ] All environment variables are set in Vercel
- [ ] `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` point to the production domain
- [ ] `EMAIL_FROM` is a verified domain in Resend
- [ ] Supabase Row Level Security (RLS) policies are enabled
- [ ] `BETTER_AUTH_SECRET` and `INTERNAL_API_KEY` are unique, randomly generated values

---

## Project Structure

```
src/
├── app/                  # Next.js App Router pages and API routes
│   ├── api/              # API route handlers
│   └── ...               # Page routes
├── components/           # React components
│   ├── auth/             # Authentication forms
│   ├── permissions/      # Permission management UI
│   ├── settings/         # Settings pages
│   └── ui/               # shadcn/ui base components
├── hooks/                # Custom React hooks
├── lib/                  # Shared utilities, services, types
│   ├── api/              # Client-side API helpers
│   ├── audit/            # Audit logging
│   ├── email/            # Email sending utilities
│   ├── permissions/      # Permission system
│   └── utils/            # General utilities
└── modules/              # Feature modules
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | Supabase (PostgreSQL) |
| Auth | Better Auth with Organization plugin |
| UI | shadcn/ui + Tailwind CSS |
| Email | Resend + React Email |
| Hosting | Vercel |
| Language | TypeScript |
