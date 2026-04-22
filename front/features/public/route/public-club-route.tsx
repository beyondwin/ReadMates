import { useLoaderData } from "react-router-dom";
import type { PublicClubRouteData } from "@/features/public/route/public-route-data";
import PublicClub from "@/features/public/ui/public-club";

export function PublicClubRoute() {
  const data = useLoaderData() as PublicClubRouteData;

  return <PublicClub data={data} />;
}
