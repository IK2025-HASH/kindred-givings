# Donorbook — Regression Pack

**Version:** v0.4.3 · **Last updated:** Oct 2026  
Run this pack before every release to `dummy` (Lovable deploy).

Mark each test: ✅ Pass · ❌ Fail (note what broke) · ⏭ Skip (feature not yet active)

---

## 1. Auth

| # | Test | Expected | Result |
|---|---|---|---|
| A1 | Navigate to `/` — unauthenticated | Marketing homepage visible, no app links | |
| A2 | Click **Sign in** | Redirected to `/auth?mode=signin` | |
| A3 | Sign up with a new email | Account created, redirected to `/app` | |
| A4 | Sign out | Redirected to `/` | |
| A5 | Sign in again | Redirected to `/app`, correct org loaded | |
| A6 | Visit `/app` while signed out | Redirected to `/auth?mode=signin` | |
| A7 | Visit `/app/admin` as a non-admin | Redirected away (not a 404, not blank) | |
| A8 | Visit `/app/admin` as `ilyas@networklogic.uk` | Platform Admin module visible | |

---

## 2. Org creation & onboarding

| # | Test | Expected | Result |
|---|---|---|---|
| B1 | Sign up with a new account (no org) | Prompted to create an org | |
| B2 | Create org with name + slug | Org created, user is `owner` | |
| B3 | Org slug appears in giving page URL `/give/<slug>` | Page loads | |

---

## 3. Team management

| # | Test | Expected | Result |
|---|---|---|---|
| C1 | Invite a team member | Invite row appears in Pending invitations | |
| C2 | Invite email received (check Resend logs) | Email contains invite link | |
| C3 | Accept invite via link | New member appears in Members list | |
| C4 | Change member role | Role updated in table | |
| C5 | Revoke pending invite | Invite disappears from list | |
| C6 | Remove a member | Member removed | |
| C7 | At plan seat limit — invite button shows "Seat limit reached" | Button disabled | |

---

## 4. Donations

| # | Test | Expected | Result |
|---|---|---|---|
| D1 | Record a manual cash donation | Appears in list as `confirmed` | |
| D2 | Record with Gift Aid checked | Gift Aid badge visible | |
| D3 | Edit a donation | Changes saved | |
| D4 | Delete a donation | Row removed | |
| D5 | Filter by status | List filters correctly | |
| D6 | Search by donor name | Correct row shown | |
| D7 | Export CSV | File downloads with correct headers | |

---

## 5. Donors

| # | Test | Expected | Result |
|---|---|---|---|
| E1 | Add a donor manually | Appears in list | |
| E2 | Edit donor details | Changes saved | |
| E3 | Delete a donor | Row removed | |
| E4 | Import CSV with `full_name,email,phone` columns | Donors appear in list | |
| E5 | Export CSV | File downloads | |
| E6 | Search by name / email | Filters correctly | |
| E7 | Lifetime total shows after recording a donation linked to donor | Correct amount shown | |

---

## 6. Campaigns

| # | Test | Expected | Result |
|---|---|---|---|
| F1 | Create a campaign | Appears in list | |
| F2 | Edit title/description/goal | Changes saved | |
| F3 | Add `media_url` (YouTube link or image URL) | Saved without error | |
| F4 | Set campaign status to active | Status badge updates | |
| F5 | Delete a campaign | Row removed | |

---

## 7. Public giving page (`/give/<slug>`)

| # | Test | Expected | Result |
|---|---|---|---|
| G1 | Visit `/give/<slug>` while signed out | Page loads, org name + branding visible | |
| G2 | Active campaigns section shows | Campaign cards visible | |
| G3 | Campaign with `media_url` shows media | Image or YouTube embed renders | |
| G4 | QR code renders | QR encodes the page URL | |
| G5 | Copy link button | Link copied (or visible) | |
| G6 | Social share buttons visible | Links present | |
| G7 | Enter amount + name → click Donate via card | Stripe Checkout opens (test mode) | |
| G8 | Complete Stripe test payment | Webhook fires, donation recorded as `confirmed`, receipt email sent | |
| G9 | Gift Aid checkbox visible for UK donors | Option present on form | |

---

## 8. Stripe billing / subscriptions

| # | Test | Expected | Result |
|---|---|---|---|
| H1 | Visit `/app/billing` | Current plan shown | |
| H2 | Click Upgrade — choose a plan | Stripe Checkout opens | |
| H3 | Complete Stripe test subscription | Subscription active, plan name updates | |
| H4 | Click Manage billing | Stripe Customer Portal opens | |

---

## 9. My Giving (donor self-service)

| # | Test | Expected | Result |
|---|---|---|---|
| I1 | Sign in and visit `/my-giving` | Donation history shown (or empty state) | |
| I2 | History shows org name, amount, date | Correct data | |

---

## 10. Support chat

| # | Test | Expected | Result |
|---|---|---|---|
| J1 | Open support chat widget (AppShell) | Chat bubble visible | |
| J2 | Submit a support message | Conversation created | |
| J3 | Platform admin visits `/app/support` | Conversation appears in inbox | |
| J4 | Agent replies | Reply visible in conversation thread | |
| J5 | Agent closes conversation | Status changes to `closed`, removed from inbox | |

---

## 11. Platform Admin — organisation management

| # | Test | Expected | Result |
|---|---|---|---|
| K1 | View all orgs in admin panel | List with name, plan, member count, totals | |
| K2 | Suspend an org | Status changes to `suspended` | |
| K3 | Reactivate a suspended org | Status changes back to `active` | |

---

## 12. Platform Admin — branding / settings

| # | Test | Expected | Result |
|---|---|---|---|
| L1 | Change app name in Platform Admin | Header / page title updates | |
| L2 | Change primary colour | Colour token updates site-wide | |

---

## 13. Security smoke tests

| # | Test | Expected | Result |
|---|---|---|---|
| M1 | `ilyas@networklogic.uk` visits `/app/admin` | Access granted | |
| M2 | Any other signed-in user visits `/app/admin` | Redirected away | |
| M3 | Unauthenticated request to `/api/stripe-webhook` without signature | Returns 400 | |
| M4 | Supabase RLS: user cannot read another org's donations via direct API | Query returns empty | |

---

## Known limitations (v0.4.3)

- Stripe webhook test requires the `stripe listen` CLI or a live Stripe test endpoint — can't be tested in a local dev environment without it.
- `supabase gen types typescript` requires Supabase CLI auth; types are maintained manually in `types.ts`.
- Chat support migration (`chat-support-migration.sql`) must be run separately.
