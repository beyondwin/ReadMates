export const HOST_SENSITIVE_RESOURCE_KINDS = [
  "meeting-form-draft",
  "record-draft",
  "ai-draft",
  "mutation-receipt",
  "reconciliation",
  "history",
  "notification-preview",
  "host-return-state",
] as const;

export type HostSensitiveResourceKind = (typeof HOST_SENSITIVE_RESOURCE_KINDS)[number];

export type HostSensitiveStateRegistration = {
  clubSlug: string;
  resourceKey: `${HostSensitiveResourceKind}${string}`;
  clear: () => void | Promise<void>;
};

export type HostSensitiveStorage = {
  register(input: HostSensitiveStateRegistration): () => void;
  clearClub(clubSlug: string): Promise<void>;
};

type BrowserStorages = {
  localStorage?: Storage | null;
  sessionStorage?: Storage | null;
};

function availableStorage(kind: "localStorage" | "sessionStorage"): Storage | null {
  try {
    return typeof window === "undefined" ? null : window[kind];
  } catch {
    return null;
  }
}

function clearPersistedClub(storage: Storage | null | undefined, clubSlug: string): void {
  if (!storage) return;
  const prefix = `readmates:host:${clubSlug}:`;
  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((key): key is string => typeof key === "string" && key.startsWith(prefix));
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Memory state and query caches are still purged when browser storage is unavailable.
  }
}

function isExactClubHostPath(value: unknown, clubSlug: string): boolean {
  if (typeof value !== "string") return false;
  const pathname = value.split(/[?#]/, 1)[0];
  return pathname.startsWith(`/clubs/${encodeURIComponent(clubSlug)}/app/host`);
}

function clearHostRouteContinuity(storage: Storage | null | undefined, clubSlug: string): void {
  if (!storage) return;
  try {
    const targetKey = "readmates:last-safe-workspace-target:host";
    if (isExactClubHostPath(storage.getItem(targetKey), clubSlug)) {
      storage.removeItem(targetKey);
    }

    const receiptKey = "readmates:committed-workspace-route";
    const rawReceipt = storage.getItem(receiptKey);
    if (!rawReceipt) return;
    const receipt = JSON.parse(rawReceipt) as {
      workspace?: unknown;
      clubScope?: unknown;
      href?: unknown;
      transitionSource?: { workspace?: unknown; clubScope?: unknown; href?: unknown } | null;
    };
    const matches = (route: typeof receipt | typeof receipt.transitionSource) =>
      route?.workspace === "host"
      && (route.clubScope === clubSlug || isExactClubHostPath(route.href, clubSlug));
    if (matches(receipt) || matches(receipt.transitionSource)) {
      storage.removeItem(receiptKey);
    }
  } catch {
    // Continuity state is optional and malformed values cannot block the purge.
  }
}

export function createHostSensitiveStorage(
  storages: BrowserStorages = {},
): HostSensitiveStorage {
  const registrations = new Map<string, Set<HostSensitiveStateRegistration>>();
  return {
    register(input) {
      const club = registrations.get(input.clubSlug) ?? new Set();
      club.add(input);
      registrations.set(input.clubSlug, club);
      return () => {
        club.delete(input);
        if (club.size === 0) registrations.delete(input.clubSlug);
      };
    },
    async clearClub(clubSlug) {
      const club = registrations.get(clubSlug);
      registrations.delete(clubSlug);
      if (club) {
        await Promise.allSettled(Array.from(club, ({ clear }) => Promise.resolve().then(clear)));
      }
      const localStorage = storages.localStorage ?? availableStorage("localStorage");
      const sessionStorage = storages.sessionStorage ?? availableStorage("sessionStorage");
      clearPersistedClub(localStorage, clubSlug);
      clearPersistedClub(sessionStorage, clubSlug);
      clearHostRouteContinuity(sessionStorage, clubSlug);
    },
  };
}

export const hostSensitiveStorage = createHostSensitiveStorage();

export function registerHostSensitiveState(
  input: HostSensitiveStateRegistration,
): () => void {
  return hostSensitiveStorage.register(input);
}
