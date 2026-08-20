import { describe, expect, it } from "vitest";
import {
  meetingPhaseFromState,
  previousRecordAttentionHref,
  resolveActiveMeeting,
  type MeetingListItem,
} from "./host-meeting-ledger-model";

function item(partial: Partial<MeetingListItem> & Pick<MeetingListItem, "sessionId" | "state">): MeetingListItem {
  return {
    date: "2026-04-15",
    recordStatus: "NOT_STARTED",
    ...partial,
  };
}

describe("meetingPhaseFromState", () => {
  it.each([
    ["DRAFT", "before"],
    ["OPEN", "during"],
    ["CLOSED", "after"],
    ["PUBLISHED", "after"],
  ] as const)("maps %s to %s", (state, phase) => {
    expect(meetingPhaseFromState(state)).toBe(phase);
  });
});

describe("resolveActiveMeeting", () => {
  it("prefers the open meeting", () => {
    expect(resolveActiveMeeting([
      item({ sessionId: "draft-1", state: "DRAFT", date: "2026-06-11" }),
      item({ sessionId: "open-1", state: "OPEN", date: "2026-04-15" }),
      item({ sessionId: "closed-1", state: "CLOSED", date: "2026-03-18" }),
    ])).toEqual({ sessionId: "open-1", phase: "during" });
  });

  it("then prefers the nearest draft by date", () => {
    expect(resolveActiveMeeting([
      item({ sessionId: "later", state: "DRAFT", date: "2026-07-09" }),
      item({ sessionId: "sooner", state: "DRAFT", date: "2026-06-11" }),
      item({ sessionId: "closed-1", state: "CLOSED", date: "2026-04-15" }),
    ])).toEqual({ sessionId: "sooner", phase: "before" });
  });

  it("then prefers the most recent closed meeting", () => {
    expect(resolveActiveMeeting([
      item({ sessionId: "older", state: "CLOSED", date: "2026-01-21" }),
      item({ sessionId: "newer", state: "CLOSED", date: "2026-04-15" }),
    ])).toEqual({ sessionId: "newer", phase: "after" });
  });

  it("returns null when the club has no meetings", () => {
    expect(resolveActiveMeeting([])).toBeNull();
  });
});

describe("previousRecordAttentionHref", () => {
  it("points at the latest closed meeting when home shows a draft", () => {
    expect(previousRecordAttentionHref(
      { sessionId: "draft-1", phase: "before" },
      [
        item({ sessionId: "draft-1", state: "DRAFT", date: "2026-06-11", recordStatus: "NOT_STARTED" }),
        item({ sessionId: "closed-1", state: "CLOSED", date: "2026-04-15", recordStatus: "NOT_STARTED" }),
      ],
    )).toBe("/app/host/sessions/closed-1");
  });

  it("is null when the closed meeting already has a complete record", () => {
    expect(previousRecordAttentionHref(
      { sessionId: "draft-1", phase: "before" },
      [
        item({ sessionId: "draft-1", state: "DRAFT", date: "2026-06-11" }),
        item({ sessionId: "closed-1", state: "CLOSED", date: "2026-04-15", recordStatus: "COMPLETE" }),
      ],
    )).toBeNull();
  });
});
