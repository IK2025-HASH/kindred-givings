import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Lock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";

/**
 * Hides children and shows an upgrade prompt when the feature is not
 * enabled on the current plan.
 *
 * Set `allowPartial` to keep children visible but disabled (e.g. a page
 * shell where the content itself is gated row-by-row).
 */
export function FeatureGate({
  feature,
  children,
  fallback,
}: {
  feature: string;
  children: ReactNode;
  /** Custom fallback — omit to use the default upgrade card */
  fallback?: ReactNode;
}) {
  const { hasFeature, isLoaded, planName } = usePlanFeatures();

  // While loading, render children (avoids flash of lock screen)
  if (!isLoaded) return <>{children}</>;

  if (hasFeature(feature)) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  return (
    <div className="flex min-h-[40vh] items-center justify-center p-8">
      <div className="max-w-sm text-center space-y-4">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted">
          <Lock className="size-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-semibold text-foreground">
            Not available on {planName ?? "your current plan"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Upgrade your plan to unlock this feature.
          </p>
        </div>
        <Button asChild>
          <Link to="/app/billing">View plans</Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * Shows a warning banner when approaching or at a quantity limit.
 * Renders nothing when the limit is not reached or the feature is unlimited.
 */
export function LimitBanner({
  feature,
  current,
  label,
}: {
  /** Feature key for the limit, e.g. "max_donors" */
  feature: string;
  /** Current count */
  current: number;
  /** Human label for the item, e.g. "donor records" */
  label: string;
}) {
  const { getLimit, isNearLimit, isAtLimit } = usePlanFeatures();
  const limit = getLimit(feature);

  if (limit == null) return null; // unlimited
  if (!isNearLimit(feature, current) && !isAtLimit(feature, current)) return null;

  const atLimit = isAtLimit(feature, current);

  return (
    <Alert variant={atLimit ? "destructive" : "default"} className="mb-4">
      <AlertTriangle className="size-4" />
      <AlertTitle>{atLimit ? `${label} limit reached` : `Approaching ${label} limit`}</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
        <span>
          {current.toLocaleString()} of {limit.toLocaleString()} {label} used.
          {atLimit ? " You cannot add more on your current plan." : ""}
        </span>
        <Button size="sm" variant={atLimit ? "destructive" : "outline"} asChild>
          <Link to="/app/billing">Upgrade</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Inline lock badge for use in nav items — shows a small lock icon
 * when the feature is not available on the current plan.
 */
export function FeatureLockBadge({ feature }: { feature: string }) {
  const { hasFeature, isLoaded } = usePlanFeatures();
  if (!isLoaded || hasFeature(feature)) return null;
  return <Lock className="ml-auto size-3 text-muted-foreground/60" />;
}
