import { RouteErrorBoundary } from "@/shared/ui/route-error";

export function ArchiveRouteLoading({ label }: { label: string }) {
  return (
    <main className="rm-route-loading rm-route-loading--member">
      <div className="container rm-route-loading__inner">
        <div role="status" aria-live="polite" className="rm-sr-only">
          {label}
        </div>
      </div>
    </main>
  );
}

export function ArchiveRouteError() {
  return <RouteErrorBoundary variant="member" />;
}
