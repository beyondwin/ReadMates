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

export const HOST_AUTHORITY_LOSS_HANDOFF_STATE_KEY = "readmatesHostAuthorityLossHandoffId";
let authorityLossHandoffSequence = 0;

function nextAuthorityLossHandoffId(): string {
  authorityLossHandoffSequence += 1;
  return `host-authority-loss-${authorityLossHandoffSequence}`;
}

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
  onHandled: (
    code: HostSecurityPurgeCode,
    targetPathname: string,
    handoffId: string,
  ) => void;
}) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const pathnameRef = useRef(location.pathname);
  const handlingClubSlugsRef = useRef(new Set<string>());

  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => subscribeHostAuthorityLoss((event) => {
    if (handlingClubSlugsRef.current.has(event.clubSlug)) return;
    handlingClubSlugsRef.current.add(event.clubSlug);
    void (async () => {
      let replacementCommitted = false;
      try {
        await purgeClubHostState({
          clubSlug: event.clubSlug,
          queryClient,
          storage,
        });
        if (clubSlugFromPathname(pathnameRef.current) !== event.clubSlug) return;
        await afterMountedSensitiveStateCommit();
        if (clubSlugFromPathname(pathnameRef.current) !== event.clubSlug) return;
        const targetPathname = hostAuthoritySafeDestination(event.clubSlug);
        const handoffId = nextAuthorityLossHandoffId();
        onHandled(event.code, targetPathname, handoffId);
        void navigate(targetPathname, {
          replace: true,
          state: { [HOST_AUTHORITY_LOSS_HANDOFF_STATE_KEY]: handoffId },
        });
        replacementCommitted = true;
      } finally {
        if (!replacementCommitted) handlingClubSlugsRef.current.delete(event.clubSlug);
      }
    })();
  }), [navigate, onHandled, queryClient, storage]);

  return null;
}
