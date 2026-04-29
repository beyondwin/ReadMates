import { useLoaderData } from "react-router-dom";
import type { PublicClubRouteData } from "@/features/public/route/public-route-data";
import PublicHome from "@/features/public/ui/public-home";

export function PublicHomeRoute() {
  const data = useLoaderData() as PublicClubRouteData;

  return <PublicHome data={data} publicBasePath={data.publicBasePath} />;
}
