import { describe, expect, it } from "vitest";
import {
  parseHostAttendanceResponse,
  parseHostSessionDetailResponse,
} from "./host-contracts";
import {
  parseHostSessionChangeReceipt,
  parseHostSessionHistoryRecovery,
  parseHostSessionRestorePreview,
  parseHostSessionRestoreRequest,
} from "./host-session-recovery-contracts";
import { parseHostSessionHistoryPage } from "./host-session-record-contracts";

const receipt = {
  changeId: "change-basic-1",
  kind: "BASIC_INFO" as const,
  undoAvailable: true,
};

function hostSessionDetail(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "session-7",
    sessionNumber: 7,
    title: "함께 읽기",
    bookTitle: "테스트 책",
    bookAuthor: "테스트 저자",
    bookLink: null,
    bookImageUrl: null,
    locationLabel: "온라인",
    meetingUrl: null,
    meetingPasscode: null,
    date: "2026-07-23",
    startTime: "19:00",
    endTime: "21:00",
    questionDeadlineAt: "2026-07-22T23:59:00+09:00",
    visibility: "MEMBER",
    publication: null,
    state: "OPEN",
    attendees: [],
    feedbackDocument: {
      uploaded: false,
      fileName: null,
      uploadedAt: null,
    },
    ...overrides,
  };
}

describe("host session recovery contracts", () => {
  it("parses a change receipt", () => {
    expect(parseHostSessionChangeReceipt(receipt)).toEqual(receipt);
  });

  it("parses optional receipts on session detail responses", () => {
    expect(parseHostSessionDetailResponse(hostSessionDetail()).changeReceipt).toBeUndefined();
    expect(parseHostSessionDetailResponse(hostSessionDetail({
      changeReceipt: receipt,
    })).changeReceipt).toEqual(receipt);
    expect(parseHostSessionDetailResponse(hostSessionDetail({
      changeReceipt: null,
    })).changeReceipt).toBeNull();
  });

  it("parses optional receipts on attendance responses", () => {
    expect(parseHostAttendanceResponse({
      sessionId: "session-7",
      count: 1,
    })).toEqual({
      sessionId: "session-7",
      count: 1,
    });
    expect(parseHostAttendanceResponse({
      sessionId: "session-7",
      count: 1,
      changeReceipt: {
        changeId: "change-attendance-1",
        kind: "ATTENDANCE",
        undoAvailable: true,
      },
    }).changeReceipt).toEqual({
      changeId: "change-attendance-1",
      kind: "ATTENDANCE",
      undoAvailable: true,
    });
  });

  it("parses a restore request body", () => {
    expect(parseHostSessionRestoreRequest({
      expectedCurrentHash: "a".repeat(64),
    })).toEqual({
      expectedCurrentHash: "a".repeat(64),
    });
  });

  it("parses a strict restore preview including redacted meeting credentials", () => {
    const preview = parseHostSessionRestorePreview({
      sessionId: "session-7",
      changeId: "change-basic-1",
      kind: "BASIC_INFO",
      expectedCurrentHash: "b".repeat(64),
      canRestore: true,
      blockedReason: null,
      items: [
        {
          field: "title",
          subjectId: null,
          currentValue: "새 제목",
          targetValue: "이전 제목",
          sensitive: false,
        },
        {
          field: "meetingUrl",
          subjectId: null,
          currentValue: null,
          targetValue: null,
          sensitive: true,
        },
        {
          field: "meetingPasscode",
          currentValue: null,
          targetValue: null,
          sensitive: true,
        },
      ],
    });

    expect(preview.items).toEqual([
      {
        field: "title",
        subjectId: null,
        currentValue: "새 제목",
        targetValue: "이전 제목",
        sensitive: false,
      },
      {
        field: "meetingUrl",
        subjectId: null,
        currentValue: null,
        targetValue: null,
        sensitive: true,
      },
      {
        field: "meetingPasscode",
        currentValue: null,
        targetValue: null,
        sensitive: true,
      },
    ]);
    expect(JSON.stringify(preview)).not.toContain("https://");
    expect(JSON.stringify(preview)).not.toContain("passcode");
  });

  it("rejects a restore preview that exposes extra fields", () => {
    expect(() => parseHostSessionRestorePreview({
      sessionId: "session-7",
      changeId: "change-basic-1",
      kind: "BASIC_INFO",
      expectedCurrentHash: "b".repeat(64),
      canRestore: true,
      blockedReason: null,
      items: [],
      secret: "leak",
    })).toThrow();
  });

  it("parses history recovery metadata without inferring it from type", () => {
    expect(parseHostSessionHistoryRecovery({
      action: "RESTORE_CHANGE",
      availability: "UNAVAILABLE",
      blockedReason: "SNAPSHOT_UNAVAILABLE",
    })).toEqual({
      action: "RESTORE_CHANGE",
      availability: "UNAVAILABLE",
      blockedReason: "SNAPSHOT_UNAVAILABLE",
    });

    const page = parseHostSessionHistoryPage({
      items: [{
        id: "history-1",
        type: "BASIC_INFO_UPDATED",
        createdAt: "2026-07-23T10:00:00+09:00",
        actorMembershipId: "membership-host",
        changedFields: ["title"],
        attendanceTransitions: [],
        revisionId: null,
        revisionVersion: null,
        revisionSource: null,
        restoredFromRevisionId: null,
        notificationEventId: null,
        recovery: {
          action: "RESTORE_CHANGE",
          availability: "AVAILABLE",
        },
      }],
      nextCursor: null,
    });
    expect(page.items[0]?.recovery).toEqual({
      action: "RESTORE_CHANGE",
      availability: "AVAILABLE",
    });
  });
});
