import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { useLocation, useNavigate } from "react-router";
import type { AuthMeResponse, NormalizedAuthMeResponse } from "@/shared/auth/auth-contracts";
import { normalizeAuthAvailableSpaces } from "@/shared/auth/available-spaces";
import type { HostAuthorityLossEvent } from "@/shared/api/host-authority-event";
import type {
  PendingHandle,
  PendingRegistration,
  RecoveryObservation,
  ReturnTarget,
  SpaceIdentity,
  TransitionSafety,
  TransitionSafetyRegistrationPort,
} from "@/shared/model/global-space";
import { sameSpaceIdentity, spaceIdentityKey } from "@/shared/model/global-space";
import { SpaceTransitionSafetyProvider } from "@/shared/ui/space-transition-safety-context";
import { projectedSpaceIdentities, safeProjectionFallback } from "./auth-state";
import {
  createGlobalSpaceContinuityStore,
  sanitizeGlobalSpaceReturnTarget,
  type ReturnTargetValidationContext,
} from "./global-space-continuity";
import {
  createGlobalSpaceTransitionCoordinator,
  resolveGlobalSpaceDestination,
} from "./global-space-transition";

export type LatestSpaceProjectionLoader = () => Promise<AuthMeResponse | null>;
export type SpaceRouteValidationLoader = (
  identity: SpaceIdentity,
  auth: NormalizedAuthMeResponse,
) => Promise<ReturnTargetValidationContext>;

export type SpaceTransitionRequestResult =
  | { status: "navigated"; href: string }
  | { status: "cancelled" }
  | { status: "blocked-pending" }
  | { status: "blocked-unknown"; observation: RecoveryObservation }
  | { status: "unavailable" };

export type GlobalSpaceTransitionControllerValue = {
  registrationPort: TransitionSafetyRegistrationPort;
  safety: TransitionSafety;
  availableIdentities: readonly SpaceIdentity[];
  currentIdentity: SpaceIdentity | null;
  requestTransition: (target: SpaceIdentity) => Promise<SpaceTransitionRequestResult>;
  invalidateForHostAuthorityLoss: (event: HostAuthorityLossEvent) => void;
  resolveHostAuthorityLossTarget: (event: HostAuthorityLossEvent) => Promise<string>;
};

const GlobalSpaceTransitionContext = createContext<GlobalSpaceTransitionControllerValue | null>(null);
const RESTORE_STATE_KEY = "readmatesGlobalSpaceRestore";

export function GlobalSpaceTransitionController({
  auth,
  loadLatestProjection = fetchLatestSpaceProjection,
  loadRouteValidation = defaultRouteValidation,
  confirmDirtyLeave = defaultConfirmDirtyLeave,
  storage,
  children,
}: PropsWithChildren<{
  auth: AuthMeResponse;
  loadLatestProjection?: LatestSpaceProjectionLoader;
  loadRouteValidation?: SpaceRouteValidationLoader;
  confirmDirtyLeave?: (message: string) => boolean;
  storage?: Storage;
}>) {
  const location = useLocation();
  const navigate = useNavigate();
  const continuity = useMemo(
    () => createGlobalSpaceContinuityStore(storage ?? browserSessionStorage()),
    [storage],
  );
  const coordinator = useMemo(() => createGlobalSpaceTransitionCoordinator(), []);
  const handles = useRef(new Map<string, PendingHandle>());
  const [safety, setSafety] = useState<TransitionSafety>(() => coordinator.getSnapshot());
  const normalizedAuth = useMemo(() => normalizeAuthAvailableSpaces(auth), [auth]);
  const projectedIdentities = useMemo(() => projectedSpaceIdentities(normalizedAuth), [normalizedAuth]);
  const [revokedHostClubs, setRevokedHostClubs] = useState<ReadonlySet<string>>(() => new Set());
  const availableIdentities = useMemo(() => projectedIdentities.filter((identity) => !(
    identity.productSpace === "clubs"
    && identity.perspective === "host"
    && revokedHostClubs.has(identity.clubSlug)
  )), [projectedIdentities, revokedHostClubs]);
  const availableIdentitiesRef = useRef(availableIdentities);
  const latestAuthRef = useRef(normalizedAuth);
  const locationRef = useRef(location);

  useEffect(() => coordinator.subscribe(() => setSafety(coordinator.getSnapshot())), [coordinator]);
  useEffect(() => {
    availableIdentitiesRef.current = availableIdentities;
    latestAuthRef.current = normalizedAuth;
  }, [availableIdentities, normalizedAuth]);
  useEffect(() => {
    locationRef.current = location;
    restoreFocusAndScroll(location.state);
  }, [location]);

  const registrationPort = useMemo<TransitionSafetyRegistrationPort>(() => ({
    registerDirty: coordinator.registerDirty,
    beginPending(registration: PendingRegistration) {
      const coordinatorHandle = coordinator.beginPending(registration);
      const key = handleKey(registration.operationId, coordinatorHandle.generation);
      const trackedHandle: PendingHandle = {
        generation: coordinatorHandle.generation,
        async settle(result) {
          const outcome = await coordinatorHandle.settle(result);
          if (outcome === "accepted" && handles.current.get(key) === trackedHandle) {
            handles.current.delete(key);
          }
          return outcome;
        },
        publishAccepted: coordinatorHandle.publishAccepted,
        unregister: coordinatorHandle.unregister,
        async reconcile() {
          try {
            return await coordinatorHandle.reconcile();
          } finally {
            if (handles.current.get(key) === trackedHandle) handles.current.delete(key);
          }
        },
      };
      handles.current.set(key, trackedHandle);
      return trackedHandle;
    },
  }), [coordinator]);

  const loadFreshProjection = useCallback(async () => {
    try {
      const loaded = await loadLatestProjection();
      if (!loaded) return null;
      const normalized = normalizeAuthAvailableSpaces(loaded);
      latestAuthRef.current = normalized;
      const identities = projectedSpaceIdentities(normalized);
      availableIdentitiesRef.current = identities;
      return normalized;
    } catch {
      return null;
    }
  }, [loadLatestProjection]);

  const performTransition = useCallback(async (
    targetIdentity: SpaceIdentity,
    reason: "user" | "authority-loss",
    latestAuth: NormalizedAuthMeResponse,
  ): Promise<SpaceTransitionRequestResult> => {
    const latestAvailable = projectedSpaceIdentities(latestAuth);
    continuity.purgeUnavailable(latestAvailable);
    if (reason === "user" && !containsIdentity(latestAvailable, targetIdentity)) {
      return { status: "unavailable" };
    }

    const currentLocation = locationRef.current;
    const currentIdentity = identityFromLocation(currentLocation.pathname, latestAuth)
      ?? identityFromLocation(currentLocation.pathname, normalizedAuth);
    const destinationIdentity = containsIdentity(latestAvailable, targetIdentity)
      ? targetIdentity
      : latestAvailable[0];
    if (!currentIdentity || !destinationIdentity) return { status: "unavailable" };

    if (containsIdentity(latestAvailable, currentIdentity)) {
      const currentValidation = await loadRouteValidation(currentIdentity, latestAuth);
      continuity.remember(currentIdentity, returnTargetFromLocation(currentLocation), currentValidation);
    }
    const destinationValidation = await loadRouteValidation(destinationIdentity, latestAuth);
    const lastSafeTarget = continuity.read(destinationIdentity, destinationValidation);
    const destination = resolveGlobalSpaceDestination({
      currentIdentity,
      targetIdentity: destinationIdentity,
      currentTarget: returnTargetFromLocation(currentLocation),
      lastSafeTarget,
      availableIdentities: latestAvailable,
      correspondence: "unknown",
      reason,
    });
    if (!destination) return { status: "unavailable" };
    const target = sanitizeGlobalSpaceReturnTarget(
      destination.identity,
      destination.target,
      destinationValidation,
    );
    const href = `${target.pathname}${target.search}${target.hash}`;
    await navigate(href, {
      replace: destination.navigation === "replace",
      state: { [RESTORE_STATE_KEY]: { focusId: target.focusId, scrollTop: target.scrollTop } },
    });
    return { status: "navigated", href };
  }, [continuity, loadRouteValidation, navigate, normalizedAuth]);

  const requestTransition = useCallback(async (
    targetIdentity: SpaceIdentity,
  ): Promise<SpaceTransitionRequestResult> => {
    const currentSafety = coordinator.getSnapshot();
    if (currentSafety.kind === "pending") return { status: "blocked-pending" };
    if (currentSafety.kind === "dirty" && !confirmDirtyLeave(currentSafety.message)) {
      return { status: "cancelled" };
    }
    if (currentSafety.kind === "unknown-outcome") {
      const handle = handles.current.get(handleKey(currentSafety.operationId, currentSafety.generation));
      const observation = handle
        ? await handle.reconcile()
        : { operationId: currentSafety.operationId, outcome: "still-unknown" as const };
      if (observation.outcome === "still-unknown" || observation.outcome === "authority-lost") {
        return { status: "blocked-unknown", observation };
      }
    }
    const latest = await loadFreshProjection();
    if (!latest) return { status: "unavailable" };
    try {
      return await performTransition(targetIdentity, "user", latest);
    } catch {
      return { status: "unavailable" };
    }
  }, [confirmDirtyLeave, coordinator, loadFreshProjection, performTransition]);

  const invalidateForHostAuthorityLoss = useCallback((event: HostAuthorityLossEvent) => {
    coordinator.invalidateForAuthorityLoss();
    handles.current.clear();
    const stillAvailable = availableIdentitiesRef.current.filter((identity) => !(
      identity.productSpace === "clubs"
      && identity.perspective === "host"
      && identity.clubSlug === event.clubSlug
    ));
    availableIdentitiesRef.current = stillAvailable;
    setRevokedHostClubs((current) => new Set(current).add(event.clubSlug));
    continuity.purgeUnavailable(stillAvailable);
  }, [continuity, coordinator]);

  const resolveHostAuthorityLossTarget = useCallback(async (event: HostAuthorityLossEvent) => {
    const latest = await loadFreshProjection();
    if (!latest) return safeProjectionFallback(latestAuthRef.current);
    try {
      const latestAvailable = projectedSpaceIdentities(latest).filter((identity) => !(
        identity.productSpace === "clubs"
        && identity.perspective === "host"
        && identity.clubSlug === event.clubSlug
      ));
      continuity.purgeUnavailable(latestAvailable);
      const sameClubMember = latestAvailable.find((identity) =>
        identity.productSpace === "clubs"
        && identity.perspective === "member"
        && identity.clubSlug === event.clubSlug
      );
      const targetIdentity = sameClubMember ?? latestAvailable[0];
      if (!targetIdentity) return safeProjectionFallback(latest);

      const currentLocation = locationRef.current;
      const sourceIdentity = identityFromLocation(currentLocation.pathname, normalizedAuth)
        ?? targetIdentity;
      const validation = await loadRouteValidation(targetIdentity, latest);
      const lastSafeTarget = continuity.read(targetIdentity, validation);
      const destination = resolveGlobalSpaceDestination({
        currentIdentity: sourceIdentity,
        targetIdentity,
        currentTarget: returnTargetFromLocation(currentLocation),
        lastSafeTarget,
        availableIdentities: latestAvailable,
        correspondence: "unavailable",
        reason: "authority-loss",
      });
      if (!destination) return safeProjectionFallback(latest);
      const target = sanitizeGlobalSpaceReturnTarget(targetIdentity, destination.target, validation);
      return `${target.pathname}${target.search}${target.hash}`;
    } catch {
      return safeProjectionFallback(latest);
    }
  }, [continuity, loadFreshProjection, loadRouteValidation, normalizedAuth]);

  const value = useMemo<GlobalSpaceTransitionControllerValue>(() => ({
    registrationPort,
    safety,
    availableIdentities,
    currentIdentity: identityFromLocation(location.pathname, normalizedAuth),
    requestTransition,
    invalidateForHostAuthorityLoss,
    resolveHostAuthorityLossTarget,
  }), [
    availableIdentities,
    invalidateForHostAuthorityLoss,
    location.pathname,
    normalizedAuth,
    registrationPort,
    requestTransition,
    resolveHostAuthorityLossTarget,
    safety,
  ]);

  return (
    <GlobalSpaceTransitionContext.Provider value={value}>
      <SpaceTransitionSafetyProvider port={registrationPort}>
        {children}
      </SpaceTransitionSafetyProvider>
    </GlobalSpaceTransitionContext.Provider>
  );
}

// The app route controller and app-owned shell bridges share this context.
// eslint-disable-next-line react-refresh/only-export-components
export function useGlobalSpaceTransitionController(): GlobalSpaceTransitionControllerValue {
  const value = useContext(GlobalSpaceTransitionContext);
  if (!value) throw new Error("GLOBAL_SPACE_TRANSITION_CONTROLLER_REQUIRED");
  return value;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOptionalGlobalSpaceTransitionController(): GlobalSpaceTransitionControllerValue | null {
  return useContext(GlobalSpaceTransitionContext);
}

// eslint-disable-next-line react-refresh/only-export-components
export function globalSpaceTransitionEpochKey(pathname: string, auth: AuthMeResponse): string {
  const identity = identityFromLocation(pathname, auth);
  if (identity) return spaceIdentityKey(identity);
  const scopedClubSlug = /^\/clubs\/([^/]+)\/app(?:\/|$)/.exec(pathname)?.[1];
  if (scopedClubSlug) {
    const perspective = pathname === `/clubs/${scopedClubSlug}/app/host`
      || pathname.startsWith(`/clubs/${scopedClubSlug}/app/host/`)
      ? "host"
      : "member";
    return `legacy:clubs:${scopedClubSlug}:${perspective}`;
  }
  if (/^\/app(?:\/|$)/.test(pathname)) {
    const perspective = pathname === "/app/host" || pathname.startsWith("/app/host/")
      ? "host"
      : "member";
    return `legacy:clubs:unscoped:${perspective}`;
  }
  return `route:${pathname}`;
}

async function fetchLatestSpaceProjection(): Promise<AuthMeResponse | null> {
  try {
    const response = await fetch("/api/bff/api/auth/me", { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json() as AuthMeResponse;
  } catch {
    return null;
  }
}

async function defaultRouteValidation(
  identity: SpaceIdentity,
  auth: NormalizedAuthMeResponse,
): Promise<ReturnTargetValidationContext> {
  const available = projectedSpaceIdentities(auth);
  return {
    projectionCurrent: containsIdentity(available, identity),
    loadedCaseIds: new Set(),
    authorizedClubIds: new Set(auth.availableSpaces.clubs.map((club) => club.clubId)),
    availableFocusIds: new Set(),
    noteSessionIds: new Set(),
    hostSessionIds: [],
  };
}

function defaultConfirmDirtyLeave(message: string) {
  return window.confirm(message);
}

function containsIdentity(available: readonly SpaceIdentity[], target: SpaceIdentity) {
  return available.some((identity) => sameSpaceIdentity(identity, target));
}

function identityFromLocation(pathname: string, auth: AuthMeResponse): SpaceIdentity | null {
  if (/^\/admin(?:\/|$)/.test(pathname)) return { productSpace: "platform" };
  const encodedSlug = /^\/clubs\/([^/]+)\/app(?:\/|$)/.exec(pathname)?.[1];
  if (!encodedSlug) {
    if (!/^\/app(?:\/|$)/.test(pathname)) return null;
    const projection = normalizeAuthAvailableSpaces(auth).availableSpaces;
    const club = projection.clubs.find((candidate) =>
      candidate.clubSlug === auth.currentMembership?.clubSlug,
    ) ?? projection.clubs.find((candidate) => candidate.clubId === auth.clubId)
      ?? projection.clubs[0];
    if (!club) return null;
    return {
      productSpace: "clubs",
      clubId: club.clubId,
      clubSlug: club.clubSlug,
      perspective: pathname === "/app/host" || pathname.startsWith("/app/host/")
        ? "host"
        : "member",
    };
  }
  let clubSlug: string;
  try {
    clubSlug = decodeURIComponent(encodedSlug);
  } catch {
    return null;
  }
  const club = normalizeAuthAvailableSpaces(auth).availableSpaces.clubs.find((candidate) => candidate.clubSlug === clubSlug);
  if (!club) return null;
  const host = pathname === `/clubs/${encodedSlug}/app/host` || pathname.startsWith(`/clubs/${encodedSlug}/app/host/`);
  return {
    productSpace: "clubs",
    clubId: club.clubId,
    clubSlug: club.clubSlug,
    perspective: host ? "host" : "member",
  };
}

function returnTargetFromLocation(location: { pathname: string; search: string; hash: string }): ReturnTarget {
  const activeElement = document.activeElement;
  return {
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
    focusId: activeElement instanceof HTMLElement && activeElement.id ? activeElement.id : null,
    scrollTop: Number.isFinite(window.scrollY) ? Math.max(0, window.scrollY) : 0,
  };
}

function restoreFocusAndScroll(state: unknown) {
  if (!state || typeof state !== "object") return;
  const restore = (state as Record<string, unknown>)[RESTORE_STATE_KEY];
  if (!restore || typeof restore !== "object") return;
  const { focusId, scrollTop } = restore as { focusId?: unknown; scrollTop?: unknown };
  window.requestAnimationFrame(() => {
    if (typeof scrollTop === "number" && Number.isFinite(scrollTop) && scrollTop > 0) {
      window.scrollTo({ top: scrollTop });
    }
    if (typeof focusId === "string") document.getElementById(focusId)?.focus({ preventScroll: true });
  });
}

function handleKey(operationId: string, generation: number) {
  return `${operationId}:${generation}`;
}

function browserSessionStorage(): Storage {
  try {
    return window.sessionStorage;
  } catch {
    return memoryStorage();
  }
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}
