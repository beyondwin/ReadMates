import { describe, expect, it } from "vitest";
import {
  attentionItems,
  hostSessionLedgerActionLabel,
  hostSessionLedgerBadges,
  hostSessionLedgerLastPublishLine,
  hostSessionLedgerModifiedAtLabel,
  isRecordLedgerWorkboxType,
  dedupeHostSessionLedgerItems,
  hostSessionTrashDeletedAtLabel,
  hostSessionTrashRemainingCopy,
  normalizeHostSessionLedgerFilters,
  toHostSessionLedgerSearch,
  type HostSessionLedgerItem,
} from "./host-session-ledger-model";

describe("host session ledger model", () => {
  it("normalizes URL filters and omits defaults from the canonical search", () => {
    const filters = normalizeHostSessionLedgerFilters(new URLSearchParams(
      "search=%20%20Moby%20Dick%20%20&state=INVALID&recordStatus=INCOMPLETE&needsAttention=true",
    ));

    expect(filters).toEqual({
      view: "active",
      search: "Moby Dick",
      state: null,
      recordStatus: "INCOMPLETE",
      needsAttention: true,
    });
    expect(toHostSessionLedgerSearch(filters)).toBe(
      "?search=Moby+Dick&recordStatus=INCOMPLETE&needsAttention=true",
    );
  });

  it("uses view=trash as the canonical trash URL and omits active filters", () => {
    const filters = normalizeHostSessionLedgerFilters(new URLSearchParams(
      "view=trash&search=Moby&state=OPEN&recordStatus=INCOMPLETE&needsAttention=true",
    ));

    expect(filters).toEqual({
      view: "trash",
      search: "",
      state: null,
      recordStatus: null,
      needsAttention: null,
    });
    expect(toHostSessionLedgerSearch(filters)).toBe("?view=trash");
    expect(toHostSessionLedgerSearch({
      view: "active",
      search: "",
      state: null,
      recordStatus: null,
      needsAttention: null,
    })).toBe("");
  });

  it("derives remaining-day copy from purgeAfter without deciding eligibility", () => {
    const now = new Date("2026-08-21T10:00:00Z");
    expect(hostSessionTrashRemainingCopy("2026-08-28T10:00:00Z", now)).toBe("남은 복원 기간 7일");
    expect(hostSessionTrashRemainingCopy("2026-08-21T12:00:00Z", now)).toBe("오늘까지 복원할 수 있습니다.");
    expect(hostSessionTrashRemainingCopy("2026-08-21T09:00:00Z", now)).toBe("남은 복원 기간이 없습니다.");
    expect(hostSessionTrashDeletedAtLabel("2026-08-21T10:00:00+09:00")).toBe("삭제 2026.08.21 10:00");
  });

  it("exposes explicit needs-attention, draft, and readiness badges", () => {
    expect(hostSessionLedgerBadges({
      recordStatus: "INCOMPLETE",
      needsAttention: true,
      hasDraft: true,
    })).toEqual([
      { label: "확인 필요", tone: "warn" },
      { label: "초안 있음", tone: "accent" },
      { label: "기록 미완료", tone: "default" },
    ]);
  });

  it("chooses status-aware actions and formats the last modified time", () => {
    expect(hostSessionLedgerActionLabel({
      hasDraft: true,
      recordStatus: "INCOMPLETE",
    })).toBe("마감실 열기");
    expect(hostSessionLedgerActionLabel({
      hasDraft: false,
      recordStatus: "INCOMPLETE",
    })).toBe("마감실 열기");
    expect(hostSessionLedgerActionLabel({
      hasDraft: false,
      recordStatus: "COMPLETE",
    })).toBe("기록 보기");
    expect(hostSessionLedgerActionLabel({
      hasDraft: false,
      recordStatus: "NOT_STARTED",
    })).toBe("마감 시작");
    expect(hostSessionLedgerModifiedAtLabel("2026-07-23T10:00:00+09:00"))
      .toBe("마지막 수정 2026.07.23 10:00");
    expect(hostSessionLedgerModifiedAtLabel(null)).toBe("수정 기록 없음");
  });

  it("returns attention page items without closed-only filtering or slicing", () => {
    const items: HostSessionLedgerItem[] = [
      ledgerItem("published-draft", "PUBLISHED", true),
      ledgerItem("published-incomplete", "PUBLISHED", false),
      ledgerItem("closed-draft", "CLOSED", true),
      ledgerItem("closed-incomplete", "CLOSED", false),
      ledgerItem("closed-later", "CLOSED", false),
    ];
    const page = {
      items,
      summary: {
        needsAttentionCount: 9,
        incompletePublishedCount: 2,
        draftCount: 3,
      },
    };

    expect(attentionItems(page)).toBe(items);
    expect(attentionItems(page).map((row) => row.state)).toEqual([
      "PUBLISHED",
      "PUBLISHED",
      "CLOSED",
      "CLOSED",
      "CLOSED",
    ]);
    expect(page.summary.needsAttentionCount).toBe(9);
  });

  it("builds the publish footer from the latest published lastModifiedAt and omits invented copy", () => {
    expect(hostSessionLedgerLastPublishLine([
      ledgerItem("closed", "CLOSED", true),
    ])).toBeNull();
    expect(hostSessionLedgerLastPublishLine([
      {
        ...ledgerItem("session-25", "PUBLISHED", false),
        sessionNumber: 25,
        lastModifiedAt: "2026-07-09T10:00:00+09:00",
      },
      {
        ...ledgerItem("session-26", "PUBLISHED", false),
        sessionNumber: 26,
        lastModifiedAt: "2026-07-30T10:00:00+09:00",
      },
    ])).toBe("7월 30일 · No. 26 기록 게시됨");
  });

  it("keeps only record-closing and notification-failure workbox kinds on the records rail", () => {
    expect(isRecordLedgerWorkboxType("RECORD_CLOSING")).toBe(true);
    expect(isRecordLedgerWorkboxType("NOTIFICATION_FAILURE")).toBe(true);
    expect(isRecordLedgerWorkboxType("SCHEDULE_UNSEEN")).toBe(false);
    expect(isRecordLedgerWorkboxType("MEMBER_APPROVAL")).toBe(false);
  });

  it("deduplicates exact session ids across opaque continuation pages while preserving first order", () => {
    const first = ledgerItem("session-1", "CLOSED", false);
    const duplicate = { ...first, title: "duplicate continuation" };
    const second = ledgerItem("session-2", "PUBLISHED", true);

    expect(dedupeHostSessionLedgerItems([first, duplicate, second])).toEqual([first, second]);
  });
});

function ledgerItem(
  sessionId: string,
  state: HostSessionLedgerItem["state"],
  hasDraft: boolean,
): HostSessionLedgerItem {
  return {
    sessionId,
    sessionNumber: 1,
    title: sessionId,
    bookTitle: sessionId,
    bookAuthor: "Author",
    bookImageUrl: null,
    date: "2026-05-01",
    startTime: "19:00",
    endTime: "21:00",
    locationLabel: "온라인",
    state,
    visibility: "MEMBER",
    recordStatus: hasDraft ? "INCOMPLETE" : "NOT_STARTED",
    needsAttention: true,
    hasDraft,
    liveRevision: 0,
    draftRevision: hasDraft ? 1 : null,
    lastModifiedAt: null,
  };
}
