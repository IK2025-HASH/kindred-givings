# Donorbook — Deployment Guide

**Version:** v0.4.3 · **Last updated:** Oct 2026  
**Live URL:** https://kindred-givings.lovable.app  
**Repo:** GitHub (private) — branches `main` + `dummy`

---

## Stack

| Layer | Technology |
|---|---|
| Frontend / SSR | React 19 + TanStack Start + TanStack Router |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database / Auth | Supabase (PostgreSQL + Row-Level Security) |
| Payments | Stripe (Checkout Sessions + Webhooks) |
| Transactional email | Resend (REST API, no SDK) |
| Deploy | Lovable (watches `dummy` branch) |
| Local dev | Claude Code → commit → push to GitHub |

---

## 1. Prerequisites — environment variables

### Lovable Secrets (server-side, never `VITE_`-prefixed)

Set these in **Lovable → Project → Secrets**:

| Secret | Where to get it | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys → Secret key | `sk_live_…` for prod |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks → your endpoint → Signing secret | `whsec_…` |
| `RESEND_API_KEY` | resend.com → API Keys | `re_…` — free tier: 100 emails/day |
| `APP_URL` | Your live URL | e.g. `https://kindred-givings.lovable.app` |

> **Do not** use `VITE_`-prefixed names for secrets — Lovable blocks them correctly.

### Local `.env.local` (never committed)

```
STRIPE_SECRET_KEY=sk_live_…
STRIPE_WEBHOOK_SECRET=whsec_…
RESEND_API_KEY=re_…
APP_URL=http://localhost:3000
```

### Tracked `.env` (committed — public-safe values only)

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
```

> The publishable key is the Supabase **anon key** — it is safe to commit. RLS protects all data.

---

## 2. Supabase setup

### 2a. Create project

1. Go to **supabase.com** → New project (under **ilyas@networklogic.uk**'s organisation).
2. Note the **Project URL** and **anon/public key** — put them in `.env` and `src/integrations/supabase/client.ts` (hardcoded to bypass Lovable's env injection).

### 2b. Run migrations

Run all SQL files from `supabase/migrations/` in the Supabase SQL editor, in order:

```
supabase/migrations/
  ├── 0001_initial_schema.sql          # core tables
  ├── 0002_platform_admin.sql          # platform_admins + is_platform_admin()
  ├── 0003_subscriptions.sql           # plans, subscriptions
  ├── 0004_invitations.sql             # invitations, accept_invitation RPC
  ├── 0005_platform_settings.sql       # platform_settings table + defaults
  ├── 0006_support.sql                 # chat support tables + agents
  └── chat-support-migration.sql       # (run separately if support is needed)
```

### 2c. Promote first platform admin

After sign-up with `ilyas@networklogic.uk`, run this in the Supabase SQL editor:

```sql
INSERT INTO platform_admins (user_id)
SELECT id FROM auth.users WHERE email = 'ilyas@networklogic.uk';
```

> The admin check reads `platform_admins` server-side via `is_platform_admin()`. Never grant admin from `user_metadata`.

### 2d. Supabase Auth settings

- **Site URL:** set to your live Lovable URL
- **Redirect URLs:** add `https://kindred-givings.lovable.app/**` and `http://localhost:3000/**`
- **Email provider:** Supabase built-in (or configure custom SMTP in Auth → Settings)

---

## 3. Stripe setup

### 3a. Products and prices

Create two products in the Stripe Dashboard (or use the API):

| Product | Price (monthly) | Price (yearly) |
|---|---|---|
| Starter | e.g. £9/mo | e.g. £90/yr |
| Pro | e.g. £29/mo | e.g. £290/yr |

Copy each **Price ID** (`price_…`).

### 3b. Enter Price IDs in the app

1. Sign in as `ilyas@networklogic.uk`
2. Go to **Platform Admin → Pricing plans**
3. Edit each plan → paste the monthly and yearly Stripe Price IDs

### 3c. Enter Stripe publishable key

1. **Platform Admin → Stripe configuration**
2. Paste your `pk_live_…` publishable key

### 3d. Webhook endpoint

1. Stripe Dashboard → Developers → Webhooks → **Add endpoint**
2. URL: `https://kindred-givings.lovable.app/api/stripe-webhook`
3. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy the **Signing secret** → add as `STRIPE_WEBHOOK_SECRET` in Lovable secrets

### 3e. Stripe API version

The codebase is pinned to `"2025-02-24.acacia"` (matches `stripe@17.7.0`). Do not change this unless you also upgrade the `stripe` npm package.

---

## 4. Resend setup

1. Sign up at **resend.com** (free: 100 emails/day, no credit card)
2. Create an API key → add as `RESEND_API_KEY` in Lovable secrets
3. **Optionally** verify a custom sending domain (e.g. `mail.donorbook.co.uk`) for deliverability
4. Default sender: `Donorbook <noreply@donorbook.co.uk>` (set in `src/lib/email.functions.ts`)

Emails sent:
- **Invite email** — when a team member is invited
- **Donor receipt** — after a confirmed donation via the public giving page

---

## 5. GitHub + Lovable deploy flow

```
Local dev (Claude Code)
        │
        ▼
  git push origin main    ← source of truth
        │
        ▼
  git push origin main:dummy   ← Lovable watches this
        │
        ▼
  Lovable auto-deploys → https://kindred-givings.lovable.app
```

**Rules:**
- Always push to **both** `main` and `dummy` after every commit.
- Never use Lovable's "Connect Supabase" — it creates a Lovable-managed DB. Always use our own Supabase project.
- Lovable injects its own `VITE_SUPABASE_*` env vars at build time — these are overridden by hardcoded values in `src/integrations/supabase/client.ts`.
- `.env.local` is always gitignored. Secrets never touch GitHub.

---

## 6. Local development

```sh
git clone https://github.com/IK2025-HASH/kindred-givings.git
cd kindred-givings
npm install
# create .env.local with STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY, APP_URL
npm run dev
```

For Stripe webhooks locally:
```sh
stripe listen --forward-to http://localhost:3000/api/stripe-webhook
# copy the whsec_… it prints into .env.local as STRIPE_WEBHOOK_SECRET
```

---

## 7. Platform Admin module

Accessible at `/app/admin` — only visible to users in the `platform_admins` table.

| Section | What you can do |
|---|---|
| Overview | Org count, donation totals, active plans |
| Organisations | View all orgs, suspend/activate, see usage |
| Users | View all users, platform admin management |
| Pricing plans | Edit plan limits, Stripe Price IDs |
| Branding | App name, tagline, colours, logo |
| Stripe config | Publishable key, webhook status |
| Support inbox | View and reply to user support tickets |

---

## 8. Supabase types maintenance

Supabase generates TypeScript types from the schema. Since `supabase gen types typescript` requires CLI auth, types are maintained **manually** in `src/integrations/supabase/types.ts`.

**When you add a column or table to the DB**, also update `types.ts`:
- Add the column to `Row`, `Insert`, and `Update` shapes
- For a new RPC, add it to the `Functions` section

---

## 9. Post-deploy checklist

- [ ] Supabase migrations all run
- [ ] `ilyas@networklogic.uk` is in `platform_admins`
- [ ] Stripe products + prices created; Price IDs entered in Platform Admin
- [ ] Stripe webhook endpoint created and `STRIPE_WEBHOOK_SECRET` set in Lovable
- [ ] `STRIPE_SECRET_KEY` set in Lovable secrets
- [ ] `RESEND_API_KEY` set in Lovable secrets
- [ ] `APP_URL` set in Lovable secrets (live URL, no trailing slash)
- [ ] Supabase Auth → Site URL + Redirect URLs configured
- [ ] Stripe publishable key entered in Platform Admin → Stripe config
- [ ] Test donation via a demo giving page (Stripe test mode)
- [ ] Test invite email (check Resend logs)
- [ ] Test Platform Admin access (`/app/admin`) — confirm non-admin cannot reach it
