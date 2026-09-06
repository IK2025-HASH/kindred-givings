import { Link } from "@tanstack/react-router";
import { HeartHandshake } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-display text-lg font-extrabold tracking-tight">
      <span
        className={
          inverted
            ? "flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground"
            : "flex size-8 items-center justify-center rounded-md bg-navy text-navy-foreground"
        }
      >
        <HeartHandshake className="size-4" />
      </span>
      Givewell
    </span>
  );
}

export function MarketingShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <Link to="/">
            <Logo />
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              to="/pricing"
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Pricing
            </Link>
            {user ? (
              <Button asChild size="sm">
                <Link to="/app">Go to dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/auth">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/auth" search={{ mode: "signup" }}>
                    Start free
                  </Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border bg-navy text-navy-foreground">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between">
          <Logo inverted />
          <p className="text-sm text-navy-foreground/70">
            © {new Date().getFullYear()} Givewell. Donation management for charities.
          </p>
        </div>
      </footer>
    </div>
  );
}
