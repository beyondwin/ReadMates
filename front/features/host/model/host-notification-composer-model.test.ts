import { describe, expect, it } from "vitest";
import {
  buildComposerSelection,
  composerCanPreview,
  recommendedAudience,
} from "./host-notification-composer-model";

const contentRevision = "a".repeat(64);

describe("host notification composer model", () => {
  it("uses the event-specific recommended audience", () => {
    expect(recommendedAudience("NEXT_BOOK_PUBLISHED")).toBe("ALL_ACTIVE_MEMBERS");
    expect(recommendedAudience("FEEDBACK_DOCUMENT_PUBLISHED")).toBe("CONFIRMED_ATTENDEES");
    expect(recommendedAudience("SESSION_RECORD_UPDATED")).toBe("CONFIRMED_ATTENDEES");
    expect(buildComposerSelection({
      sessionId: "session-1",
      eventType: "SESSION_RECORD_UPDATED",
      contentRevision,
      recipientMode: "RECOMMENDED",
      requestedChannels: "BOTH",
      selectedMembershipIds: [],
    }).audience).toBe("CONFIRMED_ATTENDEES");
  });

  it("sorts selected membership IDs and keeps legacy adjustments empty", () => {
    expect(buildComposerSelection({
      sessionId: "session-1",
      eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
      contentRevision,
      recipientMode: "SELECTED_MEMBERS",
      requestedChannels: "EMAIL",
      selectedMembershipIds: ["member-c", "member-a", "member-b"],
    })).toEqual({
      sessionId: "session-1",
      eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
      contentRevision,
      audience: "SELECTED_MEMBERS",
      requestedChannels: "EMAIL",
      selectedMembershipIds: ["member-a", "member-b", "member-c"],
      excludedMembershipIds: [],
      includedMembershipIds: [],
      sendMode: "NOW",
    });
  });

  it("omits selected IDs outside selected-member mode", () => {
    expect(buildComposerSelection({
      sessionId: "session-1",
      eventType: "NEXT_BOOK_PUBLISHED",
      contentRevision,
      recipientMode: "ALL_ACTIVE_MEMBERS",
      requestedChannels: "IN_APP",
      selectedMembershipIds: ["member-a"],
    }).selectedMembershipIds).toEqual([]);
  });

  it("disables preview for an empty selected-member audience", () => {
    expect(composerCanPreview({
      sessionId: "session-1",
      eventType: "SESSION_RECORD_UPDATED",
      contentRevision,
      recipientMode: "SELECTED_MEMBERS",
      requestedChannels: "BOTH",
      selectedMembershipIds: [],
    })).toBe(false);
  });
});
