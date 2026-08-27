export type ClubWorkspace = "member" | "host";

export type SafeRouteFamily =
  | "today"
  | "notes-list"
  | "note-detail"
  | "records-list"
  | "record-detail"
  | "profile"
  | "meetings-list"
  | "meeting-detail"
  | "notification-list"
  | "account";

export type RoleSwitchCandidateInput = {
  pathname: string;
  targetWorkspace: ClubWorkspace;
  transition?: "role-switch" | "authority-loss";
};

export type RoleSwitchCandidate = {
  targetWorkspace: ClubWorkspace;
  target: string;
  fallback: string;
  memberFallback: string;
  requiresCorrespondence: boolean;
  navigation: "push" | "replace";
};

export type ClubSwitchInput = {
  pathname: string;
  targetClubSlug: string;
  targetWorkspace: ClubWorkspace;
};

export type CompatibilityEntryInput = {
  pathname: string;
  search?: string;
  hash?: string;
  currentClubSlug: string;
};

type ParsedAppPath = {
  clubSlug: string | null;
  appPath: string;
};

function parsedAppPath(pathname: string): ParsedAppPath {
  const scoped = /^\/clubs\/([^/]+)\/app(?:(\/.*))?$/.exec(pathname);
  if (scoped) {
    try {
      return { clubSlug: decodeURIComponent(scoped[1]), appPath: scoped[2] ?? "" };
    } catch {
      return { clubSlug: null, appPath: scoped[2] ?? "" };
    }
  }

  const compatibility = /^\/app(?:(\/.*))?$/.exec(pathname);
  return { clubSlug: null, appPath: compatibility?.[1] ?? "" };
}

function canonicalAppBase(clubSlug: string) {
  return clubSlug ? `/clubs/${encodeURIComponent(clubSlug)}/app` : "/app";
}

function pathForWorkspace(clubSlug: string, workspace: ClubWorkspace, suffix = "") {
  const base = canonicalAppBase(clubSlug);
  return workspace === "host" ? `${base}/host${suffix}` : `${base}${suffix}`;
}

function routeFamily(appPath: string, workspace: ClubWorkspace): SafeRouteFamily | null {
  const path = appPath.replace(/\/$/, "");
  const localPath = workspace === "host" ? path.replace(/^\/host/, "") : path;

  if (localPath === "" || localPath === "/session/current") return "today";
  if (workspace === "member" && localPath === "/notes") return "notes-list";
  if (workspace === "member" && /^\/notes\/[^/]+$/.test(localPath)) return "note-detail";
  if (localPath === "/archive" || localPath === "/me/records") return "records-list";
  if (workspace === "host" && (localPath === "/sessions" || localPath === "/records")) return "meetings-list";
  if (workspace === "member" && /^\/sessions\/[^/]+$/.test(localPath)) return "record-detail";
  if (workspace === "member" && /^\/feedback\/[^/]+(?:\/print)?$/.test(localPath)) return "record-detail";
  if (workspace === "host" && /^\/sessions\/(?!new$)[^/]+$/.test(localPath)) return "meeting-detail";
  if (localPath === "/notifications" || localPath === "/notifications/settings") return "notification-list";
  if (workspace === "member" && localPath === "/me") return "profile";
  if (workspace === "member" && localPath === "/me/settings") return "account";
  return null;
}

function safeFallback(clubSlug: string, workspace: ClubWorkspace, family: SafeRouteFamily | null) {
  if (workspace === "host") {
    if (family === "meetings-list" || family === "records-list") return pathForWorkspace(clubSlug, "host", "/sessions");
    if (family === "notification-list") return pathForWorkspace(clubSlug, "host", "/notifications");
    return pathForWorkspace(clubSlug, "host");
  }

  if (family === "notes-list" || family === "note-detail") return pathForWorkspace(clubSlug, "member", "/notes");
  if (family === "meetings-list" || family === "records-list" || family === "record-detail" || family === "meeting-detail") {
    return pathForWorkspace(clubSlug, "member", "/archive");
  }
  if (family === "notification-list") return pathForWorkspace(clubSlug, "member", "/notifications");
  if (family === "profile") return pathForWorkspace(clubSlug, "member", "/me");
  if (family === "account") return pathForWorkspace(clubSlug, "member", "/me/settings");
  return pathForWorkspace(clubSlug, "member");
}

function targetForRoleSwitch(
  clubSlug: string,
  sourceWorkspace: ClubWorkspace,
  targetWorkspace: ClubWorkspace,
  family: SafeRouteFamily | null,
  appPath: string,
) {
  const sessionId =
    sourceWorkspace === "host"
      ? /^\/host\/sessions\/(?!new$)([^/]+)$/.exec(appPath)?.[1]
      : /^\/(?:sessions|feedback)\/([^/]+)(?:\/print)?$/.exec(appPath)?.[1];
  const fallback = safeFallback(clubSlug, targetWorkspace, family);

  if (sourceWorkspace === targetWorkspace) {
    return { target: pathForWorkspace(clubSlug, targetWorkspace, appPath.replace(/^\/host/, "")), fallback, requiresCorrespondence: false };
  }
  if (sessionId && (family === "record-detail" || family === "meeting-detail")) {
    return {
      target: pathForWorkspace(clubSlug, targetWorkspace, `/sessions/${encodeURIComponent(sessionId)}`),
      fallback,
      requiresCorrespondence: true,
    };
  }
  return { target: fallback, fallback, requiresCorrespondence: false };
}

export function workspaceFromCanonicalPath(pathname: string): ClubWorkspace {
  return parsedAppPath(pathname).appPath === "/host" || parsedAppPath(pathname).appPath.startsWith("/host/")
    ? "host"
    : "member";
}

export function candidateRoleSwitchTarget(input: RoleSwitchCandidateInput): RoleSwitchCandidate {
  const { clubSlug, appPath } = parsedAppPath(input.pathname);
  const safeClubSlug = clubSlug ?? "";
  const sourceWorkspace = workspaceFromCanonicalPath(input.pathname);
  const family = routeFamily(appPath, sourceWorkspace);
  const result = targetForRoleSwitch(safeClubSlug, sourceWorkspace, input.targetWorkspace, family, appPath);

  return {
    targetWorkspace: input.targetWorkspace,
    target: result.target,
    fallback: result.fallback,
    memberFallback: safeFallback(safeClubSlug, "member", family),
    requiresCorrespondence: result.requiresCorrespondence,
    navigation: input.transition === "authority-loss" ? "replace" : "push",
  };
}

function isSafeTargetForWorkspace(target: string, workspace: ClubWorkspace) {
  return workspaceFromCanonicalPath(target) === workspace && routeFamily(parsedAppPath(target).appPath, workspace) !== null;
}

function normalizedPathIdentity(target: string) {
  const pathname = target.split(/[?#]/, 1)[0] ?? "";
  const normalizedSegments = pathname.split("/").map((segment) => {
    try {
      return encodeURIComponent(decodeURIComponent(segment));
    } catch {
      return segment;
    }
  });
  const normalizedPathname = normalizedSegments.join("/").replace(/\/+$/, "");
  return normalizedPathname || "/";
}

export function resolveAuthorizedRoleSwitchTarget(input: {
  candidate: RoleSwitchCandidate;
  authorizedWorkspaces: ReadonlyArray<ClubWorkspace>;
  correspondence: "authorized" | "unavailable" | "unknown";
  lastSafeTarget: string | null;
}): string {
  const targetAuthorized = input.authorizedWorkspaces.includes(input.candidate.targetWorkspace);
  const candidateClubSlug = parsedAppPath(input.candidate.target).clubSlug;
  const lastTargetWorkspace = input.lastSafeTarget ? workspaceFromCanonicalPath(input.lastSafeTarget) : null;
  const lastSafeAndAuthorized =
    input.lastSafeTarget !== null &&
    parsedAppPath(input.lastSafeTarget).clubSlug === candidateClubSlug &&
    lastTargetWorkspace !== null &&
    input.authorizedWorkspaces.includes(lastTargetWorkspace) &&
    isSafeTargetForWorkspace(input.lastSafeTarget, lastTargetWorkspace);

  if (!targetAuthorized) {
    if (lastSafeAndAuthorized) return input.lastSafeTarget!;
    return input.authorizedWorkspaces.includes("member") ? input.candidate.memberFallback : input.candidate.fallback;
  }

  if (input.correspondence === "authorized" || (input.candidate.requiresCorrespondence && input.correspondence === "unknown")) {
    return input.candidate.target;
  }

  if (lastSafeAndAuthorized && lastTargetWorkspace === input.candidate.targetWorkspace) {
    return input.lastSafeTarget!;
  }

  if (!input.candidate.requiresCorrespondence && input.candidate.target !== input.candidate.fallback) {
    return input.candidate.target;
  }
  return input.candidate.fallback;
}

export function resolveUnavailableDetailTarget(input: {
  pathname: string;
  lastSafeTarget?: string | null;
}): string {
  const { clubSlug, appPath } = parsedAppPath(input.pathname);
  const workspace = workspaceFromCanonicalPath(input.pathname);
  const family = routeFamily(appPath, workspace);
  const safeClubSlug = clubSlug ?? "";
  const fallback = safeFallback(safeClubSlug, workspace, family);
  const suffix = workspace === "host" ? appPath.replace(/^\/host/, "") : appPath;
  const lastSafeTarget = input.lastSafeTarget ?? null;
  const nonFailingLastSafeTarget =
    lastSafeTarget !== null && normalizedPathIdentity(lastSafeTarget) !== normalizedPathIdentity(input.pathname)
      ? lastSafeTarget
      : null;

  return resolveAuthorizedRoleSwitchTarget({
    candidate: {
      targetWorkspace: workspace,
      target: pathForWorkspace(safeClubSlug, workspace, suffix),
      fallback,
      memberFallback: safeFallback(safeClubSlug, "member", family),
      requiresCorrespondence: true,
      navigation: "replace",
    },
    authorizedWorkspaces: [workspace],
    correspondence: "unavailable",
    lastSafeTarget: nonFailingLastSafeTarget,
  });
}

export function buildClubSwitchTarget(input: ClubSwitchInput): string {
  const sourceWorkspace = workspaceFromCanonicalPath(input.pathname);
  const family = routeFamily(parsedAppPath(input.pathname).appPath, sourceWorkspace);
  return safeFallback(input.targetClubSlug, input.targetWorkspace, family);
}

export function canonicalizeCompatibilityEntry(input: CompatibilityEntryInput): string {
  const appPath = /^\/app(?:\/|$)/.test(input.pathname) ? input.pathname : "/app";
  const search = input.search ?? "";
  const hash = input.hash ?? "";
  return `/clubs/${encodeURIComponent(input.currentClubSlug)}${appPath}${search}${hash}`;
}
