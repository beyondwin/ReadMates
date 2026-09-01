import { archiveViewFromSearchParam } from "@/features/archive/model/archive-model";
import { normalizeHostSessionLedgerFilters, toHostSessionLedgerSearch } from "@/features/host/model/host-session-ledger-model";
import { buildHostMeetingUrl, parseHostMeetingLocation } from "@/features/host/model/host-session-workspace-navigation";
import { normalizeSupportGrantStatus } from "@/features/platform-admin/model/platform-admin-support-model";
import { analyticsWindowFromSearchParams } from "@/features/platform-admin/model/platform-admin-analytics-model";
import { adminAuditFiltersFromSearchParams, adminAuditSearchFromFilters } from "@/features/platform-admin/model/platform-admin-audit-model";
import { platformAdminClubListFiltersFromSearch, platformAdminClubListSearchParamsFromFilters } from "@/features/platform-admin/model/platform-admin-club-list-filters";
import { parseAdminOperationsSearch } from "@/features/platform-admin/model/platform-admin-operations-model";
import { feedFilterFromSearchParam } from "@/shared/model/notes-feed-model";
import type { ReturnTarget, SpaceIdentity } from "@/shared/model/global-space";
import {
  representativeSpaceReturnTarget,
  sameSpaceIdentity,
  spaceIdentityKey,
} from "@/shared/model/global-space";

export const RETURN_TARGET_ROUTE_FAMILIES = [
  "platform-today",
  "platform-clubs-list",
  "platform-club-detail",
  "platform-support",
  "platform-notifications",
  "platform-ai",
  "platform-audit",
  "platform-analytics",
  "member-archive",
  "member-notes",
  "member-route-root",
  "host-meeting-detail",
  "host-session-ledger",
  "host-notifications",
  "host-route-root",
] as const;

export type ReturnTargetRouteFamily = typeof RETURN_TARGET_ROUTE_FAMILIES[number];

export type ReturnTargetValidationContext = {
  projectionCurrent: boolean;
  loadedCaseIds: ReadonlySet<string>;
  authorizedClubIds: ReadonlySet<string>;
  availableFocusIds: ReadonlySet<string>;
  noteSessionIds: ReadonlySet<string>;
  hostSessionIds: readonly string[];
};

const CONTEXT_FREE_VALIDATION: ReturnTargetValidationContext = {
  projectionCurrent: true,
  loadedCaseIds: new Set(),
  authorizedClubIds: new Set(),
  availableFocusIds: new Set(),
  noteSessionIds: new Set(),
  hostSessionIds: [],
};

type RouteRule = {
  family: ReturnTargetRouteFamily;
  matches: (identity: SpaceIdentity, pathname: string) => boolean;
  fallback: (identity: SpaceIdentity, pathname: string, context: ReturnTargetValidationContext) => ReturnTarget;
  sanitize: (
    identity: SpaceIdentity,
    target: ReturnTarget,
    context: ReturnTargetValidationContext,
  ) => ReturnTarget;
};

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const SAFE_EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_FOCUS_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_SEARCH_LENGTH = 2_048;
const MAX_TEXT_FILTER_LENGTH = 100;
const MAX_SCROLL_TOP = 1_000_000;
const SUPPORT_STATUSES = new Set(["ACTIVE", "EXPIRING", "EXPIRED", "REVOKED"]);
const NOTIFICATION_FOCUSES = new Set(["outbox_backlog", "notification_dispatch_success"]);
const HOST_NOTIFICATION_EVENT_TYPES = new Set([
  "NEXT_BOOK_PUBLISHED",
  "SESSION_REMINDER_DUE",
  "FEEDBACK_DOCUMENT_PUBLISHED",
  "REVIEW_PUBLISHED",
  "SESSION_RECORD_UPDATED",
]);
const HOST_MEETING_TASKS = new Set([
  "overview",
  "responses",
  "attendance",
  "records",
  "notifications",
  "history",
]);

const routeRules: readonly RouteRule[] = [
  {
    family: "platform-today",
    matches: (identity, pathname) => identity.productSpace === "platform" && (pathname === "/admin" || pathname === "/admin/today"),
    fallback: () => emptyTarget("/admin/today"),
    sanitize: (_identity, target, context) => sanitizeToday(target, context),
  },
  {
    family: "platform-clubs-list",
    matches: (identity, pathname) => identity.productSpace === "platform" && pathname === "/admin/clubs",
    fallback: () => emptyTarget("/admin/clubs"),
    sanitize: (_identity, target, context) => sanitizeClubList(target, context),
  },
  {
    family: "platform-club-detail",
    matches: (identity, pathname) => identity.productSpace === "platform" && /^\/admin\/clubs\/[^/]+$/.test(pathname),
    fallback: () => emptyTarget("/admin/clubs"),
    sanitize: (_identity, target, context) => sanitizeClubDetail(target, context),
  },
  {
    family: "platform-support",
    matches: (identity, pathname) => identity.productSpace === "platform" && pathname === "/admin/support",
    fallback: () => emptyTarget("/admin/support"),
    sanitize: (_identity, target, context) => sanitizeSupport(target, context),
  },
  {
    family: "platform-notifications",
    matches: (identity, pathname) => identity.productSpace === "platform" && pathname === "/admin/notifications",
    fallback: () => emptyTarget("/admin/notifications"),
    sanitize: (_identity, target, context) => sanitizePlatformNotifications(target, context),
  },
  {
    family: "platform-ai",
    matches: (identity, pathname) => identity.productSpace === "platform" && pathname === "/admin/ai-ops",
    fallback: () => emptyTarget("/admin/ai-ops"),
    sanitize: (_identity, target) => sanitizeAi(target),
  },
  {
    family: "platform-audit",
    matches: (identity, pathname) => identity.productSpace === "platform" && pathname === "/admin/audit",
    fallback: () => emptyTarget("/admin/audit"),
    sanitize: (_identity, target) => sanitizeAudit(target),
  },
  {
    family: "platform-analytics",
    matches: (identity, pathname) => identity.productSpace === "platform" && pathname === "/admin/analytics",
    fallback: () => emptyTarget("/admin/analytics"),
    sanitize: (_identity, target) => sanitizeAnalytics(target),
  },
  {
    family: "member-archive",
    matches: (identity, pathname) => matchesClubPath(identity, pathname, "/archive", "member"),
    fallback: (identity) => clubTarget(identity, "/archive"),
    sanitize: (identity, target, context) => sanitizeMemberArchive(identity, target, context),
  },
  {
    family: "member-notes",
    matches: (identity, pathname) => matchesClubPath(identity, pathname, "/notes", "member"),
    fallback: (identity) => clubTarget(identity, "/notes"),
    sanitize: (identity, target, context) => sanitizeMemberNotes(identity, target, context),
  },
  {
    family: "member-route-root",
    matches: (identity, pathname) => matchesMemberRoot(identity, pathname),
    fallback: (_identity, pathname) => emptyTarget(pathname),
    sanitize: (_identity, target) => emptyTarget(target.pathname),
  },
  {
    family: "host-meeting-detail",
    matches: (identity, pathname) => matchesHostMeetingDetail(identity, pathname),
    fallback: (identity) => clubTarget(identity, "/host/sessions"),
    sanitize: (identity, target, context) => sanitizeHostMeeting(identity, target, context),
  },
  {
    family: "host-session-ledger",
    matches: (identity, pathname) => matchesClubPath(identity, pathname, "/host/sessions", "host") || matchesClubPath(identity, pathname, "/host/records", "host"),
    fallback: (identity, pathname) => clubTarget(identity, pathname.endsWith("/records") ? "/host/records" : "/host/sessions"),
    sanitize: (_identity, target) => sanitizeHostLedger(target),
  },
  {
    family: "host-notifications",
    matches: (identity, pathname) => matchesClubPath(identity, pathname, "/host/notifications", "host"),
    fallback: (identity, _pathname, context) => hostNotificationsFallback(identity, context),
    sanitize: (identity, target, context) => sanitizeHostNotifications(identity, target, context),
  },
  {
    family: "host-route-root",
    matches: (identity, pathname) => matchesHostRoot(identity, pathname),
    fallback: (_identity, pathname) => emptyTarget(pathname),
    sanitize: (_identity, target) => emptyTarget(target.pathname),
  },
];

export function sanitizeGlobalSpaceReturnTarget(
  identity: SpaceIdentity,
  target: ReturnTarget,
  context: ReturnTargetValidationContext,
): ReturnTarget {
  if (!isSafePathname(target.pathname)) return representativeSpaceReturnTarget(identity);
  const rule = routeRules.find((candidate) => candidate.matches(identity, target.pathname));
  if (!rule) return representativeSpaceReturnTarget(identity);
  if (!isStructurallySafeTarget(target)) return rule.fallback(identity, target.pathname, context);
  if (!context.projectionCurrent) {
    return rule.fallback(identity, target.pathname, CONTEXT_FREE_VALIDATION);
  }
  if (hasDuplicateParams(target.search)) {
    return rule.fallback(identity, target.pathname, context);
  }
  return rule.sanitize(identity, { ...target, hash: "" }, context);
}

function sanitizeToday(target: ReturnTarget, context: ReturnTargetValidationContext): ReturnTarget {
  const input = new URLSearchParams(target.search);
  const parsed = parseAdminOperationsSearch(input);
  const params = new URLSearchParams();
  const query = parsed.query.trim();
  const selectedCase = parsed.caseId && context.loadedCaseIds.has(parsed.caseId) ? parsed.caseId : null;
  if (parsed.workView !== "briefing") params.set("view", parsed.workView);
  if (query && query.length <= MAX_TEXT_FILTER_LENGTH) params.set("q", query);
  if (parsed.filter.states?.length) params.set("state", parsed.filter.states.map(lower).join(","));
  if (parsed.filter.severities?.length) params.set("severity", parsed.filter.severities.map(lower).join(","));
  if (parsed.filter.sources?.length) params.set("source", parsed.filter.sources.map(lower).join(","));
  if (parsed.filter.assignee) params.set("assignee", lower(parsed.filter.assignee));
  if (selectedCase) params.set("case", selectedCase);
  if (selectedCase && parsed.mode === "detail") params.set("mode", "detail");
  return finalizeTarget(target.pathname === "/admin" ? "/admin/today" : target.pathname, params, target, context);
}

function sanitizeClubList(target: ReturnTarget, context: ReturnTargetValidationContext): ReturnTarget {
  const input = new URLSearchParams(target.search);
  const filters = platformAdminClubListFiltersFromSearch(input);
  if (filters.search && filters.search.length > MAX_TEXT_FILTER_LENGTH) filters.search = undefined;
  const params = platformAdminClubListSearchParamsFromFilters(filters);
  if (input.get("onboarding") === "1") params.set("onboarding", "1");
  const focusId = validFocus(input.get("focusId"), context);
  const scrollTop = boundedScroll(input.get("scrollTop"));
  if (focusId) params.set("focusId", focusId);
  if (scrollTop > 0) params.set("scrollTop", String(scrollTop));
  return finalizeTarget(target.pathname, params, { ...target, focusId, scrollTop }, context);
}

function sanitizeClubDetail(target: ReturnTarget, context: ReturnTargetValidationContext): ReturnTarget {
  const clubId = target.pathname.slice("/admin/clubs/".length);
  if (!SAFE_IDENTIFIER.test(clubId) || !context.authorizedClubIds.has(clubId)) return emptyTarget("/admin/clubs");
  const input = new URLSearchParams(target.search);
  const params = new URLSearchParams();
  const returnTo = sanitizeAdminClubsReturn(input.get("returnTo"), context);
  const focusId = validFocus(input.get("focusId"), context);
  const scrollTop = boundedScroll(input.get("scrollTop"));
  if (returnTo) params.set("returnTo", returnTo);
  if (focusId) params.set("focusId", focusId);
  if (scrollTop > 0) params.set("scrollTop", String(scrollTop));
  return finalizeTarget(target.pathname, params, { ...target, focusId, scrollTop }, context);
}

function sanitizeSupport(target: ReturnTarget, context: ReturnTargetValidationContext): ReturnTarget {
  const input = new URLSearchParams(target.search);
  const params = new URLSearchParams();
  const clubId = input.get("clubId");
  const status = normalizeSupportGrantStatus(input.get("status"));
  if (clubId && SAFE_IDENTIFIER.test(clubId) && context.authorizedClubIds.has(clubId)) params.set("clubId", clubId);
  if (status && SUPPORT_STATUSES.has(status)) params.set("status", status);
  return finalizeTarget(target.pathname, params, target, context);
}

function sanitizePlatformNotifications(target: ReturnTarget, context: ReturnTargetValidationContext): ReturnTarget {
  const input = new URLSearchParams(target.search);
  const params = new URLSearchParams();
  const focus = input.get("focus");
  const clubId = input.get("clubId");
  if (focus && NOTIFICATION_FOCUSES.has(focus)) params.set("focus", focus);
  if (clubId && SAFE_IDENTIFIER.test(clubId) && context.authorizedClubIds.has(clubId)) params.set("clubId", clubId);
  return finalizeTarget(target.pathname, params, target, context);
}

function sanitizeAi(target: ReturnTarget): ReturnTarget {
  const input = new URLSearchParams(target.search);
  const params = new URLSearchParams();
  const errorCode = input.get("errorCode");
  const clubId = input.get("clubId");
  const jobId = input.get("jobId");
  const window = input.get("window");
  if (errorCode && SAFE_ERROR_CODE.test(errorCode)) params.set("errorCode", errorCode);
  if (clubId && SAFE_IDENTIFIER.test(clubId)) params.set("clubId", clubId);
  if (jobId && SAFE_IDENTIFIER.test(jobId)) params.set("jobId", jobId);
  if (window === "7d" || window === "30d" || window === "90d") params.set("window", window);
  return plainTarget(target.pathname, params);
}

function sanitizeAudit(target: ReturnTarget): ReturnTarget {
  const input = new URLSearchParams(target.search);
  const filters = adminAuditFiltersFromSearchParams(input);
  const params = adminAuditSearchFromFilters({
    ...(input.has("range") ? { range: filters.range } : {}),
    ...(input.has("from") ? { from: filters.from } : {}),
    ...(input.has("to") ? { to: filters.to } : {}),
    ...(input.has("clubId") ? { clubId: safeIdentifierOrNull(filters.clubId) } : {}),
    ...(input.has("actorRole") ? { actorRole: filters.actorRole } : {}),
    ...(input.has("sourceSlice") ? { sourceSlice: filters.sourceSlice } : {}),
    ...(input.has("actionCategory") ? { actionCategory: filters.actionCategory } : {}),
    ...(input.has("outcome") ? { outcome: filters.outcome } : {}),
  });
  const event = input.get("event");
  const targetFilter = input.get("target");
  if (event && SAFE_EVENT_ID.test(event)) params.set("event", event);
  if (input.get("mode") === "detail" && event && SAFE_EVENT_ID.test(event)) params.set("mode", "detail");
  if (targetFilter && SAFE_IDENTIFIER.test(targetFilter)) params.set("target", targetFilter);
  return plainTarget(target.pathname, params);
}

function sanitizeAnalytics(target: ReturnTarget): ReturnTarget {
  const input = new URLSearchParams(target.search);
  const params = new URLSearchParams();
  if (input.has("window")) params.set("window", analyticsWindowFromSearchParams(input));
  return plainTarget(target.pathname, params);
}

function sanitizeMemberArchive(identity: SpaceIdentity, target: ReturnTarget, context: ReturnTargetValidationContext): ReturnTarget {
  const input = new URLSearchParams(target.search);
  const params = new URLSearchParams();
  const rawView = input.get("view");
  const view = archiveViewFromSearchParam(rawView);
  if (rawView && view !== "sessions") params.set("view", view);
  return finalizeTarget(clubPath(identity, "/archive"), params, target, context);
}

function sanitizeMemberNotes(identity: SpaceIdentity, target: ReturnTarget, context: ReturnTargetValidationContext): ReturnTarget {
  const input = new URLSearchParams(target.search);
  const params = new URLSearchParams();
  const rawFilter = input.get("filter");
  const filter = feedFilterFromSearchParam(rawFilter);
  const sessionId = input.get("sessionId");
  if (rawFilter && filter !== "all") params.set("filter", filter);
  if (sessionId && context.noteSessionIds.has(sessionId)) params.set("sessionId", sessionId);
  return finalizeTarget(clubPath(identity, "/notes"), params, target, context);
}

function sanitizeHostMeeting(identity: SpaceIdentity, target: ReturnTarget, context: ReturnTargetValidationContext): ReturnTarget {
  const sessionId = hostMeetingId(identity, target.pathname);
  if (!sessionId || (sessionId !== "new" && !context.hostSessionIds.includes(sessionId))) {
    return clubTarget(identity, "/host/sessions");
  }
  const input = new URLSearchParams(target.search);
  const task = input.get("task");
  const owned = new URLSearchParams();
  for (const key of ["section", "source", "records", "aigen"] as const) {
    const value = input.get(key);
    if (value !== null) owned.set(key, value);
  }
  if (task !== null) {
    if (
      !HOST_MEETING_TASKS.has(task)
      || input.has("section")
      || input.has("records")
      || input.has("aigen")
    ) return clubTarget(identity, "/host/sessions");
    owned.set("section", task);
  }
  if (!validHostMeetingEvidence(owned)) return clubTarget(identity, "/host/sessions");
  const parsed = parseHostMeetingLocation(owned.toString() ? `?${owned}` : "");
  const href = buildHostMeetingUrl(target.pathname, parsed);
  const canonical = new URL(href, "https://readmates.invalid");
  if (task !== null) {
    const params = new URLSearchParams(canonical.search);
    params.delete("section");
    params.set("task", task);
    return plainTarget(target.pathname, params);
  }
  return plainTarget(target.pathname, canonical.searchParams);
}

function validHostMeetingEvidence(params: URLSearchParams) {
  const section = params.get("section");
  const source = params.get("source");
  const records = params.get("records");
  const aigen = params.get("aigen");
  if (records !== null && records !== "json") return false;
  if (aigen !== null && aigen !== "1") return false;
  if (source !== null && source !== "manual" && source !== "ai" && source !== "json") return false;

  if (section !== null) {
    if (records !== null || aigen !== null) return false;
    if (section === "basic" || section === "overview") return source === null;
    if (!HOST_MEETING_TASKS.has(section)) return false;
    return section === "records" ? true : source === null;
  }
  if (source !== null) return false;
  return !(records !== null && aigen !== null);
}

function sanitizeHostLedger(target: ReturnTarget): ReturnTarget {
  const input = new URLSearchParams(target.search);
  if ((input.get("search")?.trim().length ?? 0) > MAX_TEXT_FILTER_LENGTH) return emptyTarget(target.pathname);
  const normalized = normalizeHostSessionLedgerFilters(input);
  const search = toHostSessionLedgerSearch(normalized);
  return { ...emptyTarget(target.pathname), search };
}

function sanitizeHostNotifications(identity: SpaceIdentity, target: ReturnTarget, context: ReturnTargetValidationContext): ReturnTarget {
  const input = new URLSearchParams(target.search);
  const requestedSession = input.get("sessionId");
  const sessionId = requestedSession && context.hostSessionIds.includes(requestedSession)
    ? requestedSession
    : context.hostSessionIds[0] ?? null;
  const eventType = input.get("eventType");
  const params = new URLSearchParams();
  if (sessionId) params.set("sessionId", sessionId);
  if (eventType && HOST_NOTIFICATION_EVENT_TYPES.has(eventType)) params.set("eventType", eventType);
  return plainTarget(clubPath(identity, "/host/notifications"), params);
}

function hostNotificationsFallback(identity: SpaceIdentity, context: ReturnTargetValidationContext) {
  const params = new URLSearchParams();
  if (context.hostSessionIds[0]) params.set("sessionId", context.hostSessionIds[0]);
  return plainTarget(clubPath(identity, "/host/notifications"), params);
}

function finalizeTarget(
  pathname: string,
  params: URLSearchParams,
  source: ReturnTarget,
  context: ReturnTargetValidationContext,
): ReturnTarget {
  const focusId = validFocus(source.focusId, context);
  const scrollTop = boundedScroll(String(source.scrollTop));
  return { pathname, search: searchString(params), hash: "", focusId, scrollTop };
}

function plainTarget(pathname: string, params: URLSearchParams): ReturnTarget {
  return { pathname, search: searchString(params), hash: "", focusId: null, scrollTop: 0 };
}

function emptyTarget(pathname: string): ReturnTarget {
  return { pathname, search: "", hash: "", focusId: null, scrollTop: 0 };
}

function clubTarget(identity: SpaceIdentity, suffix: string) {
  return emptyTarget(clubPath(identity, suffix));
}

function clubPath(identity: SpaceIdentity, suffix: string) {
  return identity.productSpace === "clubs"
    ? `/clubs/${encodeURIComponent(identity.clubSlug)}/app${suffix}`
    : "/admin/today";
}

function matchesClubPath(
  identity: SpaceIdentity,
  pathname: string,
  suffix: string,
  perspective: "member" | "host",
) {
  return identity.productSpace === "clubs"
    && identity.perspective === perspective
    && pathname === clubPath(identity, suffix);
}

function matchesMemberRoot(identity: SpaceIdentity, pathname: string) {
  if (identity.productSpace !== "clubs" || identity.perspective !== "member") return false;
  return new Set([
    clubPath(identity, ""),
    clubPath(identity, "/session/current"),
    clubPath(identity, "/notifications"),
    clubPath(identity, "/notifications/settings"),
    clubPath(identity, "/me"),
    clubPath(identity, "/me/settings"),
  ]).has(pathname);
}

function matchesHostRoot(identity: SpaceIdentity, pathname: string) {
  if (identity.productSpace !== "clubs" || identity.perspective !== "host") return false;
  return new Set([
    clubPath(identity, "/host"),
    clubPath(identity, "/host/members"),
    clubPath(identity, "/host/people"),
    clubPath(identity, "/host/invitations"),
    clubPath(identity, "/host/settings"),
    clubPath(identity, "/host/operations"),
  ]).has(pathname);
}

function matchesHostMeetingDetail(identity: SpaceIdentity, pathname: string) {
  return hostMeetingId(identity, pathname) !== null;
}

function hostMeetingId(identity: SpaceIdentity, pathname: string) {
  if (identity.productSpace !== "clubs" || identity.perspective !== "host") return null;
  const escapedBase = escapeRegExp(clubPath(identity, "/host/sessions/"));
  return new RegExp(`^${escapedBase}([^/]+)(?:/edit)?$`).exec(pathname)?.[1] ?? null;
}

function sanitizeAdminClubsReturn(raw: string | null, context: ReturnTargetValidationContext) {
  if (!raw || !isSafeRelativeHref(raw)) return null;
  const url = new URL(raw, "https://readmates.invalid");
  if (url.pathname !== "/admin/clubs" || url.hash) return null;
  const sanitized = sanitizeGlobalSpaceReturnTarget(
    { productSpace: "platform" },
    { pathname: url.pathname, search: url.search, hash: "", focusId: null, scrollTop: 0 },
    context,
  );
  return `${sanitized.pathname}${sanitized.search}`;
}

function isStructurallySafeTarget(target: ReturnTarget) {
  if (!isSafePathname(target.pathname)) return false;
  if (target.search && (!target.search.startsWith("?") || target.search.length > MAX_SEARCH_LENGTH)) return false;
  if (hasUnsafeCharacters(target.search) || hasUnsafeCharacters(target.hash)) return false;
  if (!Number.isFinite(target.scrollTop)) return false;
  return target.focusId === null || target.focusId.length <= 128;
}

function isSafePathname(pathname: string) {
  if (!pathname.startsWith("/") || pathname.startsWith("//") || hasUnsafeCharacters(pathname)) return false;
  try {
    const parsed = new URL(pathname, "https://readmates.invalid");
    return parsed.origin === "https://readmates.invalid"
      && parsed.pathname === pathname
      && parsed.search === ""
      && parsed.hash === "";
  } catch {
    return false;
  }
}

function isSafeRelativeHref(href: string) {
  if (!href.startsWith("/") || href.startsWith("//") || href.length > MAX_SEARCH_LENGTH || hasUnsafeCharacters(href)) return false;
  try {
    return new URL(href, "https://readmates.invalid").origin === "https://readmates.invalid";
  } catch {
    return false;
  }
}

function hasUnsafeCharacters(value: string) {
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    if (character === "\\" || point <= 0x1f || point === 0x7f) return true;
  }
  return false;
}

function hasDuplicateParams(search: string) {
  const seen = new Set<string>();
  for (const key of new URLSearchParams(search).keys()) {
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function validFocus(value: string | null, context: ReturnTargetValidationContext) {
  return value && SAFE_FOCUS_ID.test(value) && context.availableFocusIds.has(value) ? value : null;
}

function boundedScroll(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= MAX_SCROLL_TOP ? parsed : 0;
}

function safeIdentifierOrNull(value: string | null | undefined) {
  return value && SAFE_IDENTIFIER.test(value) ? value : null;
}

function searchString(params: URLSearchParams) {
  const search = params.toString();
  return search ? `?${search}` : "";
}

function lower(value: string) {
  return value.toLocaleLowerCase("en-US");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const STORAGE_PREFIX = "readmates:global-space-return-target:v1:";

export function globalSpaceReturnTargetStorageKey(identity: SpaceIdentity) {
  return `${STORAGE_PREFIX}${encodeURIComponent(spaceIdentityKey(identity))}`;
}

export type GlobalSpaceContinuityStore = {
  remember: (identity: SpaceIdentity, target: ReturnTarget, context: ReturnTargetValidationContext) => void;
  read: (identity: SpaceIdentity, context: ReturnTargetValidationContext) => ReturnTarget | null;
  purgeUnavailable: (availableIdentities: readonly SpaceIdentity[]) => void;
};

export function createGlobalSpaceContinuityStore(storage: Storage): GlobalSpaceContinuityStore {
  function remember(identity: SpaceIdentity, target: ReturnTarget, context: ReturnTargetValidationContext) {
    const key = globalSpaceReturnTargetStorageKey(identity);
    try {
      if (!context.projectionCurrent) {
        storage.removeItem(key);
        return;
      }
      const sanitized = sanitizeGlobalSpaceReturnTarget(identity, target, context);
      storage.setItem(key, JSON.stringify(sanitized));
    } catch {
      // Continuity is optional; the current URL remains render authority.
    }
  }

  function read(identity: SpaceIdentity, context: ReturnTargetValidationContext): ReturnTarget | null {
    const key = globalSpaceReturnTargetStorageKey(identity);
    try {
      if (!context.projectionCurrent) {
        storage.removeItem(key);
        return null;
      }
      const current = storage.getItem(key);
      if (current !== null) return readStoredTarget(identity, current, context, storage, key);
      const legacy = readLegacyTarget(identity, storage);
      if (!legacy) return null;
      const sanitized = sanitizeGlobalSpaceReturnTarget(identity, legacy, context);
      storage.setItem(key, JSON.stringify(sanitized));
      return sanitized;
    } catch {
      return null;
    }
  }

  function purgeUnavailable(availableIdentities: readonly SpaceIdentity[]) {
    const availableKeys = new Set(availableIdentities.map(globalSpaceReturnTargetStorageKey));
    try {
      const existing = Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .filter((key): key is string => key !== null && key.startsWith(STORAGE_PREFIX));
      for (const key of existing) {
        if (!availableKeys.has(key)) storage.removeItem(key);
      }
    } catch {
      // A storage denial cannot widen route authority.
    }
  }

  return { remember, read, purgeUnavailable };
}

function readStoredTarget(
  identity: SpaceIdentity,
  raw: string,
  context: ReturnTargetValidationContext,
  storage: Storage,
  key: string,
) {
  const parsed = parseReturnTarget(raw);
  if (!parsed) {
    storage.removeItem(key);
    return null;
  }
  const sanitized = sanitizeGlobalSpaceReturnTarget(identity, parsed, context);
  storage.setItem(key, JSON.stringify(sanitized));
  return sanitized;
}

function readLegacyTarget(identity: SpaceIdentity, storage: Storage): ReturnTarget | null {
  if (identity.productSpace !== "clubs") return null;
  const pathname = storage.getItem(`readmates:last-safe-workspace-target:${identity.perspective}`);
  if (!pathname) return null;
  let url: URL;
  try {
    url = new URL(pathname, "https://readmates.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "https://readmates.invalid") return null;
  return { pathname: url.pathname, search: url.search, hash: "", focusId: null, scrollTop: 0 };
}

function parseReturnTarget(raw: string): ReturnTarget | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.pathname !== "string"
    || typeof record.search !== "string"
    || typeof record.hash !== "string"
    || (record.focusId !== null && typeof record.focusId !== "string")
    || typeof record.scrollTop !== "number"
  ) return null;
  return {
    pathname: record.pathname,
    search: record.search,
    hash: record.hash,
    focusId: record.focusId as string | null,
    scrollTop: record.scrollTop,
  };
}

export function isSpaceIdentityAvailable(identity: SpaceIdentity, available: readonly SpaceIdentity[]) {
  return available.some((candidate) => sameSpaceIdentity(candidate, identity));
}
