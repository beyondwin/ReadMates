import { describe, expect, it } from "vitest";
import type { ReturnTarget, SpaceIdentity } from "@/shared/model/global-space";
import {
  RETURN_TARGET_ROUTE_FAMILIES,
  createGlobalSpaceContinuityStore,
  globalSpaceReturnTargetStorageKey,
  sanitizeGlobalSpaceReturnTarget,
  type ReturnTargetValidationContext,
} from "./global-space-continuity";

const MEETING_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_MEETING_ID = "22222222-2222-4222-8222-222222222222";
const platform: SpaceIdentity = { productSpace: "platform" };
const member: SpaceIdentity = {
  productSpace: "clubs",
  clubId: "club-1",
  clubSlug: "reading-sai",
  perspective: "member",
};
const host: SpaceIdentity = { ...member, perspective: "host" };

const freshContext: ReturnTargetValidationContext = {
  projectionCurrent: true,
  loadedCaseIds: new Set(["case-1"]),
  authorizedClubIds: new Set(["club-1"]),
  availableFocusIds: new Set(["club-1", "case-1"]),
  noteSessionIds: new Set([MEETING_ID]),
  hostSessionIds: [MEETING_ID, OTHER_MEETING_ID],
};

function target(pathname: string, search = "", overrides: Partial<ReturnTarget> = {}): ReturnTarget {
  return { pathname, search, hash: "", focusId: null, scrollTop: 0, ...overrides };
}

const routeCases = [
  {
    family: "platform-today",
    identity: platform,
    input: target("/admin/today", "?view=mine&q=delivery&state=open,acknowledged&severity=critical&source=notification&assignee=me&case=case-1&mode=detail&cursor=opaque"),
    expected: target("/admin/today", "?view=mine&q=delivery&state=open%2Cacknowledged&severity=critical&source=notification&assignee=me&case=case-1&mode=detail"),
    duplicate: "?state=open&state=resolved",
    fallback: "/admin/today",
  },
  {
    family: "platform-clubs-list",
    identity: platform,
    input: target("/admin/clubs", "?search=alpha&lifecycle=ACTIVE&visibility=PRIVATE&domainStatus=ACTION_REQUIRED&onboardingState=MISSING&onboarding=1&focusId=club-1&scrollTop=240&cursor=opaque", { focusId: "club-1", scrollTop: 240 }),
    expected: target("/admin/clubs", "?search=alpha&lifecycle=ACTIVE&visibility=PRIVATE&domainStatus=ACTION_REQUIRED&onboardingState=MISSING&onboarding=1&focusId=club-1&scrollTop=240", { focusId: "club-1", scrollTop: 240 }),
    duplicate: "?visibility=PRIVATE&visibility=PUBLIC",
    fallback: "/admin/clubs",
  },
  {
    family: "platform-club-detail",
    identity: platform,
    input: target("/admin/clubs/club-1", "?returnTo=%2Fadmin%2Fclubs%3Fsearch%3Dalpha&focusId=club-1&scrollTop=240", { focusId: "club-1", scrollTop: 240 }),
    expected: target("/admin/clubs/club-1", "?returnTo=%2Fadmin%2Fclubs%3Fsearch%3Dalpha&focusId=club-1&scrollTop=240", { focusId: "club-1", scrollTop: 240 }),
    duplicate: "?returnTo=%2Fadmin%2Fclubs&returnTo=%2Fadmin%2Ftoday",
    fallback: "/admin/clubs",
  },
  {
    family: "platform-support",
    identity: platform,
    input: target("/admin/support", "?clubId=club-1&status=ACTIVE"),
    expected: target("/admin/support", "?clubId=club-1&status=ACTIVE"),
    duplicate: "?status=ACTIVE&status=EXPIRED",
    fallback: "/admin/support",
  },
  {
    family: "platform-notifications",
    identity: platform,
    input: target("/admin/notifications", "?focus=outbox_backlog&clubId=club-1"),
    expected: target("/admin/notifications", "?focus=outbox_backlog&clubId=club-1"),
    duplicate: "?focus=outbox_backlog&focus=notification_dispatch_success",
    fallback: "/admin/notifications",
  },
  {
    family: "platform-ai",
    identity: platform,
    input: target("/admin/ai-ops", "?errorCode=PROVIDER_TIMEOUT&clubId=club-1&jobId=job-1&window=30d&providerPayload=secret"),
    expected: target("/admin/ai-ops", "?errorCode=PROVIDER_TIMEOUT&clubId=club-1&jobId=job-1&window=30d"),
    duplicate: "?window=7d&window=90d",
    fallback: "/admin/ai-ops",
  },
  {
    family: "platform-audit",
    identity: platform,
    input: target("/admin/audit", "?range=30d&from=2026-08-01T00%3A00%3A00Z&to=2026-08-30T00%3A00%3A00Z&clubId=club-1&actorRole=OWNER&sourceSlice=S6&actionCategory=AI_OPS&outcome=FAILED&event=platform_audit_events%3Aevent-1&mode=detail&target=club-1&cursor=opaque"),
    expected: target("/admin/audit", "?range=30d&from=2026-08-01T00%3A00%3A00.000Z&to=2026-08-30T00%3A00%3A00.000Z&clubId=club-1&actorRole=OWNER&sourceSlice=S6&actionCategory=AI_OPS&outcome=FAILED&event=platform_audit_events%3Aevent-1&mode=detail&target=club-1"),
    duplicate: "?range=7d&range=30d",
    fallback: "/admin/audit",
  },
  {
    family: "platform-analytics",
    identity: platform,
    input: target("/admin/analytics", "?window=90d"),
    expected: target("/admin/analytics", "?window=90d"),
    duplicate: "?window=7d&window=30d",
    fallback: "/admin/analytics",
  },
  {
    family: "member-archive",
    identity: member,
    input: target("/clubs/reading-sai/app/archive", "?view=reviews&cursor=opaque"),
    expected: target("/clubs/reading-sai/app/archive", "?view=reviews"),
    duplicate: "?view=reviews&view=questions",
    fallback: "/clubs/reading-sai/app/archive",
  },
  {
    family: "member-notes",
    identity: member,
    input: target("/clubs/reading-sai/app/notes", `?filter=questions&sessionId=${MEETING_ID}&cursor=opaque`),
    expected: target("/clubs/reading-sai/app/notes", `?filter=questions&sessionId=${MEETING_ID}`),
    duplicate: "?filter=questions&filter=all",
    fallback: "/clubs/reading-sai/app/notes",
  },
  {
    family: "member-route-root",
    identity: member,
    input: target("/clubs/reading-sai/app/session/current"),
    expected: target("/clubs/reading-sai/app/session/current"),
    duplicate: "?unknown=1&unknown=2",
    fallback: "/clubs/reading-sai/app/session/current",
  },
  {
    family: "host-meeting-detail",
    identity: host,
    input: target(`/clubs/reading-sai/app/host/sessions/${MEETING_ID}`, "?section=records&source=ai"),
    expected: target(`/clubs/reading-sai/app/host/sessions/${MEETING_ID}`, "?section=records&source=ai"),
    duplicate: "?section=records&section=attendance",
    fallback: "/clubs/reading-sai/app/host/sessions",
  },
  {
    family: "host-session-ledger",
    identity: host,
    input: target("/clubs/reading-sai/app/host/sessions", "?view=active&search=next+book&recordStatus=INCOMPLETE&needsAttention=true&cursor=opaque"),
    expected: target("/clubs/reading-sai/app/host/sessions", "?search=next+book&recordStatus=INCOMPLETE&needsAttention=true"),
    duplicate: "?recordStatus=INCOMPLETE&recordStatus=COMPLETE",
    fallback: "/clubs/reading-sai/app/host/sessions",
  },
  {
    family: "host-notifications",
    identity: host,
    input: target("/clubs/reading-sai/app/host/notifications", `?sessionId=${MEETING_ID}&eventType=SESSION_REMINDER_DUE`),
    expected: target("/clubs/reading-sai/app/host/notifications", `?sessionId=${MEETING_ID}&eventType=SESSION_REMINDER_DUE`),
    duplicate: `?sessionId=${MEETING_ID}&sessionId=${OTHER_MEETING_ID}`,
    fallback: `/clubs/reading-sai/app/host/notifications?sessionId=${MEETING_ID}`,
  },
  {
    family: "host-route-root",
    identity: host,
    input: target("/clubs/reading-sai/app/host/members"),
    expected: target("/clubs/reading-sai/app/host/members"),
    duplicate: "?unknown=1&unknown=2",
    fallback: "/clubs/reading-sai/app/host/members",
  },
] as const;

describe("global space route-owned return-target registry", () => {
  it("exercises every registered route family with a positive contract", () => {
    expect(new Set(routeCases.map((entry) => entry.family))).toEqual(
      new Set(RETURN_TARGET_ROUTE_FAMILIES),
    );

    for (const entry of routeCases) {
      expect(
        sanitizeGlobalSpaceReturnTarget(entry.identity, entry.input, freshContext),
        entry.family,
      ).toEqual(entry.expected);
    }
  });

  it.each(routeCases)("rejects unknown keys for $family", ({ identity, input }) => {
    const unsafe = { ...input, search: `${input.search || "?"}${input.search ? "&" : ""}unknown=private` };
    expect(sanitizeGlobalSpaceReturnTarget(identity, unsafe, freshContext).search).not.toContain("unknown");
  });

  it.each(routeCases)("rejects duplicated evidence for $family", ({ identity, input, duplicate, fallback }) => {
    expect(
      sanitizeGlobalSpaceReturnTarget(identity, { ...input, search: duplicate }, freshContext).pathname,
    ).toBe(fallback.split("?", 1)[0]);
  });

  it.each(routeCases)("rejects cross-club targets for $family", ({ identity }) => {
    const crossClub = target("/clubs/other-club/app/host", "?clubId=club-2");
    const expected = identity.productSpace === "platform"
      ? "/admin/today"
      : identity.perspective === "host"
        ? "/clubs/reading-sai/app/host"
        : "/clubs/reading-sai/app";
    expect(sanitizeGlobalSpaceReturnTarget(identity, crossClub, freshContext).pathname).toBe(expected);
  });

  it.each(routeCases)("rejects oversized evidence for $family", ({ identity, input, fallback }) => {
    const oversized = { ...input, search: `?q=${"x".repeat(2_049)}` };
    expect(sanitizeGlobalSpaceReturnTarget(identity, oversized, freshContext).pathname).toBe(
      fallback.split("?", 1)[0],
    );
  });

  it.each(routeCases)("purges stale projection evidence for $family", ({ identity, input, fallback }) => {
    expect(
      sanitizeGlobalSpaceReturnTarget(identity, input, { ...freshContext, projectionCurrent: false }).pathname,
    ).toBe(fallback.split("?", 1)[0]);
  });

  it("rejects absolute targets and drops unnamed hash and stale focus", () => {
    expect(
      sanitizeGlobalSpaceReturnTarget(
        platform,
        target("https://evil.example/admin/today", "", { hash: "#secret", focusId: "missing", scrollTop: 10 }),
        freshContext,
      ),
    ).toEqual(target("/admin/today"));

    expect(
      sanitizeGlobalSpaceReturnTarget(
        platform,
        target("/admin/clubs", "?focusId=missing&scrollTop=10", { hash: "#row", focusId: "missing", scrollTop: 10 }),
        freshContext,
      ),
    ).toEqual(target("/admin/clubs", "?scrollTop=10", { scrollTop: 10 }));
  });

  it.each([
    ["?task=attendance", "?task=attendance"],
    ["?records=json", "?section=records&source=json"],
    ["?aigen=1", "?section=records&source=ai"],
  ])("preserves one valid host meeting evidence form and canonicalizes legacy state: %s", (search, expected) => {
    const pathname = `/clubs/reading-sai/app/host/sessions/${MEETING_ID}`;
    expect(sanitizeGlobalSpaceReturnTarget(host, target(pathname, search), freshContext)).toEqual(
      target(pathname, expected),
    );
  });

  it("rejects contradictory canonical and legacy host meeting evidence", () => {
    const pathname = `/clubs/reading-sai/app/host/sessions/${MEETING_ID}`;
    expect(
      sanitizeGlobalSpaceReturnTarget(host, target(pathname, "?section=attendance&aigen=1"), freshContext),
    ).toEqual(target("/clubs/reading-sai/app/host/sessions"));
  });
});

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("versioned global space continuity storage", () => {
  it("stores and restores the full target independently by club and perspective", () => {
    const storage = new MemoryStorage();
    const continuity = createGlobalSpaceContinuityStore(storage);
    const memberTarget = target("/clubs/reading-sai/app/archive", "?view=reviews", { focusId: "club-1", scrollTop: 400 });
    const hostTarget = target(`/clubs/reading-sai/app/host/sessions/${MEETING_ID}`, "?section=attendance");

    continuity.remember(member, memberTarget, freshContext);
    continuity.remember(host, hostTarget, freshContext);

    expect(continuity.read(member, freshContext)).toEqual(memberTarget);
    expect(continuity.read(host, freshContext)).toEqual(hostTarget);
    expect(storage.getItem(globalSpaceReturnTargetStorageKey(member))).not.toBe(
      storage.getItem(globalSpaceReturnTargetStorageKey(host)),
    );
  });

  it("serializes a ReturnTarget only and never transition, auth, request, or capsule state", () => {
    const storage = new MemoryStorage();
    const continuity = createGlobalSpaceContinuityStore(storage);
    continuity.remember(platform, target("/admin/today", "?case=case-1"), freshContext);

    const serialized = storage.getItem(globalSpaceReturnTargetStorageKey(platform));
    expect(JSON.parse(serialized ?? "null")).toEqual({
      pathname: "/admin/today",
      search: "?case=case-1",
      hash: "",
      focusId: null,
      scrollTop: 0,
    });
    expect(serialized).not.toMatch(/auth|pending|capsule|request|idempotency|receipt/i);
  });

  it("migrates a legacy pathname once without deleting the legacy key", () => {
    const storage = new MemoryStorage();
    storage.setItem("readmates:last-safe-workspace-target:member", "/clubs/reading-sai/app/archive");
    const continuity = createGlobalSpaceContinuityStore(storage);

    expect(continuity.read(member, freshContext)).toEqual(target("/clubs/reading-sai/app/archive"));
    storage.setItem("readmates:last-safe-workspace-target:member", "/clubs/reading-sai/app/notes");
    expect(continuity.read(member, freshContext)).toEqual(target("/clubs/reading-sai/app/archive"));
    expect(storage.getItem("readmates:last-safe-workspace-target:member")).toBe(
      "/clubs/reading-sai/app/notes",
    );
  });

  it("purges targets no longer present in the latest available-space projection", () => {
    const storage = new MemoryStorage();
    const continuity = createGlobalSpaceContinuityStore(storage);
    continuity.remember(member, target("/clubs/reading-sai/app/archive"), freshContext);
    continuity.remember(host, target("/clubs/reading-sai/app/host"), freshContext);

    continuity.purgeUnavailable([member]);

    expect(continuity.read(member, freshContext)).not.toBeNull();
    expect(storage.getItem(globalSpaceReturnTargetStorageKey(host))).toBeNull();
  });

  it("purges a stored target instead of restoring it through a stale projection", () => {
    const storage = new MemoryStorage();
    const continuity = createGlobalSpaceContinuityStore(storage);
    continuity.remember(member, target("/clubs/reading-sai/app/archive", "?view=reviews"), freshContext);

    expect(continuity.read(member, { ...freshContext, projectionCurrent: false })).toBeNull();
    expect(storage.getItem(globalSpaceReturnTargetStorageKey(member))).toBeNull();
  });
});
