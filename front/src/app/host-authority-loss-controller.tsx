import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import {
  hostAuthoritySafeDestination,
  type HostSecurityPurgeCode,
} from "@/features/host/model/host-authority-loss";
import { HOST_AUTHORITY_LOSS_HANDOFF_STATE_KEY } from "@/features/host/model/host-authority-navigation";
import { purgeClubHostState } from "@/features/host/queries/host-state-purge";
import {
  hostSensitiveStorage,
  type HostSensitiveStorage,
} from "@/features/host/storage/host-sensitive-storage";
import { subscribeHostAuthorityLoss } from "@/shared/api/host-authority-event";
import type { HostAuthorityLossEvent } from "@/shared/api/host-authority-event";

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
  onBeforePurge,
  resolveSafeTarget,
  onHandled,
}: {
  storage?: HostSensitiveStorage;
  onBeforePurge?: (event: HostAuthorityLossEvent) => void;
  resolveSafeTarget?: (event: HostAuthorityLossEvent) => Promise<string>;
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
  const navigationEpochRef = useRef(0);
  const handlingClubSlugsRef = useRef(new Set<string>());

  useEffect(() => {
    pathnameRef.current = location.pathname;
    navigationEpochRef.current += 1;
  }, [location.key, location.pathname]);

  useEffect(() => subscribeHostAuthorityLoss((event) => {
    if (handlingClubSlugsRef.current.has(event.clubSlug)) return;
    handlingClubSlugsRef.current.add(event.clubSlug);
    const navigationEpoch = navigationEpochRef.current;
    try {
      onBeforePurge?.(event);
    } catch {
      // Transition invalidation is best-effort isolated; host request/cache purge must continue.
    }
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
        const targetPathname = resolveSafeTarget
          ? await resolveSafeTarget(event)
          : hostAuthoritySafeDestination(event.clubSlug);
        if (
          navigationEpochRef.current !== navigationEpoch
          || clubSlugFromPathname(pathnameRef.current) !== event.clubSlug
        ) return;
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
  }), [navigate, onBeforePurge, onHandled, queryClient, resolveSafeTarget, storage]);

  return null;
}
