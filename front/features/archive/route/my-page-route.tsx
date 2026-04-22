import { useCallback } from "react";
import { leaveMembership, loadMyPageRouteData } from "@/features/archive/api/archive-api";
import type { LogoutControlComponent } from "@/features/archive/ui/my-page";
import MyPage from "@/features/archive/ui/my-page";
import { useArchiveRouteData } from "@/features/archive/route/archive-route-data-state";
import { ArchiveRouteState } from "@/features/archive/route/archive-route-state";

async function submitLeaveMembership() {
  const response = await leaveMembership();

  if (!response.ok) {
    throw new Error("Leave membership failed");
  }
}

export function MyPageRoute({
  LogoutButtonComponent,
}: {
  LogoutButtonComponent: LogoutControlComponent;
}) {
  const state = useArchiveRouteData(useCallback(() => loadMyPageRouteData(), []));

  return (
    <ArchiveRouteState state={state} loadingLabel="내 공간을 불러오는 중">
      {(data) => (
        <MyPage
          {...data}
          LogoutButtonComponent={LogoutButtonComponent}
          onLeaveMembership={submitLeaveMembership}
        />
      )}
    </ArchiveRouteState>
  );
}
