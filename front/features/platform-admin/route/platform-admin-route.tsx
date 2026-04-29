import { useLoaderData } from "react-router-dom";
import type { PlatformAdminRouteData } from "@/features/platform-admin/route/platform-admin-data";
import { PlatformAdminDashboard } from "@/features/platform-admin/ui/platform-admin-dashboard";

export function PlatformAdminRoute() {
  const data = useLoaderData() as PlatformAdminRouteData;

  return <PlatformAdminDashboard summary={data.summary} />;
}
