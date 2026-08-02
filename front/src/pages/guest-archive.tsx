import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { archiveViewFromSearchParam, type ArchiveView } from "@/features/archive/model/archive-model";
import { guestArchiveReadView } from "@/features/archive/model/archive-read-view";
import ArchivePage from "@/features/archive/ui/archive-page";
import type { GuestArchiveContentProps } from "@/features/guest-browse/route/guest-scoped-app-route";

export function GuestArchiveContent({
  data,
  routePathname,
  routeSearch,
  feedbackLockedAction,
  onLoadMoreSessions,
}: GuestArchiveContentProps) {
  const [, setSearchParams] = useSearchParams();
  const view = archiveViewFromSearchParam(new URLSearchParams(routeSearch).get("view"));
  const handleViewChange = useCallback((nextView: ArchiveView) => {
    setSearchParams({ view: nextView }, { replace: true });
  }, [setSearchParams]);

  return (
    <ArchivePage
      {...guestArchiveReadView(data)}
      initialView={view}
      onViewChange={handleViewChange}
      routePathname={routePathname}
      routeSearch={routeSearch}
      onLoadMoreSessions={onLoadMoreSessions}
      feedbackLockedAction={feedbackLockedAction}
    />
  );
}
