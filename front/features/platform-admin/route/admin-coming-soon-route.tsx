import { useLoaderData } from "react-router-dom";
import { AdminComingSoon } from "@/features/platform-admin/ui/admin-coming-soon";
import type { AdminRouteDescriptor } from "@/features/platform-admin/model/admin-route-catalog";

export function AdminComingSoonRoute() {
  const descriptor = useLoaderData() as AdminRouteDescriptor;
  return <AdminComingSoon descriptor={descriptor} />;
}
