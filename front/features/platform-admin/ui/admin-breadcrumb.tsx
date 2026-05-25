import {
  ADMIN_CLUB_DETAIL_ROUTE,
  ADMIN_ROUTES,
  type AdminRouteDescriptor,
} from "@/features/platform-admin/model/admin-route-catalog";

export function AdminBreadcrumb({ routePath, extra }: { routePath: string; extra?: string | null }) {
  const descriptor = findDescriptor(routePath);
  if (!descriptor) {
    return <nav className="admin-breadcrumb" aria-label="현재 위치" />;
  }
  const parts = buildParts(descriptor, extra);
  return (
    <nav className="admin-breadcrumb" aria-label="현재 위치">
      {parts.map((part, idx) => (
        <span key={`${part}-${idx}`} className="admin-breadcrumb__part">
          {idx > 0 ? <span className="admin-breadcrumb__sep"> · </span> : null}
          {part}
        </span>
      ))}
    </nav>
  );
}

function findDescriptor(routePath: string): AdminRouteDescriptor | null {
  if (routePath === ADMIN_CLUB_DETAIL_ROUTE.path) return ADMIN_CLUB_DETAIL_ROUTE;
  return ADMIN_ROUTES.find((route) => route.path === routePath) ?? null;
}

function buildParts(descriptor: AdminRouteDescriptor, extra?: string | null): string[] {
  const parts: string[] = [];
  if (descriptor.group !== "today" || descriptor.path !== "today") {
    parts.push(descriptor.groupLabel);
  }
  parts.push(descriptor.label === "오늘" ? "오늘 할 일" : descriptor.label);
  if (extra) parts.push(extra);
  if (descriptor.status === "coming_soon") parts.push("준비 중");
  return parts;
}
