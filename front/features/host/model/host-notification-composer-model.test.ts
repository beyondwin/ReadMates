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
      scheduleRevision: 7,
      subject: "기록 수정 안내",
      body: "수정된 기록을 확인해 주세요.",
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
      scheduleRevision: 7,
      subject: "피드백 문서 안내",
      body: "피드백 문서를 확인해 주세요.",
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
      scheduleRevision: 7,
      subject: "피드백 문서 안내",
      body: "피드백 문서를 확인해 주세요.",
    });
  });

  it("omits selected IDs outside selected-member mode", () => {
    expect(buildComposerSelection({
      sessionId: "session-1",
      eventType: "NEXT_BOOK_PUBLISHED",
      contentRevision,
      scheduleRevision: 7,
      subject: "다음 책 안내",
      body: "다음 책을 확인해 주세요.",
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
      scheduleRevision: 7,
      subject: "기록 수정 안내",
      body: "수정된 기록을 확인해 주세요.",
      recipientMode: "SELECTED_MEMBERS",
      requestedChannels: "BOTH",
      selectedMembershipIds: [],
    })).toBe(false);
  });

  it("binds exact editable copy and schedule revision and rejects invalid copy", () => {
    const validDraft = {
      sessionId: "session-1",
      eventType: "SESSION_RECORD_UPDATED" as const,
      contentRevision,
      scheduleRevision: 7,
      subject: "호스트가 고친 제목",
      body: "첫 줄\n둘째 줄",
      recipientMode: "RECOMMENDED" as const,
      requestedChannels: "BOTH" as const,
      selectedMembershipIds: [],
    };

    expect(composerCanPreview(validDraft)).toBe(true);
    expect(buildComposerSelection(validDraft)).toEqual(expect.objectContaining({
      scheduleRevision: 7,
      subject: "호스트가 고친 제목",
      body: "첫 줄\n둘째 줄",
    }));
    expect(composerCanPreview({ ...validDraft, subject: "   " })).toBe(false);
    expect(composerCanPreview({ ...validDraft, body: "" })).toBe(false);
    expect(composerCanPreview({ ...validDraft, subject: "가".repeat(201) })).toBe(false);
    expect(composerCanPreview({ ...validDraft, body: "나".repeat(4_001) })).toBe(false);
  });
});
