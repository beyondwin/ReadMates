import { useCallback, useSyncExternalStore } from "react";
import type { DataRouter } from "react-router";
import { LivingArchivePreviewHead } from "@/features/public/ui/living-archive-preview-head";

const livingArchivePreviewPath = "/living-archive-preview";

type PreviewLifetimeRouter = Pick<DataRouter, "state" | "subscribe">;

function isLivingArchivePreviewPath(pathname: string | undefined) {
  return pathname === livingArchivePreviewPath || pathname === `${livingArchivePreviewPath}/`;
}

function routerOwnsLivingArchivePreviewHead(router: PreviewLifetimeRouter) {
  return (
    isLivingArchivePreviewPath(router.state.location.pathname) ||
    isLivingArchivePreviewPath(router.state.navigation.location?.pathname)
  );
}

export function LivingArchivePreviewRouteLifetime({ router }: { router: PreviewLifetimeRouter }) {
  const subscribe = useCallback((onStoreChange: () => void) => router.subscribe(onStoreChange), [router]);
  const getSnapshot = useCallback(() => routerOwnsLivingArchivePreviewHead(router), [router]);
  const ownsPreviewHead = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return ownsPreviewHead ? <LivingArchivePreviewHead /> : null;
}
