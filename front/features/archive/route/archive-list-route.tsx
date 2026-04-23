import { useCallback } from "react";
import { useLoaderData, useLocation, useSearchParams } from "react-router-dom";
import { archiveViewFromSearchParam, type ArchiveView } from "@/features/archive/model/archive-model";
import type { ArchiveListRouteData } from "@/features/archive/route/archive-list-data";
import ArchivePage from "@/features/archive/ui/archive-page";
import { useAuth } from "@/src/app/auth-state";

export function ArchiveListRoute() {
  const data = useLoaderData() as ArchiveListRouteData;
  const location = useLocation();
  const authState = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialView = archiveViewFromSearchParam(searchParams.get("view"));
  const reviewAuthorName =
    authState.status === "ready" ? (authState.auth.displayName ?? authState.auth.shortName) : null;
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
      reviewAuthorName={reviewAuthorName}
    />
  );
}
