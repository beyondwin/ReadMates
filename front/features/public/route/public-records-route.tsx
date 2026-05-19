import { useLoaderData, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { publicClubQuery } from "@/features/public/queries/public-queries";
import type { PublicClubRouteData } from "@/features/public/route/public-route-data";
import PublicRecordsPage from "@/features/public/ui/public-records-page";

export function PublicRecordsRoute() {
  const data = useLoaderData() as PublicClubRouteData;
  const clubQuery = useQuery(publicClubQuery(data.clubSlug));
  const location = useLocation();

  if (!clubQuery.data) {
    return null;
  }

  return (
    <PublicRecordsPage
      data={clubQuery.data}
      publicBasePath={data.publicBasePath}
      routePathname={location.pathname}
      routeSearch={location.search}
    />
  );
}
