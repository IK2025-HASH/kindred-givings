import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PocChatShell } from "@/components/app/PocChatShell";

export const Route = createFileRoute("/_authenticated/app")({
  component: () => (
    <PocChatShell>
      <Outlet />
    </PocChatShell>
  ),
});
