# Donorbook — Kindred Giving

Multi-tenant donation management SaaS for UK charities. Each charity gets its own private workspace, team, and public giving page. A platform owner layer sits above all tenants.

**Live app**: https://kindred-givings.nl-product-factory.com  
**Current version**: v0.5.0 (Oct 2026)  
**Stack**: React 19 + TanStack Start/Router · Supabase (Auth + Postgres + RLS) · Stripe · Tailwind CSS  
**Repo**: GitHub `IK2025-HASH/kindred-givings` — `main` branch is source of truth; Lovable watches `dummy` (kept in sync after every commit)

---

## Architecture overview

| Layer | Technology |
|---|---|
| Frontend | React 19, TanStack Start (SSR), TanStack Router (file-based) |
| Database | Supabase Postgres with Row-Level Security |
| Auth | Supabase Auth (email/password; email confirmation OFF) |
| Payments | Stripe (subscription checkout + webhook) |
| Deployment | Lovable auto-deploys from `dummy` branch |
| Local dev | Claude Code → commit → push `main` + `dummy` |

### Multi-tenancy model
- `organizations` table; `organization_members` links users with a role (`owner`, `admin`, `fundraiser`, `viewer`)
- Every business table carries `organization_id`; RLS scopes all reads/writes via SECURITY DEFINER helpers (`is_org_member`, `has_org_role`, `is_platform_admin`)
- Platform-admin rights live in `platform_admins` table (never in user metadata or JWT claims)

### Security layers (auth guard)
`src/routes/_authenticated/route.tsx` `beforeLoad` runs on every protected route:
1. Verifies Supabase session
2. Checks `profiles` exists and `is_suspended = false` — deleted or suspended users are signed out immediately
3. `auth.users.banned_until` set to `infinity` for suspended users (blocks login at Supabase level)

---

## Features built (v0.5.0)

### Auth & accounts
- [x] Sign in / sign up / password reset (eye toggle on password field)
- [x] **Plan selection step during sign-up** — user picks a plan before creating account; paid plans redirect to billing after signup
- [x] Email confirmation toggle (disabled by default — set in Supabase dashboard)
- [x] Route guard: deleted/suspended users forced out immediately on any page load

### Organisation & team
- [x] Charity workspace creation on first login (name, slug, logo, currency, contact)
- [x] Switch between organisations
- [x] Team members with roles: Owner, Admin, Fundraiser, Viewer
- [x] Invite by email with expiry and token-based accept flow
- [x] Fixed: invitations policy now uses `auth.email()` (not `SELECT FROM auth.users`)

### Donors & donations
- [x] Donor list: name, email, phone, address, notes, tags, Gift Aid flag
- [x] Donation recording: amount, date, method, campaign, recurring, reference
- [x] Donation history per donor with lifetime total
- [x] Campaigns with target and live progress

### Public giving page
- [x] `/give/$slug` — charity story, logo, campaign progress, suggested amounts, custom amount
- [x] Gift Aid tick, optional anonymous
- [x] Thank-you screen; pending donation created for charity to confirm
- [x] QR code generation for each campaign/page

### Reports & dashboard
- [x] Monthly/yearly totals, donor count, average gift, recurring income
- [x] Trend chart, breakdown by campaign and method, top donors
- [x] Date-range filter and CSV export

### Billing & plans
- [x] Plans table: name, price (monthly/yearly), limits (members/donors/campaigns), features, Stripe price IDs
- [x] Stripe checkout for subscriptions (monthly and yearly intervals)
- [x] `/app/billing` — view current plan, upgrade, manage via Stripe portal
- [x] Free tier enforced when no active subscription
- [x] Public `/pricing` page driven by `plans` table

### Platform admin (`/admin`) — ilyas@networklogic.uk only
- [x] All organisations with status, plan, activity — suspend/reactivate
- [x] All platform users: view, suspend/activate (blocks login via `banned_until`), delete (removes from `auth.users`)
- [x] Cannot act on own account (self-action blocked in RPC)
- [x] Admin access enforced server-side via `platform_admins` table + SECURITY DEFINER RPCs
- [x] Version number displayed under sidebar logo (single source: `src/lib/version.ts`)

---

## Key files

| File | Purpose |
|---|---|
| `src/lib/version.ts` | Single source of truth for app version |
| `src/routes/_authenticated/route.tsx` | Auth + suspension guard for all protected routes |
| `src/routes/auth.tsx` | Sign-in / sign-up (with plan selection) / reset |
| `src/routes/_authenticated/app/admin.tsx` | Platform admin — users and orgs management |
| `src/integrations/supabase/client.ts` | Supabase client (anon key hardcoded to bypass Lovable env injection) |
| `src/hooks/useAuth.ts` | Auth context + current org |
| `src/hooks/useOrgData.ts` | Donors, campaigns, donations, team queries |

---

## Database migrations (in order)

| File | What it does |
|---|---|
| `20260905133218_dfa7c074.sql` | Full schema: profiles, orgs, members, invitations, plans, subscriptions, donors, donations, campaigns, platform_admins, RLS policies |
| `20260915000000_mvp0.sql` | MVP0 additions: accept_invitation RPC, public donation policy, admin email whitelist |
| `20261028_security_hardening_*.sql` | Removed admin email whitelist, added `public_organizations` view, hardened admin RPCs |
| `20261028_user_management.sql` | Added `is_suspended` to profiles; `admin_set_user_suspended` and `admin_delete_user` RPCs |
| `20261028_user_management_v2.sql` | Upgraded RPCs to also update `auth.users` (ban / hard delete) |
| `20261028_fix_invitations_policy.sql` | Fixed `invitee views by token` policy to use `auth.email()` instead of `SELECT FROM auth.users` |

---

## Local development

```bash
git clone https://github.com/IK2025-HASH/kindred-givings.git
cd kindred-givings
npm install
npm run dev        # http://localhost:5173
```

Secrets go in `.env.local` (gitignored). The Supabase anon key is hardcoded in `src/integrations/supabase/client.ts` — this is intentional (public-safe key; RLS protects data; bypasses Lovable's env injection).

After any commit: `git push origin main && git push origin main:dummy`

---

## Platform admin setup

Run once in Supabase SQL editor to grant admin access:

```sql
INSERT INTO public.platform_admins (user_id)
SELECT id FROM auth.users WHERE email = 'ilyas@networklogic.uk'
ON CONFLICT DO NOTHING;
```
