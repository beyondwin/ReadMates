import { describe, expect, it } from "vitest";
import type { HostSessionListItem } from "@/features/host/api/host-contracts";
import type { HostSessionLedgerItem } from "./host-session-ledger-model";
import {
  buildHostMeetingTocSections,
  hostMeetingListBaseRefresh,
  hostListCursorRecovery,
  hostMeetingListNextCursor,
  hostMeetingListRows,
  type HostMeetingListState,
} from "./host-meeting-list-model";

const basePath = "/clubs/reading/app/host";

function item(
  sessionId: string,
  state: HostSessionListItem["state"],
  overrides: Partial<HostSessionListItem> = {},
): HostSessionListItem {
  return {
    sessionId,
    sessionNumber: 1,
    title: `${sessionId} 모임`,
    bookTitle: `${sessionId} 책`,
    bookAuthor: "작가",
    bookImageUrl: null,
    date: "2026-08-30",
    startTime: "19:00",
    endTime: "21:00",
    locationLabel: "온라인",
    state,
    visibility: "MEMBER",
    accessScope: "GUEST_READABLE",
    siteVisibility: "HIDDEN",
    recordStatus: "NOT_STARTED",
    needsAttention: false,
    hasDraft: false,
    liveRevision: 1,
    draftRevision: null,
    lastModifiedAt: null,
    ...overrides,
  };
}

function openItem(sessionNumber: number, overrides: Partial<HostSessionListItem> = {}): HostSessionListItem {
  return item(`open-${sessionNumber}`, "OPEN", {
    sessionNumber,
    bookTitle: `책 ${sessionNumber}`,
    title: `모임 ${sessionNumber}`,
    date: "2026-09-05",
    ...overrides,
  });
}

function closedItem(sessionNumber: number, overrides: Partial<HostSessionLedgerItem> = {}): HostSessionLedgerItem {
  return {
    ...item(`closed-${sessionNumber}`, "CLOSED", {
      sessionNumber,
      bookTitle: `책 ${sessionNumber}`,
      title: `모임 ${sessionNumber}`,
      date: "2026-08-15",
      recordStatus: "INCOMPLETE",
    }),
    ...overrides,
  };
}

describe("buildHostMeetingTocSections", () => {
  it("formats folio ordinals and lifecycle labels from the dictionary", () => {
    const sections = buildHostMeetingTocSections({
      basePath,
      upcomingItems: [openItem(25)],
      upcomingCursor: null,
      pastItems: [],
      pastCursor: null,
    });
    expect(sections.upcoming.rows[0]?.ordinalFolio).toBe("No.25");
    expect(sections.upcoming.rows[0]?.lifecycleLabel).toBe("준비 중");
    expect(sections.upcoming.rows[0]).toMatchObject({ date: "2026-09-05" });
  });

  it("deduplicates exact session ids within each server-backed section without reordering", () => {
    const first = openItem(25);
    const duplicate = { ...first, title: "중복된 다음 페이지 행" };
    const second = openItem(26);
    const sections = buildHostMeetingTocSections({
      basePath,
      upcomingItems: [first, duplicate, second],
      upcomingCursor: null,
      pastItems: [closedItem(24), closedItem(24)],
      pastCursor: null,
    });

    expect(sections.upcoming.rows.map((row) => row.id)).toEqual(["open-25", "open-26"]);
    expect(sections.upcoming.rows[0]?.title).toBe("책 25");
    expect(sections.past.rows.map((row) => row.id)).toEqual(["closed-24"]);
  });

  it("summarizes past rows with date only so the lifecycle chip is not doubled", () => {
    const sections = buildHostMeetingTocSections({
      basePath,
      upcomingItems: [],
      upcomingCursor: null,
      pastItems: [closedItem(24)],
      pastCursor: null,
    });
    expect(sections.past.rows[0]?.lifecycleLabel).toBe("기록 정리 중");
    expect(sections.past.rows[0]?.summary).toBe("08-15");
    expect(sections.past.rows[0]?.summary).not.toMatch(/기록 정리 중/);
  });

  it("uses location and book copy instead of invented response ratios", () => {
    const sections = buildHostMeetingTocSections({
      basePath,
      upcomingItems: [
        openItem(29, { locationLabel: "", bookTitle: "작별하지 않는다" }),
        openItem(30, { locationLabel: "서점", bookTitle: "" }),
        item("draft-31", "DRAFT", {
          sessionNumber: 31,
          bookTitle: "여름은 오래 그곳에 남아",
          locationLabel: "서점",
          date: "2026-10-13",
        }),
      ],
      upcomingCursor: null,
      pastItems: [closedItem(27, { hasDraft: true })],
      pastCursor: null,
    });
    expect(sections.upcoming.rows.map((row) => row.summary)).toEqual([
      "장소 확인 필요",
      "09-05 예정일",
      "책만 정해짐",
    ]);
    expect(sections.past.rows[0]?.summary).toBe("기록 초안 있음");
    expect(sections.upcoming.rows.some((row) => /\d+\/\d+/.test(row.summary))).toBe(false);
  });

  it("drops past rows that reuse an upcoming session id", () => {
    const sections = buildHostMeetingTocSections({
      basePath,
      upcomingItems: [openItem(28, { sessionId: "session-28" })],
      upcomingCursor: null,
      pastItems: [
        closedItem(28, { sessionId: "session-28" }),
        closedItem(27),
      ],
      pastCursor: null,
    });
    expect(sections.past.rows.map((row) => row.id)).toEqual(["closed-27"]);
    expect(sections.upcoming.rows[0]?.current).toBe(true);
  });

  it("carries attention as text, not color-only", () => {
    const itemWithAttention = { ...closedItem(24), needsAttention: true };
    const sections = buildHostMeetingTocSections({
      basePath,
      upcomingItems: [],
      upcomingCursor: null,
      pastItems: [itemWithAttention],
      pastCursor: null,
    });
    expect(sections.past.rows[0]?.attentionLabel).toBeTruthy();
  });
});

describe("hostMeetingListRows", () => {
  it("preserves server order without sorting rows across pages", () => {
    const source = [
      item("open-later", "OPEN", { sessionNumber: 9, date: "2026-09-10" }),
      item("draft-sooner", "DRAFT", { sessionNumber: 10, date: "2026-08-25" }),
      item("open-earlier", "OPEN", { sessionNumber: 8, date: "2026-08-20" }),
    ];

    expect(hostMeetingListRows(source).map((row) => row.id)).toEqual([
      "open-later",
      "draft-sooner",
      "open-earlier",
    ]);
  });

  it("links an active meeting directly to its work surface", () => {
    expect(hostMeetingListRows([item("open-1", "OPEN")])).toMatchObject([
      {
        lifecycleLabel: "준비 중",
        nextAction: { label: "모임 열기", href: "/app/host/sessions/open-1" },
      },
    ]);
  });
});

describe("hostListCursorRecovery", () => {
  it("clears accumulated pages and requests canonical replace, announcement, and heading focus", () => {
    const current: HostMeetingListState = {
      baseUpdatedAt: 10,
      appendedItems: [item("old", "OPEN")],
      nextCursor: "opaque-old-cursor",
      paginationStarted: true,
      announcement: null,
      focusHeadingRevision: 0,
      replaceHref: null,
    };

    expect(hostListCursorRecovery(current, "/clubs/reading-sai/app/host/sessions")).toEqual({
      baseUpdatedAt: 10,
      appendedItems: [],
      nextCursor: null,
      paginationStarted: false,
      announcement: "목록이 바뀌어 처음부터 다시 불러왔습니다.",
      focusHeadingRevision: 1,
      replaceHref: "/clubs/reading-sai/app/host/sessions",
    });
  });

  it("keeps an empty next page cursor without replaying the previous page", () => {
    const state: HostMeetingListState = {
      baseUpdatedAt: 10,
      appendedItems: [],
      nextCursor: "opaque-next",
      paginationStarted: true,
      announcement: null,
      focusHeadingRevision: 0,
      replaceHref: null,
    };

    expect(hostMeetingListNextCursor(state, "opaque-previous")).toBe("opaque-next");
  });

  it("drops accumulated pages when the authoritative first page refreshes", () => {
    const state: HostMeetingListState = {
      baseUpdatedAt: 10,
      appendedItems: [item("old-page", "OPEN")],
      nextCursor: "opaque-old-next",
      paginationStarted: true,
      announcement: "목록이 바뀌어 처음부터 다시 불러왔습니다.",
      focusHeadingRevision: 2,
      replaceHref: "/app/host/sessions",
    };

    expect(hostMeetingListBaseRefresh(state, 20, "opaque-new-next")).toEqual({
      baseUpdatedAt: 20,
      appendedItems: [],
      nextCursor: "opaque-new-next",
      paginationStarted: false,
      announcement: state.announcement,
      focusHeadingRevision: 2,
      replaceHref: state.replaceHref,
    });
  });
});
