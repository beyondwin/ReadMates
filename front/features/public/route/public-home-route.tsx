import { useLoaderData } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { buildPublicClubPageMetadata } from "@/features/public/model/public-page-metadata";
import { publicClubQuery } from "@/features/public/queries/public-queries";
import type { PublicClubRouteData } from "@/features/public/route/public-route-data";
import { PublicPageMetadataHead } from "@/features/public/ui/public-page-metadata-head";
import PublicHome from "@/features/public/ui/public-home";

export function PublicHomeRoute() {
  const data = useLoaderData() as PublicClubRouteData;
  const clubQuery = useQuery(publicClubQuery(data.clubSlug));

  if (!clubQuery.data) {
    return <PublicPageMetadataHead />;
  }

  return (
    <>
      <PublicPageMetadataHead metadata={buildPublicClubPageMetadata(clubQuery.data, "home")} />
      <PublicHome data={clubQuery.data} publicBasePath={data.publicBasePath} />
    </>
  );
}
