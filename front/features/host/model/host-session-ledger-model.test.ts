import { describe, expect, it } from "vitest";
import {
  attentionItems,
  hostSessionLedgerActionLabel,
  hostSessionLedgerBadges,
  hostSessionLedgerModifiedAtLabel,
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
      search: "Moby Dick",
      state: null,
      recordStatus: "INCOMPLETE",
      needsAttention: true,
    });
    expect(toHostSessionLedgerSearch(filters)).toBe(
      "?search=Moby+Dick&recordStatus=INCOMPLETE&needsAttention=true",
    );
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
    })).toBe("초안 열기");
    expect(hostSessionLedgerActionLabel({
      hasDraft: false,
      recordStatus: "INCOMPLETE",
    })).toBe("이어서 수정");
    expect(hostSessionLedgerActionLabel({
      hasDraft: false,
      recordStatus: "COMPLETE",
    })).toBe("보기·수정");
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
