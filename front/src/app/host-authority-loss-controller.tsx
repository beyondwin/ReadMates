import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import {
  hostAuthoritySafeDestination,
  type HostSecurityPurgeCode,
} from "@/features/host/model/host-authority-loss";
import { purgeClubHostState } from "@/features/host/queries/host-state-purge";
import {
  hostSensitiveStorage,
  type HostSensitiveStorage,
} from "@/features/host/storage/host-sensitive-storage";
import { subscribeHostAuthorityLoss } from "@/shared/api/host-authority-event";

function clubSlugFromPathname(pathname: string): string | null {
  const encoded = /^\/clubs\/([^/]+)\/app(?:\/|$)/.exec(pathname)?.[1];
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

function afterMountedSensitiveStateCommit(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(() => resolve());
      return;
    }
    globalThis.setTimeout(resolve, 0);
  });
}

export function HostAuthorityLossController({
  storage = hostSensitiveStorage,
  onHandled,
}: {
  storage?: HostSensitiveStorage;
  onHandled: (code: HostSecurityPurgeCode) => void;
}) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const pathnameRef = useRef(location.pathname);

  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => subscribeHostAuthorityLoss((event) => {
    void purgeClubHostState({
      clubSlug: event.clubSlug,
      queryClient,
      storage,
    }).then(async () => {
      if (clubSlugFromPathname(pathnameRef.current) !== event.clubSlug) return;
      await afterMountedSensitiveStateCommit();
      if (clubSlugFromPathname(pathnameRef.current) !== event.clubSlug) return;
      void navigate(hostAuthoritySafeDestination(event.clubSlug), { replace: true });
      onHandled(event.code);
    });
  }), [navigate, onHandled, queryClient, storage]);

  return null;
}
