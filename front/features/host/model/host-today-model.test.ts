import { describe, expect, it } from "vitest";
import type { HostNotificationSummary } from "@/features/host/api/host-contracts";
import type { HostClubOperationsSnapshot } from "@/shared/model/club-operations";
import type { HostSessionLedgerItem } from "./host-session-ledger-model";
import { buildHostTodayView } from "./host-today-model";

const base = {
  today: "2026-09-01",
  now: "09:00",
  basePath: "/clubs/reading/app/host",
  meetings: [] as const,
  attention: null,
  operations: null,
  notifications: null,
};

function makeLedgerItem(sessionId: string, overrides: Partial<HostSessionLedgerItem> = {}): HostSessionLedgerItem {
  return {
    sessionId,
    sessionNumber: 1,
    title: `${sessionId} 모임`,
    bookTitle: `${sessionId} 책`,
    bookAuthor: "작가",
    bookImageUrl: null,
    date: "2026-08-20",
    startTime: "19:00",
    endTime: "21:00",
    locationLabel: "온라인",
    state: "CLOSED",
    visibility: "MEMBER",
    recordStatus: "INCOMPLETE",
    needsAttention: true,
    hasDraft: true,
    liveRevision: 1,
    draftRevision: 2,
    lastModifiedAt: "2026-08-20T00:00:00Z",
    ...overrides,
  };
}

function makeSnapshotWithBlockingReason(reason: string): HostClubOperationsSnapshot {
  return {
    schema: "host.club_operations_snapshot.v1",
    generatedAt: "2026-09-01T00:00:00Z",
    club: { clubId: "club-1", slug: "reading", name: "Reading Club" },
    readiness: {
      state: "BLOCKED",
      blockingReasons: [reason],
      nextAction: null,
    },
    sessionProgress: {
      upcomingCount: 0,
      currentOpenCount: 0,
      closedCount: 0,
      publishedRecordCount: 0,
      incompleteRecordCount: 0,
    },
    aiUsage: {
      activeJobs: 0,
      failedRecentJobs: 0,
      staleCandidates: 0,
      costEstimateUsd: "0.0000",
      state: "NO_RECENT_USAGE",
      priorFailedJobs7d: 0,
    },
  };
}

describe("buildHostTodayView", () => {
  it("returns an empty-queue line as data when nothing needs attention", () => {
    const view = buildHostTodayView(base);
    expect(view.queue.items).toEqual([]);
    expect(view.queue.emptyCheckedAtLabel).toBe("09:00");
  });

  it("maps needs-attention records into resolve rows capped at 7", () => {
    const items = Array.from({ length: 9 }, (_, i) => makeLedgerItem(`s${i}`));
    const view = buildHostTodayView({
      ...base,
      attention: { items, summary: { needsAttentionCount: 9, incompletePublishedCount: 0, draftCount: 0 } },
    });
    expect(view.queue.items).toHaveLength(7);
    expect(view.queue.totalCount).toBe(9);
    expect(view.queue.items[0]?.resolveLabel).not.toHaveLength(0);
  });

  it("promotes the meeting-day flag when the active meeting is today", () => {
    const view = buildHostTodayView({
      ...base,
      meetings: [{ sessionId: "s1", state: "OPEN", date: "2026-09-01" }],
    });
    expect(view.nextMeeting?.isMeetingDay).toBe(true);
  });

  it("surfaces notification failures and readiness blockers as queue rows", () => {
    const notifications: HostNotificationSummary = {
      pending: 0,
      failed: 2,
      dead: 0,
      sentLast24h: 5,
      latestFailures: [],
    };
    const view = buildHostTodayView({
      ...base,
      notifications,
      operations: makeSnapshotWithBlockingReason("다음 모임 없음"),
    });
    expect(view.queue.items.map((i) => i.kind)).toEqual(
      expect.arrayContaining(["notification", "readiness"]),
    );
  });
});
