import { useCallback, useEffect } from "react";
import { useBlocker } from "react-router";
import { isPendingHostAuthorityNavigation } from "@/features/host/model/host-authority-navigation";

export function useDraftRouteNavigationGuard(shouldBlock: boolean) {
  const blocker = useBlocker(useCallback(
    ({ currentLocation, nextLocation }) =>
      shouldBlock
      && currentLocation.pathname !== nextLocation.pathname
      && !isPendingHostAuthorityNavigation(nextLocation),
    [shouldBlock],
  ));
  useEffect(() => {
    if (blocker.state !== "blocked") {
      return;
    }
    if (window.confirm("저장되지 않은 작업 초안이 있습니다. 이 화면을 떠날까요?")) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker]);
}
