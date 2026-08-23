import type {
  HostMeetingLocation,
  HostMeetingTask,
  HostSessionWorkspaceLocation,
  HostSessionWorkspacePanel,
} from "./host-session-workspace-model";

export type {
  HostMeetingLocation,
  HostMeetingTask,
  HostSessionWorkspaceLocation,
  HostSessionWorkspacePanel,
};

const HOST_MEETING_TASKS: readonly HostMeetingTask[] = [
  "overview",
  "responses",
  "attendance",
  "records",
  "notifications",
  "history",
];

const HOST_MEETING_RECORD_SOURCES: readonly HostMeetingLocation["recordSource"][] = [
  "manual",
  "ai",
  "json",
];

const HOST_MEETING_OWNED_QUERY_KEYS = [
  "task",
  "section",
  "source",
  "records",
  "aigen",
] as const;

type HostMeetingOwnedQueryKey = typeof HOST_MEETING_OWNED_QUERY_KEYS[number];

type HostMeetingOwnedQueryEvidence = Record<HostMeetingOwnedQueryKey, string | null>;

function overviewLocation(overviewEditOpen = false): HostMeetingLocation {
  return {
    task: "overview",
    overviewEditOpen,
    recordSource: "manual",
  };
}

export function parseHostMeetingLocation(search: string): HostMeetingLocation {
  const evidence = readOwnedQueryEvidence(search);
  if (!evidence || evidence.task !== null) return overviewLocation();

  const canonical = canonicalLocationFromEvidence(evidence);
  if (!canonical) return overviewLocation();

  const legacyLocations: HostMeetingLocation[] = [];
  if (evidence.records === "json") {
    legacyLocations.push(recordLocation("json"));
  }
  if (evidence.aigen === "1") {
    legacyLocations.push(recordLocation("ai"));
  }
  if (legacyLocations.some((legacy) => !sameMeetingLocation(legacy, canonical))) {
    return overviewLocation();
  }
  return canonical;
}

function canonicalLocationFromEvidence(
  evidence: HostMeetingOwnedQueryEvidence,
): HostMeetingLocation | null {
  if (evidence.section === null) {
    if (evidence.source !== null) return null;
    if (evidence.records === "json") return recordLocation("json");
    if (evidence.aigen === "1") return recordLocation("ai");
    return overviewLocation();
  }
  if (evidence.section === "basic") {
    return evidence.source === null ? overviewLocation(true) : null;
  }
  if (!isHostMeetingTask(evidence.section)) return null;
  if (evidence.section !== "records") {
    return evidence.source === null
      ? {
          task: evidence.section,
          overviewEditOpen: false,
          recordSource: "manual",
        }
      : null;
  }
  return recordLocation(evidence.source ?? "manual");
}

function recordLocation(
  recordSource: HostMeetingLocation["recordSource"],
): HostMeetingLocation {
  return {
    task: "records",
    overviewEditOpen: false,
    recordSource,
  };
}

function sameMeetingLocation(left: HostMeetingLocation, right: HostMeetingLocation): boolean {
  return left.task === right.task
    && left.overviewEditOpen === right.overviewEditOpen
    && left.recordSource === right.recordSource;
}

function readOwnedQueryEvidence(search: string): HostMeetingOwnedQueryEvidence | null {
  const evidence: HostMeetingOwnedQueryEvidence = {
    task: null,
    section: null,
    source: null,
    records: null,
    aigen: null,
  };
  const seen = new Set<HostMeetingOwnedQueryKey>();

  for (const [key, value] of new URLSearchParams(search)) {
    if (!isOwnedQueryKey(key)) continue;
    if (seen.has(key)) return null;
    seen.add(key);
    evidence[key] = value;
  }

  if (evidence.section !== null && !isHostMeetingSection(evidence.section)) return null;
  if (evidence.source !== null && !isHostMeetingRecordSource(evidence.source)) return null;
  if (evidence.records !== null && evidence.records !== "json") return null;
  if (evidence.aigen !== null && evidence.aigen !== "1") return null;
  return evidence;
}

function isOwnedQueryKey(value: string): value is HostMeetingOwnedQueryKey {
  return HOST_MEETING_OWNED_QUERY_KEYS.some((key) => key === value);
}

function isHostMeetingSection(value: string): boolean {
  return value === "basic" || isHostMeetingTask(value);
}

export function buildHostMeetingUrl(
  currentUrl: string | URL,
  next: HostMeetingLocation,
): string {
  const current = readRawAppHref(currentUrl);
  if (!current) return "/";

  const unrelatedTokens = current.query === null
    ? []
    : current.query.split("&").filter((token) => !isOwnedQueryToken(token));
  const canonicalTokens: string[] = [];

  if (next.task === "overview" && next.overviewEditOpen) {
    canonicalTokens.push("section=basic");
  } else if (next.task !== "overview") {
    canonicalTokens.push(`section=${next.task}`);
  }
  if (
    next.task === "records"
    && (next.recordSource === "ai" || next.recordSource === "json")
  ) {
    canonicalTokens.push(`source=${next.recordSource}`);
  }

  const tokens = [...unrelatedTokens, ...canonicalTokens];
  const query = tokens.length > 0 ? `?${tokens.join("&")}` : "";
  return `${current.pathname}${query}${current.hash}`;
}

type RawAppHref = {
  pathname: string;
  query: string | null;
  hash: string;
};

function readRawAppHref(currentUrl: string | URL): RawAppHref | null {
  if (currentUrl instanceof URL) {
    if (
      !isHttpProtocol(currentUrl.protocol)
      || currentUrl.username
      || currentUrl.password
    ) return null;
    return splitRawAppHref(`${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
  }
  if (containsUnsafeHrefCharacters(currentUrl)) return null;
  if (currentUrl.startsWith("/")) {
    if (currentUrl.startsWith("//")) return null;
    return splitRawAppHref(currentUrl);
  }

  const absolutePrefix = /^[A-Za-z][A-Za-z\d+.-]*:\/\//.exec(currentUrl);
  if (!absolutePrefix) return null;
  let parsed: URL;
  try {
    parsed = new URL(currentUrl);
  } catch {
    return null;
  }
  if (!isHttpProtocol(parsed.protocol) || parsed.username || parsed.password) return null;

  const authorityStart = absolutePrefix[0].length;
  const suffixStart = findAbsoluteSuffixStart(currentUrl, authorityStart);
  const suffix = suffixStart === -1 ? "/" : currentUrl.slice(suffixStart);
  return splitRawAppHref(suffix.startsWith("/") ? suffix : `/${suffix}`);
}

function splitRawAppHref(href: string): RawAppHref | null {
  const hashStart = href.indexOf("#");
  const hash = hashStart === -1 ? "" : href.slice(hashStart);
  const beforeHash = hashStart === -1 ? href : href.slice(0, hashStart);
  const queryStart = beforeHash.indexOf("?");
  const pathname = queryStart === -1 ? beforeHash : beforeHash.slice(0, queryStart);
  const query = queryStart === -1 ? null : beforeHash.slice(queryStart + 1);

  if (!pathname.startsWith("/") || pathname.startsWith("//")) return null;
  return { pathname, query, hash };
}

function findAbsoluteSuffixStart(value: string, authorityStart: number): number {
  for (let index = authorityStart; index < value.length; index += 1) {
    const character = value[index];
    if (character === "/" || character === "?" || character === "#") return index;
  }
  return -1;
}

function isHttpProtocol(protocol: string): boolean {
  return protocol === "http:" || protocol === "https:";
}

function containsUnsafeHrefCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (character === "\\" || codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

function isOwnedQueryToken(token: string): boolean {
  const equalsIndex = token.indexOf("=");
  const rawKey = equalsIndex === -1 ? token : token.slice(0, equalsIndex);
  let decodedKey: string;
  try {
    decodedKey = decodeURIComponent(rawKey.replace(/\+/g, " "));
  } catch {
    return false;
  }
  return isOwnedQueryKey(decodedKey);
}

function isHostMeetingTask(value: string): value is HostMeetingTask {
  return HOST_MEETING_TASKS.some((task) => task === value);
}

function isHostMeetingRecordSource(
  value: string,
): value is HostMeetingLocation["recordSource"] {
  return HOST_MEETING_RECORD_SOURCES.some((source) => source === value);
}

/** @deprecated Internal Task 5→8 compatibility only. */
export type HostSessionDraftSource = HostSessionWorkspaceLocation["source"];

/** @deprecated Internal Task 5→8 compatibility only. */
export function parseHostSessionWorkspaceLocation(search: string): HostSessionWorkspaceLocation {
  const evidence = readOwnedQueryEvidence(search);
  if (!evidence || evidence.task !== null) return compatibilityDefaultLocation();

  if (evidence.section !== null) {
    if (evidence.section === "overview") return compatibilityDefaultLocation();
    if (!isCompatibilityPanel(evidence.section)) return compatibilityDefaultLocation();
    if (evidence.section !== "records") {
      return { panel: evidence.section, source: "manual" };
    }
    return { panel: "records", source: evidence.source ?? "manual" };
  }
  if (evidence.aigen === "1") return { panel: "records", source: "ai" };
  if (evidence.records === "json") return { panel: "records", source: "json" };
  return compatibilityDefaultLocation();
}

function compatibilityDefaultLocation(): HostSessionWorkspaceLocation {
  return { panel: "focus", source: "manual" };
}

function isCompatibilityPanel(
  value: string,
): value is Exclude<HostSessionWorkspacePanel, "focus"> {
  return value === "basic"
    || value === "attendance"
    || value === "records"
    || value === "history";
}

/** @deprecated Internal Task 5→8 compatibility only. */
export function buildHostSessionWorkspaceUrl(
  currentUrl: string | URL,
  next: HostSessionWorkspaceLocation,
): string {
  return buildHostMeetingUrl(currentUrl, hostMeetingLocationFromCompatibility(next));
}

function hostMeetingLocationFromCompatibility(
  location: HostSessionWorkspaceLocation,
): HostMeetingLocation {
  if (location.panel === "focus") {
    return overviewLocation();
  }
  if (location.panel === "basic") {
    return overviewLocation(true);
  }
  return {
    task: location.panel,
    overviewEditOpen: false,
    recordSource: location.panel === "records" ? location.source : "manual",
  };
}
