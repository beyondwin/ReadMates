import { useLoaderData, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { buildPublicRecordsPageMetadata } from "@/features/public/model/public-page-metadata";
import { publicClubQuery } from "@/features/public/queries/public-queries";
import type { PublicClubRouteData } from "@/features/public/route/public-route-data";
import { PublicPageMetadataHead } from "@/features/public/ui/public-page-metadata-head";
import PublicRecordsPage from "@/features/public/ui/public-records-page";

export function PublicRecordsRoute() {
  const data = useLoaderData() as PublicClubRouteData;
  const clubQuery = useQuery(publicClubQuery(data.clubSlug));
  const location = useLocation();

  if (!clubQuery.data) {
    return <PublicPageMetadataHead />;
  }

  return (
    <>
      <PublicPageMetadataHead metadata={buildPublicRecordsPageMetadata(clubQuery.data)} />
      <PublicRecordsPage
        data={clubQuery.data}
        publicBasePath={data.publicBasePath}
        routePathname={location.pathname}
        routeSearch={location.search}
      />
    </>
  );
}
