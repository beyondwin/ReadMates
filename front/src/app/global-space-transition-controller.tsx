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
import { fetchNoteSessions } from "@/features/archive/api/archive-api";
import { fetchHostSessionDetail, fetchHostSessions } from "@/features/host/api/host-api";
import { fetchPlatformAdminClubs, fetchPlatformAdminClub } from "@/features/platform-admin/api/platform-admin-api";
import { fetchAdminOperationCases } from "@/features/platform-admin/api/platform-admin-operations-api";
import { platformAdminClubListFiltersFromSearch } from "@/features/platform-admin/model/platform-admin-club-list-filters";
import {
  effectiveAdminOperationsFilter,
  parseAdminOperationsSearch,
} from "@/features/platform-admin/model/platform-admin-operations-model";
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
import {
  representativeSpaceReturnTarget,
  sameSpaceIdentity,
  spaceIdentityKey,
} from "@/shared/model/global-space";
import { SpaceTransitionSafetyProvider } from "@/shared/ui/space-transition-safety-context";
import { projectedSpaceIdentities, safeProjectionFallback } from "./auth-state";
import {
  createGlobalSpaceContinuityStore,
  globalSpaceReturnTargetStorageKey,
  sanitizeGlobalSpaceReturnTarget,
  type ReturnTargetValidationContext,
} from "./global-space-continuity";
import {
  createGlobalSpaceTransitionCoordinator,
  resolveGlobalSpaceDestination,
} from "./global-space-transition";

export type LatestSpaceProjectionLoader = (signal: AbortSignal) => Promise<AuthMeResponse | null>;
export type SpaceRouteValidationLoader = (
  identity: SpaceIdentity,
  auth: NormalizedAuthMeResponse,
  target: ReturnTarget,
  signal: AbortSignal,
) => Promise<ReturnTargetValidationContext>;
export type TransitionNavigation = (
  href: string,
  options: { replace: boolean; state: Record<string, unknown> },
  signal: AbortSignal,
) => void | Promise<void>;

export type SpaceTransitionRequestResult =
  | { status: "navigated"; href: string }
  | { status: "cancelled" }
  | { status: "blocked-pending" }
  | { status: "blocked-unknown"; observation: RecoveryObservation }
  | { status: "obsolete" }
  | { status: "unavailable" };

export type GlobalSpaceTransitionControllerValue = {
  registrationPort: TransitionSafetyRegistrationPort;
  safety: TransitionSafety;
  availableIdentities: readonly SpaceIdentity[];
  currentIdentity: SpaceIdentity | null;
  retainedRecoveryCount: number;
  requestTransition: (target: SpaceIdentity) => Promise<SpaceTransitionRequestResult>;
  invalidateForHostAuthorityLoss: (event: HostAuthorityLossEvent) => void;
  resolveHostAuthorityLossTarget: (event: HostAuthorityLossEvent) => Promise<string>;
};

const GlobalSpaceTransitionContext = createContext<GlobalSpaceTransitionControllerValue | null>(null);
const RESTORE_STATE_KEY = "readmatesGlobalSpaceRestore";
export const GLOBAL_SPACE_ROUTER_CANCELLATION_HASH_PREFIX = "#readmates-authority-loss-cancel";

export function GlobalSpaceTransitionController({
  auth,
  loadLatestProjection = fetchLatestSpaceProjection,
  loadRouteValidation,
  confirmDirtyLeave = defaultConfirmDirtyLeave,
  navigateTransition: injectedNavigation,
  storage,
  children,
}: PropsWithChildren<{
  auth: AuthMeResponse;
  loadLatestProjection?: LatestSpaceProjectionLoader;
  loadRouteValidation?: SpaceRouteValidationLoader;
  confirmDirtyLeave?: (message: string) => boolean;
  navigateTransition?: TransitionNavigation;
  storage?: Storage;
}>) {
  const location = useLocation();
  const navigate = useNavigate();
  const continuityStorage = useMemo(() => storage ?? browserSessionStorage(), [storage]);
  const continuity = useMemo(
    () => createGlobalSpaceContinuityStore(continuityStorage),
    [continuityStorage],
  );
  const coordinator = useMemo(() => createGlobalSpaceTransitionCoordinator(), []);
  const handles = useRef(new Map<string, PendingHandle>());
  const [retainedRecoveryCount, setRetainedRecoveryCount] = useState(0);
  const transitionIntentRef = useRef(0);
  const transitionAbortRef = useRef<AbortController | null>(null);
  const routerCancellationRef = useRef<Promise<void>>(Promise.resolve());
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
  const routeValidationLoader = useMemo<SpaceRouteValidationLoader>(() => (
    loadRouteValidation ?? ((identity, latestAuth, target) => (
      defaultRouteValidation(identity, latestAuth, target)
    ))
  ), [loadRouteValidation]);
  const navigateTransition = useCallback<TransitionNavigation>((href, options, signal) => {
    if (signal.aborted) return;
    return injectedNavigation
      ? injectedNavigation(href, options, signal)
      : navigate(href, options);
  }, [injectedNavigation, navigate]);
  const cancelPendingRouterNavigation = useCallback(() => {
    const current = locationRef.current;
    const cancellationHash = current.hash === `${GLOBAL_SPACE_ROUTER_CANCELLATION_HASH_PREFIX}-1`
      ? `${GLOBAL_SPACE_ROUTER_CANCELLATION_HASH_PREFIX}-2`
      : `${GLOBAL_SPACE_ROUTER_CANCELLATION_HASH_PREFIX}-1`;
    try {
      const cancellation = navigate({
        pathname: current.pathname,
        search: current.search,
        hash: cancellationHash,
      }, {
        replace: true,
        state: current.state,
        preventScrollReset: true,
      });
      routerCancellationRef.current = cancellation
        ? cancellation.catch(() => undefined)
        : Promise.resolve();
    } catch {
      // Generation and receipt invalidation remain authoritative if router cancellation cannot start.
      routerCancellationRef.current = Promise.resolve();
    }
  }, [navigate]);
  const syncRetainedRecoveryCount = useCallback(() => {
    setRetainedRecoveryCount(handles.current.size);
  }, []);

  useEffect(() => coordinator.subscribe(() => setSafety(coordinator.getSnapshot())), [coordinator]);
  useEffect(() => () => transitionAbortRef.current?.abort(), []);
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
            syncRetainedRecoveryCount();
          }
          return outcome;
        },
        publishAccepted: coordinatorHandle.publishAccepted,
        unregister() {
          coordinatorHandle.unregister();
          queueMicrotask(() => {
            void trackedHandle.reconcile().catch(() => {
              if (handles.current.get(key) === trackedHandle) {
                handles.current.delete(key);
                syncRetainedRecoveryCount();
              }
            });
          });
        },
        async reconcile() {
          try {
            return await coordinatorHandle.reconcile();
          } finally {
            if (handles.current.get(key) === trackedHandle) {
              handles.current.delete(key);
              syncRetainedRecoveryCount();
            }
          }
        },
      };
      handles.current.set(key, trackedHandle);
      syncRetainedRecoveryCount();
      return trackedHandle;
    },
  }), [coordinator, syncRetainedRecoveryCount]);

  const loadFreshProjection = useCallback(async (signal: AbortSignal) => {
    try {
      const loaded = await loadLatestProjection(signal);
      if (!loaded) return null;
      return normalizeAuthAvailableSpaces(loaded);
    } catch {
      return null;
    }
  }, [loadLatestProjection]);

  const performTransition = useCallback(async (
    targetIdentity: SpaceIdentity,
    reason: "user" | "authority-loss",
    latestAuth: NormalizedAuthMeResponse,
    intent: number,
    signal: AbortSignal,
  ): Promise<SpaceTransitionRequestResult> => {
    const intentIsCurrent = () => transitionIntentRef.current === intent && !signal.aborted;
    if (!intentIsCurrent()) return { status: "obsolete" };
    const latestAvailable = projectedSpaceIdentities(latestAuth);
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

    let currentValidation: ReturnTargetValidationContext | null = null;
    if (containsIdentity(latestAvailable, currentIdentity)) {
      currentValidation = await routeValidationLoader(
        currentIdentity,
        latestAuth,
        returnTargetFromLocation(currentLocation),
        signal,
      );
      if (!intentIsCurrent()) return { status: "obsolete" };
    }
    const destinationCandidate = readUnvalidatedReturnTarget(continuityStorage, destinationIdentity)
      ?? representativeSpaceReturnTarget(destinationIdentity);
    const destinationValidation = await routeValidationLoader(
      destinationIdentity,
      latestAuth,
      destinationCandidate,
      signal,
    );
    if (!intentIsCurrent()) return { status: "obsolete" };
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
    if (!intentIsCurrent()) return { status: "obsolete" };
    const target = sanitizeGlobalSpaceReturnTarget(
      destination.identity,
      destination.target,
      destinationValidation,
    );
    const href = `${target.pathname}${target.search}${target.hash}`;
    if (!intentIsCurrent()) return { status: "obsolete" };
    await navigateTransition(href, {
      replace: destination.navigation === "replace",
      state: { [RESTORE_STATE_KEY]: { focusId: target.focusId, scrollTop: target.scrollTop } },
    }, signal);
    if (!intentIsCurrent()) return { status: "obsolete" };
    continuity.purgeUnavailable(latestAvailable);
    if (currentValidation) {
      continuity.remember(currentIdentity, returnTargetFromLocation(currentLocation), currentValidation);
    }
    return { status: "navigated", href };
  }, [continuity, continuityStorage, navigateTransition, normalizedAuth, routeValidationLoader]);

  const requestTransition = useCallback(async (
    targetIdentity: SpaceIdentity,
  ): Promise<SpaceTransitionRequestResult> => {
    const intent = ++transitionIntentRef.current;
    transitionAbortRef.current?.abort();
    const abortController = new AbortController();
    transitionAbortRef.current = abortController;
    const intentIsCurrent = () => (
      transitionIntentRef.current === intent && !abortController.signal.aborted
    );
    try {
      const currentSafety = coordinator.getSnapshot();
      if (currentSafety.kind === "pending") return { status: "blocked-pending" };
      if (currentSafety.kind === "dirty" && !confirmDirtyLeave(currentSafety.message)) {
        return { status: "cancelled" };
      }
      if (currentSafety.kind === "unknown-outcome") {
        const handle = handles.current.get(handleKey(currentSafety.operationId, currentSafety.generation));
        let observation: RecoveryObservation;
        try {
          observation = handle
            ? await handle.reconcile()
            : { operationId: currentSafety.operationId, outcome: "still-unknown" };
        } catch {
          if (!intentIsCurrent()) return { status: "obsolete" };
          observation = {
            operationId: currentSafety.operationId,
            outcome: "still-unknown",
          };
        }
        if (!intentIsCurrent()) return { status: "obsolete" };
        if (observation.outcome === "still-unknown" || observation.outcome === "authority-lost") {
          return { status: "blocked-unknown", observation };
        }
      }
      const latest = await loadFreshProjection(abortController.signal);
      if (!intentIsCurrent()) return { status: "obsolete" };
      if (!latest) return { status: "unavailable" };
      latestAuthRef.current = latest;
      availableIdentitiesRef.current = projectedSpaceIdentities(latest);
      return await performTransition(
        targetIdentity,
        "user",
        latest,
        intent,
        abortController.signal,
      );
    } catch {
      return intentIsCurrent() ? { status: "unavailable" } : { status: "obsolete" };
    }
  }, [confirmDirtyLeave, coordinator, loadFreshProjection, performTransition]);

  const invalidateForHostAuthorityLoss = useCallback((event: HostAuthorityLossEvent) => {
    transitionIntentRef.current += 1;
    transitionAbortRef.current?.abort();
    coordinator.invalidateForAuthorityLoss();
    handles.current.clear();
    syncRetainedRecoveryCount();
    cancelPendingRouterNavigation();
    const stillAvailable = availableIdentitiesRef.current.filter((identity) => !(
      identity.productSpace === "clubs"
      && identity.perspective === "host"
      && identity.clubSlug === event.clubSlug
    ));
    availableIdentitiesRef.current = stillAvailable;
    setRevokedHostClubs((current) => new Set(current).add(event.clubSlug));
    continuity.purgeUnavailable(stillAvailable);
  }, [cancelPendingRouterNavigation, continuity, coordinator, syncRetainedRecoveryCount]);

  const resolveHostAuthorityLossTarget = useCallback(async (event: HostAuthorityLossEvent) => {
    await routerCancellationRef.current;
    const authorityController = new AbortController();
    const latest = await loadFreshProjection(authorityController.signal);
    if (!latest) return safeProjectionFallback(latestAuthRef.current);
    try {
      const latestAvailable = projectedSpaceIdentities(latest).filter((identity) => !(
        identity.productSpace === "clubs"
        && identity.perspective === "host"
        && identity.clubSlug === event.clubSlug
      ));
      latestAuthRef.current = latest;
      availableIdentitiesRef.current = latestAvailable;
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
      const targetCandidate = readUnvalidatedReturnTarget(continuityStorage, targetIdentity)
        ?? representativeSpaceReturnTarget(targetIdentity);
      const validation = await routeValidationLoader(
        targetIdentity,
        latest,
        targetCandidate,
        new AbortController().signal,
      );
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
  }, [continuity, continuityStorage, loadFreshProjection, normalizedAuth, routeValidationLoader]);

  const value = useMemo<GlobalSpaceTransitionControllerValue>(() => ({
    registrationPort,
    safety,
    availableIdentities,
    currentIdentity: identityFromLocation(location.pathname, normalizedAuth),
    retainedRecoveryCount,
    requestTransition,
    invalidateForHostAuthorityLoss,
    resolveHostAuthorityLossTarget,
  }), [
    availableIdentities,
    invalidateForHostAuthorityLoss,
    location.pathname,
    normalizedAuth,
    registrationPort,
    retainedRecoveryCount,
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

async function fetchLatestSpaceProjection(signal: AbortSignal): Promise<AuthMeResponse | null> {
  try {
    const response = await fetch("/api/bff/api/auth/me", { cache: "no-store", signal });
    if (!response.ok) return null;
    return await response.json() as AuthMeResponse;
  } catch {
    return null;
  }
}

async function defaultRouteValidation(
  identity: SpaceIdentity,
  auth: NormalizedAuthMeResponse,
  target: ReturnTarget,
): Promise<ReturnTargetValidationContext> {
  const available = projectedSpaceIdentities(auth);
  const validation: ReturnTargetValidationContext = {
    projectionCurrent: containsIdentity(available, identity),
    loadedCaseIds: new Set(),
    authorizedClubIds: new Set(),
    availableFocusIds: new Set(),
    noteSessionIds: new Set(),
    hostSessionIds: [],
  };
  if (!validation.projectionCurrent) return validation;
  if (target.search.length > 2_048) return validation;

  if (identity.productSpace === "platform" && /^\/admin(?:\/today)?$/.test(target.pathname)) {
    const search = parseAdminOperationsSearch(new URLSearchParams(target.search));
    const filter = { ...effectiveAdminOperationsFilter(search) };
    delete filter.cursor;
    const result = await fetchAdminOperationCases(filter);
    const caseIds = new Set(result.items.map((item) => item.id));
    return { ...validation, loadedCaseIds: caseIds, availableFocusIds: caseIds };
  }

  if (identity.productSpace === "platform" && target.pathname === "/admin/clubs") {
    const filters = platformAdminClubListFiltersFromSearch(new URLSearchParams(target.search));
    const result = await fetchPlatformAdminClubs(filters);
    const clubIds = new Set(result.items.map((item) => item.clubId));
    return { ...validation, authorizedClubIds: clubIds, availableFocusIds: clubIds };
  }

  const detailClubId = identity.productSpace === "platform"
    ? /^\/admin\/clubs\/([^/]+)$/.exec(target.pathname)?.[1]
    : null;
  if (detailClubId && ROUTE_ENTITY_IDENTIFIER.test(detailClubId)) {
    const detail = await fetchPlatformAdminClub(detailClubId);
    const clubIds = new Set(detail.clubId === detailClubId ? [detail.clubId] : []);
    return { ...validation, authorizedClubIds: clubIds, availableFocusIds: clubIds };
  }

  if (
    identity.productSpace === "platform"
    && (target.pathname === "/admin/support" || target.pathname === "/admin/notifications")
  ) {
    const clubs = await fetchPlatformAdminClubs();
    return {
      ...validation,
      authorizedClubIds: new Set(clubs.items.map((club) => club.clubId)),
    };
  }

  if (
    identity.productSpace === "clubs"
    && identity.perspective === "member"
    && target.pathname === `/clubs/${encodeURIComponent(identity.clubSlug)}/app/notes`
  ) {
    const sessions = await fetchNoteSessions({ clubSlug: identity.clubSlug }, { limit: 30 });
    const sessionIds = new Set(sessions.items.map((session) => session.sessionId));
    return { ...validation, noteSessionIds: sessionIds, availableFocusIds: sessionIds };
  }

  const expectedHostSessionPrefix = identity.productSpace === "clubs" && identity.perspective === "host"
    ? `/clubs/${encodeURIComponent(identity.clubSlug)}/app/host/sessions/`
    : null;
  const hostMeetingId = expectedHostSessionPrefix && target.pathname.startsWith(expectedHostSessionPrefix)
    ? /^([^/]+)(?:\/edit)?$/.exec(target.pathname.slice(expectedHostSessionPrefix.length))?.[1]
    : null;
  if (
    identity.productSpace === "clubs"
    && hostMeetingId
    && hostMeetingId !== "new"
    && ROUTE_ENTITY_IDENTIFIER.test(hostMeetingId)
  ) {
    const detail = await fetchHostSessionDetail(hostMeetingId, { clubSlug: identity.clubSlug });
    const sessionIds = detail.sessionId === hostMeetingId ? [detail.sessionId] : [];
    return { ...validation, hostSessionIds: sessionIds, availableFocusIds: new Set(sessionIds) };
  }

  if (
    identity.productSpace === "clubs"
    && identity.perspective === "host"
    && target.pathname === `/clubs/${encodeURIComponent(identity.clubSlug)}/app/host/notifications`
  ) {
    const sessions = await fetchHostSessions({ clubSlug: identity.clubSlug }, { limit: 50 });
    const sessionIds = sessions.items.map((session) => session.sessionId);
    return { ...validation, hostSessionIds: sessionIds, availableFocusIds: new Set(sessionIds) };
  }

  return validation;
}

const ROUTE_ENTITY_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function readUnvalidatedReturnTarget(storage: Storage, identity: SpaceIdentity): ReturnTarget | null {
  try {
    const raw = storage.getItem(globalSpaceReturnTargetStorageKey(identity));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.pathname !== "string"
      || typeof parsed.search !== "string"
      || typeof parsed.hash !== "string"
      || (parsed.focusId !== null && typeof parsed.focusId !== "string")
      || typeof parsed.scrollTop !== "number"
    ) return null;
    return {
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
      focusId: parsed.focusId,
      scrollTop: parsed.scrollTop,
    } as ReturnTarget;
  } catch {
    return null;
  }
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
