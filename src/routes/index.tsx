import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  Globe2,
  Megaphone,
  Receipt,
  ShieldCheck,
  Upload,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { MarketingShell } from "@/components/site/MarketingShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Givewell — donation management software for UK charities" },
      {
        name: "description",
        content:
          "Run your charity's fundraising in one place: donor records, campaigns, Gift Aid tracking, online giving pages and live reporting. Set up in minutes.",
      },
      { property: "og:title", content: "Givewell — donation management for charities" },
      {
        property: "og:description",
        content:
          "Donor records, campaigns, Gift Aid, giving pages and live reporting for every charity you run.",
      },
    ],
  }),
  component: Home,
});

// ── FAQ ──────────────────────────────────────────────────────────
const FAQS = [
  {
    q: "Do you process card payments?",
    a: "Givewell doesn't take a cut of payments or hold funds. Instead, you paste your own Stripe Payment Link (or any payment page) into Settings and a 'Pay by card' button appears on your giving page — the money goes directly to your Stripe account. For other gifts (bank transfer, cheque, cash) you record them in Givewell once received.",
  },
  {
    q: "Does it track Gift Aid?",
    a: "Yes. You can flag each donor's Gift Aid declaration and each donation that qualifies. The Reports page shows your Gift Aid-eligible total separately so you have the figures ready when you submit a claim to HMRC.",
  },
  {
    q: "Can I import our existing donor list?",
    a: "Yes — export a CSV from your current system (or spreadsheet) with columns for name, email, phone, city and postcode, then click 'Import CSV' on the Donors page. All rows with a name are imported immediately.",
  },
  {
    q: "How is our data kept secure?",
    a: "Each charity is an isolated workspace. Team members only see the data that belongs to their own charity. Authentication and data are handled by Supabase (hosted on AWS), with row-level security enforced at the database layer.",
  },
  {
    q: "Can I manage more than one charity?",
    a: "Yes. You can create or be invited to multiple charity workspaces under a single login. Switch between them using the dropdown in the sidebar.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes. The Starter plan is free and lets you get going straight away with a limited number of donors and campaigns. See the Pricing page for plan details and limits.",
  },
  {
    q: "Can donors see their giving history?",
    a: "Yes. After donating on your giving page, donors are invited to create a free Givewell account. Once signed in, they can see every gift they have made across all charities, including Gift Aid status and confirmation.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        className="flex w-full items-center justify-between gap-4 py-5 text-left text-base font-medium hover:text-primary"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>{q}</span>
        <ChevronDown
          className="size-5 shrink-0 text-muted-foreground transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>
      {open && (
        <p className="pb-5 text-sm leading-relaxed text-muted-foreground">{a}</p>
      )}
    </div>
  );
}

// ── Feature row ──────────────────────────────────────────────────
function FeatureRow({
  icon: Icon,
  title,
  desc,
  bullets,
  reverse = false,
  visual,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  bullets: string[];
  reverse?: boolean;
  visual: React.ReactNode;
}) {
  return (
    <div
      className={`grid items-center gap-12 lg:grid-cols-2 ${reverse ? "lg:[&>*:first-child]:order-2" : ""}`}
    >
      <div>
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <h3 className="mt-4 font-display text-2xl font-bold">{title}</h3>
        <p className="mt-3 text-muted-foreground">{desc}</p>
        <ul className="mt-5 space-y-2">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>{visual}</div>
    </div>
  );
}

// ── Mini UI mockups ──────────────────────────────────────────────
function DonorMockup() {
  const rows = [
    { name: "Margaret Thornton", email: "margaret@email.co.uk", total: "£600", ga: true },
    { name: "David Osei", email: "d.osei@outlook.com", total: "£800", ga: true },
    { name: "Sophia Kowalski", email: "sophia.k@email.com", total: "£120", ga: true },
    { name: "Henry Adeyemi", email: "h.adeyemi@outlook.com", total: "£25", ga: false },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
        <span className="text-sm font-semibold">Donors</span>
        <Badge variant="secondary">20 records</Badge>
      </div>
      <div className="divide-y divide-border">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{r.name}</p>
              <p className="truncate text-xs text-muted-foreground">{r.email}</p>
            </div>
            <div className="flex items-center gap-2">
              {r.ga && (
                <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                  Gift Aid
                </span>
              )}
              <span className="font-semibold tabular-nums">{r.total}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DonationMockup() {
  const rows = [
    { name: "Margaret Thornton", amount: "£50", method: "Bank transfer", status: "Confirmed" },
    { name: "Jonathan Clarke", amount: "£500", method: "Cheque", status: "Confirmed" },
    { name: "B. Akhtar", amount: "£50", method: "Online", status: "Pending" },
    { name: "Anonymous", amount: "£15", method: "Online", status: "Confirmed" },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
        <span className="text-sm font-semibold">Donations</span>
        <span className="text-xs text-muted-foreground">65 records</span>
      </div>
      <div className="divide-y divide-border">
        {rows.map((r) => (
          <div key={r.name + r.amount} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{r.name}</p>
              <p className="text-xs text-muted-foreground">{r.method}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  r.status === "Pending"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-emerald-100 text-emerald-700"
                }`}
              >
                {r.status}
              </span>
              <span className="font-semibold tabular-nums">{r.amount}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CampaignMockup() {
  const campaigns = [
    { name: "Education Bursary Fund", raised: 4200, target: 8000 },
    { name: "Community Food Bank", raised: 2800, target: 12000 },
    { name: "Summer Holiday Programme", raised: 240, target: 5000 },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="border-b border-border bg-muted/40 px-4 py-3">
        <span className="text-sm font-semibold">Campaigns</span>
      </div>
      <div className="divide-y divide-border">
        {campaigns.map((c) => {
          const pct = Math.round((c.raised / c.target) * 100);
          return (
            <div key={c.name} className="space-y-2 px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">{pct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                £{c.raised.toLocaleString()} raised of £{c.target.toLocaleString()} target
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReportMockup() {
  const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"];
  const vals =   [420,   680,   510,   990,  1240,  870];
  const max = Math.max(...vals);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="border-b border-border bg-muted/40 px-4 py-3">
        <span className="text-sm font-semibold">Giving trend — last 6 months</span>
      </div>
      <div className="px-4 py-5">
        <div className="flex items-end gap-3 h-24">
          {months.map((m, i) => (
            <div key={m} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-primary/80"
                style={{ height: `${(vals[i] / max) * 88}px` }}
              />
              <span className="text-[10px] text-muted-foreground">{m}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
          {[
            { label: "This year", value: "£7,820" },
            { label: "Gift Aid eligible", value: "£5,610" },
            { label: "Avg gift", value: "£47" },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
              <p className="font-display text-sm font-bold">{s.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GivingPageMockup() {
  return (
    <div className="overflow-hidden rounded-xl border border-border shadow-card">
      <div className="bg-slate-800 px-5 py-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
          Public giving page
        </p>
        <h4 className="mt-2 font-display text-xl font-bold">Sunrise Children's Foundation</h4>
        <p className="mt-1 text-sm text-white/70">Every child deserves a bright start in life.</p>
        <div className="mt-4 flex gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-white/50">Total raised</p>
            <p className="font-display text-lg font-bold">£7,820</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-white/50">Supporters</p>
            <p className="font-display text-lg font-bold">43</p>
          </div>
        </div>
      </div>
      <div className="bg-card p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground">Make a donation</p>
        <div className="flex flex-wrap gap-2">
          {[10, 25, 50, 100].map((a) => (
            <button
              key={a}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                a === 25
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background"
              }`}
            >
              £{a}
            </button>
          ))}
        </div>
        <div className="rounded border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
          Your name
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" defaultChecked readOnly className="rounded" />
          Add Gift Aid — I am a UK taxpayer
        </div>
        <button className="w-full rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground">
          Give now
        </button>
      </div>
    </div>
  );
}

// ── Home ─────────────────────────────────────────────────────────
function Home() {
  return (
    <MarketingShell>

      {/* ── Hero ── */}
      <section className="border-b border-border bg-navy text-navy-foreground">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-20 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <span className="inline-flex items-center rounded-full border border-navy-foreground/25 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
              Built for UK charities
            </span>
            <h1 className="mt-5 font-display text-4xl font-extrabold leading-tight sm:text-5xl">
              One place for every donor, gift and appeal
            </h1>
            <p className="mt-5 max-w-xl text-lg text-navy-foreground/80">
              Givewell replaces spreadsheets and scattered email threads with a clean workspace: donor records, Gift Aid tracking, fundraising campaigns and a public giving page — all connected.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Start free <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-navy-foreground/30 bg-transparent text-navy-foreground hover:bg-navy-foreground/10 hover:text-navy-foreground"
              >
                <Link to="/give/$slug" params={{ slug: "sunrise-childrens-foundation" }}>
                  See a live giving page
                </Link>
              </Button>
            </div>
            <p className="mt-5 text-sm text-navy-foreground/55">
              Free plan available · No credit card required · Set up in under 5 minutes
            </p>
          </div>

          <div className="rounded-2xl border border-navy-foreground/15 bg-navy-foreground/5 p-6">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Raised this year", value: "£7,820" },
                { label: "Active donors", value: "20" },
                { label: "Average gift", value: "£47" },
                { label: "Gift Aid eligible", value: "£5,610" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl bg-card p-4 text-card-foreground shadow-card"
                >
                  <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                  <p className="mt-1 font-display text-2xl font-bold">{stat.value}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-navy-foreground/55">
              Figures from the Sunrise Children's Foundation demo workspace.
            </p>
          </div>
        </div>
      </section>

      {/* ── Problem strip ── */}
      <section className="border-b border-border bg-muted/50">
        <div className="mx-auto w-full max-w-6xl px-4 py-8">
          <p className="text-center text-sm font-medium text-muted-foreground">
            Most small charities manage donors in spreadsheets, record donations in separate files and
            send thank-you letters by hand. Givewell connects all of that in one place.
          </p>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20">
        <h2 className="font-display text-3xl font-bold">How it works</h2>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Three steps from sign-up to accepting your first online donation.
        </p>
        <div className="mt-12 grid gap-8 lg:grid-cols-3">
          {[
            {
              step: "1",
              title: "Set up your workspace",
              body: "Enter your charity's name, logo, story and contact details. Your public giving page is created automatically with a shareable link like /give/your-charity-name.",
              icon: Building2,
            },
            {
              step: "2",
              title: "Manage donors and gifts",
              body: "Add donor records manually or import from a spreadsheet. Record every donation — cash, cheque, bank transfer or online — and link them to campaigns. Confirm pledges when payment arrives.",
              icon: Wallet,
            },
            {
              step: "3",
              title: "Share and grow",
              body: "Share your giving page with supporters. Invite your team with the right access level. Watch campaign progress and download reports whenever you need them.",
              icon: Globe2,
            },
          ].map((s) => (
            <div key={s.step} className="relative">
              <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {s.step}
              </div>
              <h3 className="font-display text-xl font-bold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto w-full max-w-6xl space-y-24 px-4 py-20">

          <h2 className="font-display text-3xl font-bold">
            Everything your fundraising team needs
          </h2>

          <FeatureRow
            icon={Users}
            title="Donor records your whole team can use"
            desc="Keep every supporter in one searchable list. Contact details, giving history, Gift Aid status and free-text notes — all in one place."
            bullets={[
              "Search by name, email, phone or town",
              "Flag Gift Aid declarations — a badge appears on every eligible record",
              "Add tags to group donors by interest or relationship",
              "Import from any CSV export in seconds",
              "Export the full list (or a filtered subset) any time",
            ]}
            visual={<DonorMockup />}
          />

          <FeatureRow
            icon={Wallet}
            title="Record every gift, however it arrives"
            desc="Not all donations come through your website. Log cash collected at an event, a cheque in the post or a bank transfer — every method is covered."
            bullets={[
              "Methods: Cash, Bank transfer, Cheque, Card, Online, Other",
              "Set status to Pending when a donor pledges, then Confirmed once payment is in",
              "Link each gift to a campaign so totals stay accurate",
              "Flag recurring gifts (standing orders) separately from one-off donations",
              "Donations from your public giving page arrive automatically as Pending",
            ]}
            reverse
            visual={<DonationMockup />}
          />

          <FeatureRow
            icon={Megaphone}
            title="Fundraising campaigns with live progress"
            desc="Create named appeals with a target and a closing date. Donors can direct their gift to a specific campaign, and you can see how each appeal is performing in real time."
            bullets={[
              "Set a target amount and watch the progress bar fill",
              "Start campaigns as Draft, publish when ready",
              "Active campaigns appear on your public giving page with progress bars",
              "Archive completed appeals without losing the donation history",
            ]}
            visual={<CampaignMockup />}
          />

          <FeatureRow
            icon={BarChart3}
            title="Reports that are ready when you need them"
            desc="Your totals, Gift Aid eligibility and giving trends are always up to date. No pivot tables, no manual calculations."
            bullets={[
              "Month-by-month giving trend for the current year",
              "Breakdown by donation method (cash vs bank transfer vs online etc.)",
              "Campaign-by-campaign totals versus targets",
              "Gift Aid-eligible subtotal calculated automatically",
              "CSV export of donor list and donation records any time",
            ]}
            reverse
            visual={<ReportMockup />}
          />

          <FeatureRow
            icon={Globe2}
            title="A public giving page that's yours to share"
            desc="Every charity gets a hosted giving page with your story, campaign progress and a donation form. No web developer needed."
            bullets={[
              "Your URL: /give/your-charity-name — share it anywhere",
              "Shows total raised, number of supporters and a recent supporters wall",
              "Donors can choose a suggested amount or type their own",
              "Add a card payment button by pasting your Stripe Payment Link",
              "Tick to make the page live, or take it offline at any time",
              "Donors can create a free account to track their own giving history",
            ]}
            visual={<GivingPageMockup />}
          />

        </div>
      </section>

      {/* ── Gift Aid highlight ── */}
      <section className="border-y border-border bg-emerald-50 dark:bg-emerald-950/30">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-14 lg:flex-row lg:items-center lg:gap-16">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white">
            <Receipt className="size-7" />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-2xl font-bold text-emerald-900 dark:text-emerald-100">
              Gift Aid tracking built in
            </h3>
            <p className="mt-2 text-sm text-emerald-800/80 dark:text-emerald-200/80">
              For every donor you can record whether a Gift Aid declaration is on file. For every donation you can flag whether Gift Aid applies. The Reports page shows your Gift Aid-eligible total at a glance — exactly the figure you need when submitting a claim to HMRC. No separate spreadsheet required.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-8">
            <div className="text-center">
              <p className="font-display text-3xl font-extrabold text-emerald-700 dark:text-emerald-300">25%</p>
              <p className="text-xs text-emerald-700/70 dark:text-emerald-400">added by HMRC<br/>on qualifying gifts</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Team & access ── */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </span>
            <h3 className="mt-4 font-display text-2xl font-bold">Team access, controlled by role</h3>
            <p className="mt-3 text-muted-foreground">
              Invite colleagues with the access level that fits their role. Roles are strict and enforced at the database layer — not just hidden in the UI.
            </p>
            <div className="mt-6 space-y-3">
              {[
                { role: "Owner", desc: "Full access including billing, settings and deleting the workspace" },
                { role: "Admin", desc: "Everything except billing and workspace deletion" },
                { role: "Fundraiser", desc: "Can add and edit donors, donations and campaigns" },
                { role: "Viewer", desc: "Read-only access to all data" },
              ].map((r) => (
                <div key={r.role} className="flex items-start gap-3">
                  <span className="mt-0.5 rounded bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                    {r.role}
                  </span>
                  <p className="text-sm text-muted-foreground">{r.desc}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Upload className="size-5" />
            </span>
            <h3 className="mt-4 font-display text-2xl font-bold">Import from anywhere, export any time</h3>
            <p className="mt-3 text-muted-foreground">
              Switching from a spreadsheet or another system? Import your donors from any CSV in seconds. And your data is always yours — export the full donor list or donation records whenever you need them.
            </p>
            <ul className="mt-5 space-y-2">
              {[
                "CSV import for donors: full_name, email, phone, city, postcode",
                "Export your current donor list or filtered search results",
                "No lock-in — your data leaves with you",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            <span className="mt-8 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="size-5" />
            </span>
            <h3 className="mt-4 font-display text-2xl font-bold">Manage multiple charities</h3>
            <p className="mt-3 text-muted-foreground">
              Running more than one charity? Each has its own private workspace, its own team, its own giving page and its own data — all accessible under a single Givewell login. Switch between them from the sidebar.
            </p>
          </div>
        </div>
      </section>

      {/* ── Pricing teaser ── */}
      <section className="border-y border-border bg-navy text-navy-foreground">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="font-display text-3xl font-extrabold">Simple plans, no surprises</h2>
              <p className="mt-3 max-w-xl text-navy-foreground/70">
                Every plan includes donor records, campaigns, a public giving page and full reporting. Start free — upgrade when you need more capacity.
              </p>
            </div>
            <Button asChild size="lg" variant="outline" className="border-navy-foreground/30 bg-transparent text-navy-foreground hover:bg-navy-foreground/10 hover:text-navy-foreground">
              <Link to="/pricing">See all plans</Link>
            </Button>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { name: "Starter", price: "Free", note: "Get started", features: ["Up to 100 donors", "3 campaigns", "2 team members", "Public giving page"] },
              { name: "Growth", price: "£19/mo", note: "Most popular", features: ["Up to 1,000 donors", "20 campaigns", "5 team members", "CSV import & export", "Priority support"] },
              { name: "Pro", price: "£49/mo", note: "Unlimited", features: ["Unlimited donors", "Unlimited campaigns", "Unlimited team members", "Custom domain (coming soon)", "Dedicated account manager"] },
            ].map((p, i) => (
              <div
                key={p.name}
                className={`rounded-xl border p-5 ${i === 1 ? "border-primary bg-primary/10" : "border-navy-foreground/15 bg-navy-foreground/5"}`}
              >
                {i === 1 && (
                  <span className="mb-2 inline-block rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                    Most popular
                  </span>
                )}
                <p className="font-display text-xl font-bold">{p.name}</p>
                <p className="mt-1 font-display text-2xl font-extrabold">{p.price}</p>
                <ul className="mt-4 space-y-1.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-navy-foreground/75">
                      <Check className="size-3.5 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button asChild className="mt-5 w-full" variant={i === 1 ? "default" : "outline"} size="sm">
                  <Link to="/auth" search={{ mode: "signup" }}>Get started</Link>
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-navy-foreground/45">
            Prices are indicative. See the Pricing page for current plan details and limits.
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="mx-auto w-full max-w-4xl px-4 py-20">
        <h2 className="font-display text-3xl font-bold">Common questions</h2>
        <div className="mt-8 divide-y divide-border rounded-xl border border-border bg-card px-6 shadow-card">
          {FAQS.map((f) => (
            <FaqItem key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="border-t border-border bg-secondary">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-5 px-4 py-16 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold">Ready to get started?</h2>
            <p className="mt-2 max-w-md text-muted-foreground">
              Create your free workspace in under 5 minutes. Add donors, record your first donation and share your giving page — all today.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth" search={{ mode: "signup" }}>
                Create free workspace <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/give/$slug" params={{ slug: "sunrise-childrens-foundation" }}>
                View demo giving page
              </Link>
            </Button>
          </div>
        </div>
      </section>

    </MarketingShell>
  );
}
