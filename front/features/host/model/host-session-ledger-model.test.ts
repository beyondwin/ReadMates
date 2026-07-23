import { describe, expect, it } from "vitest";
import {
  hostSessionLedgerBadges,
  normalizeHostSessionLedgerFilters,
  toHostSessionLedgerSearch,
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
});
