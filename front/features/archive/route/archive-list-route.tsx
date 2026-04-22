import { useCallback } from "react";
import { useLoaderData, useLocation, useSearchParams } from "react-router-dom";
import type { ArchiveListRouteData } from "@/features/archive/api/archive-api";
import { archiveViewFromSearchParam, type ArchiveView } from "@/features/archive/model/archive-model";
import ArchivePage from "@/features/archive/ui/archive-page";

export function ArchiveListRoute() {
  const data = useLoaderData() as ArchiveListRouteData;
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialView = archiveViewFromSearchParam(searchParams.get("view"));
  const handleViewChange = useCallback(
    (view: ArchiveView) => {
      setSearchParams({ view }, { replace: true });
    },
    [setSearchParams],
  );

  return (
    <ArchivePage
      {...data}
      initialView={initialView}
      onViewChange={handleViewChange}
      routePathname={location.pathname}
      routeSearch={location.search}
    />
  );
}
