- Multi-tenant Donation Management SaaS

A platform where each charity gets its own private workspace, its own team, and a public page where supporters can give. A platform owner area sits above all of it.

## Look and feel

Clean, corporate and trustworthy in the spirit of Network Logic: deep navy, a confident blue accent, white space, crisp cards, no clutter. Charts and numbers front and centre.

## What gets built

### 1. Accounts and organisations

- Sign up, sign in, sign out, password reset.
- On first sign-in, create a charity workspace (name, web address slug, logo, currency, contact details) or join one via invitation.
- Team invites with roles: Owner, Admin, Fundraiser, Viewer.
- Everything a person sees is scoped to the charity they are in; people can belong to more than one and switch between them.

### 2. Donors and donations

- Donor list with search: name, email, phone, address, notes, tags.
- Record a donation: donor, amount, date, method (cash, bank transfer, cheque, online), campaign, one-off or recurring, Gift Aid flag, reference.
- Donation history per donor, lifetime total, last gift, edit and delete.
- Campaigns/appeals with a target and live progress.
- CSV import of donors and export of donations.

### 3. Public donation page

- Each charity gets a shareable page at its own slug: story, logo, campaign progress, suggested amounts, custom amount, donor details form, optional Gift Aid tick, optional anonymous.
- Submitting records a pending donation the charity confirms in the dashboard, and shows a thank-you screen. No card is charged in this version.
- Recent supporters wall (respecting anonymous choices).

### 4. Reports and dashboard

- Totals raised this month/year, donor count, average gift, recurring income.
- Trend chart over time, breakdown by campaign and by method, top donors.
- Date-range filter and CSV export.

### 5. Platform admin (super admin)

- All charities listed with status, plan and activity; suspend or reactivate.
- All platform users, with the ability to grant or remove platform-admin rights.
- Pricing engine: define plans (name, monthly and yearly price, limits on team members, donors and campaigns, feature switches), assign a plan to a charity, and enforce limits in the app.
- Public pricing page driven by those plans.

### 6. Payments

Not switched on now. The donation flow, plans and subscription records are built so a real card gateway (Stripe) can be plugged in later without rework; the plan page and donation page will show a clear "coming soon" for card payments.

## Technical notes

- Lovable Cloud provides the database, authentication and server logic.
- Tenancy: an `organizations` table plus `organization_members` linking users to organisations with a role. Every business table carries `organization_id`, and row-level security scopes reads and writes to the caller's memberships via security-definer helper functions (`is_member`, `has_org_role`). Platform-admin rights live in a separate `platform_admins` table, never on the profile.
- Tables: `profiles`, `organizations`, `organization_members`, `invitations`, `plans`, `subscriptions`, `donors`, `donations`, `campaigns`, `platform_admins`. Grants issued explicitly for `authenticated`/`service_role`; narrow anonymous read only for published public donation pages and active plans.
- Public donation submissions go through a validated server function that writes a pending record, so anonymous users never get broad write access.
- Routes: public marketing/pricing/`/give/$slug`, `/auth`, protected `/app/*` for the charity workspace, protected `/admin/*` for platform owners.
- Seed data: a couple of demo plans and one demo charity with donors and donations so every screen has content on first open.

## Build order

1. Cloud backend, schema, security rules and seed data.
2. Design system, shell and navigation.
3. Auth, organisation creation, team invites.
4. Donors, campaigns, donations.
5. Public donation page.
6. Dashboard and reports.
7. Platform admin, plans and limits.