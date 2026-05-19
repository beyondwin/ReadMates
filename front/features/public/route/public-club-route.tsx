import { useLoaderData } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { publicClubQuery } from "@/features/public/queries/public-queries";
import type { PublicClubRouteData } from "@/features/public/route/public-route-data";
import PublicClub from "@/features/public/ui/public-club";

export function PublicClubRoute() {
  const data = useLoaderData() as PublicClubRouteData;
  const clubQuery = useQuery(publicClubQuery(data.clubSlug));

  if (!clubQuery.data) {
    return null;
  }

  return <PublicClub data={clubQuery.data} publicBasePath={data.publicBasePath} />;
}
