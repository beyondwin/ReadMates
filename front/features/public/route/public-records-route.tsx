import { useLoaderData, useLocation } from "react-router-dom";
import type { PublicClubRouteData } from "@/features/public/route/public-route-data";
import PublicRecordsPage from "@/features/public/ui/public-records-page";

export function PublicRecordsRoute() {
  const data = useLoaderData() as PublicClubRouteData;
  const location = useLocation();

  return <PublicRecordsPage data={data} routePathname={location.pathname} routeSearch={location.search} />;
}
