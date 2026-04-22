import { useCallback } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { loadArchiveListRouteData } from "@/features/archive/api/archive-api";
import { archiveViewFromSearchParam, type ArchiveView } from "@/features/archive/model/archive-model";
import ArchivePage from "@/features/archive/ui/archive-page";
import { useArchiveRouteData } from "@/features/archive/route/archive-route-data-state";
import { ArchiveRouteState } from "@/features/archive/route/archive-route-state";

export function ArchiveListRoute() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialView = archiveViewFromSearchParam(searchParams.get("view"));
  const handleViewChange = useCallback(
    (view: ArchiveView) => {
      setSearchParams({ view }, { replace: true });
    },
    [setSearchParams],
  );
  const state = useArchiveRouteData(useCallback(() => loadArchiveListRouteData(), []));

  return (
    <ArchiveRouteState state={state} loadingLabel="아카이브를 불러오는 중">
      {(data) => (
        <ArchivePage
          {...data}
          initialView={initialView}
          onViewChange={handleViewChange}
          routePathname={location.pathname}
          routeSearch={location.search}
        />
      )}
    </ArchiveRouteState>
  );
}
