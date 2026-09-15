import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  Building2,
  Globe2,
  ShieldCheck,
  Users,
  Wallet,
  ArrowRight,
} from "lucide-react";
import { MarketingShell } from "@/components/site/MarketingShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Givewell — donation management software for charities" },
      {
        name: "description",
        content:
          "Run your charity's fundraising in one place: donor records, campaigns, Gift Aid, online giving pages and live reporting.",
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

const features = [
  {
    icon: Users,
    title: "Donor records",
    body: "Every supporter with contact details, tags, notes, Gift Aid status and full giving history.",
  },
  {
    icon: Wallet,
    title: "Donation logging",
    body: "Cash, bank transfer, cheque or online — recorded against a campaign in seconds.",
  },
  {
    icon: Globe2,
    title: "Public giving pages",
    body: "A shareable page per charity with your story, campaign progress and suggested amounts.",
  },
  {
    icon: BarChart3,
    title: "Live reporting",
    body: "Totals, trends, top donors and campaign breakdowns, with CSV export whenever you need it.",
  },
  {
    icon: Building2,
    title: "Multiple charities",
    body: "Each charity is its own private workspace with its own team, data and giving page.",
  },
  {
    icon: ShieldCheck,
    title: "Roles and permissions",
    body: "Owners, admins, fundraisers and viewers — people only see what they should.",
  },
];

function Home() {
  return (
    <MarketingShell>
      <section className="border-b border-border bg-navy text-navy-foreground">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <span className="inline-flex items-center rounded-full border border-navy-foreground/25 px-3 py-1 text-xs font-semibold tracking-wide uppercase">
              Multi-charity platform
            </span>
            <h1 className="mt-5 font-display text-4xl leading-tight font-extrabold sm:text-5xl">
              Donation management that keeps every charity organised
            </h1>
            <p className="mt-5 max-w-xl text-lg text-navy-foreground/80">
              Givewell gives each charity a private workspace for donors, campaigns and gifts — plus
              a public giving page supporters can share.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Create your workspace <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-navy-foreground/30 bg-transparent text-navy-foreground hover:bg-navy-foreground/10 hover:text-navy-foreground"
              >
                <Link to="/give/$slug" params={{ slug: "riverside-community-trust" }}>
                  See a giving page
                </Link>
              </Button>
            </div>
          </div>
          <div className="rounded-2xl border border-navy-foreground/15 bg-navy-foreground/5 p-6">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Raised this year", value: "£184,920" },
                { label: "Active donors", value: "1,284" },
                { label: "Average gift", value: "£46" },
                { label: "Recurring income", value: "£3,410/mo" },
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
            <p className="mt-4 text-xs text-navy-foreground/60">
              Illustrative figures from a demo charity workspace.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-20">
        <h2 className="font-display text-3xl font-bold">Everything a fundraising team needs</h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Replace spreadsheets and scattered forms with one clear system your whole team can use.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title} className="shadow-card">
              <CardHeader>
                <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <f.icon className="size-5" />
                </span>
                <CardTitle className="mt-3 text-lg">{f.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{f.body}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-secondary">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-4 py-16 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold">Ready when your next appeal is</h2>
            <p className="mt-2 text-muted-foreground">
              Set up your charity in minutes. Accept bank transfers, cash and cheques — add a card payment link via Settings.
            </p>
          </div>
          <Button asChild size="lg">
            <Link to="/auth" search={{ mode: "signup" }}>
              Get started
            </Link>
          </Button>
        </div>
      </section>
    </MarketingShell>
  );
}
