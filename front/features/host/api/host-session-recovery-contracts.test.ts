import { describe, expect, it } from "vitest";
import {
  parseHostAttendanceResponse,
  parseHostSessionDetailResponse,
} from "./host-contracts";
import {
  HostSessionRestoreMutationEnvelopeSchema,
  parseHostSessionChangeReceipt,
  parseOptionalHostSessionChangeReceipt,
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
    scheduleRevision: 7,
    scheduleSeenAvailability: "AVAILABLE",
    scheduleSeenSummary: {
      currentCount: 1,
      staleCount: 0,
      unseenCount: 0,
      eligibleCount: 1,
    },
    versions: {
      sessionRevision: 3,
      scheduleRevision: 7,
      exposureRevision: 2,
      participantSetRevision: 4,
      recordDraftRevision: null,
      liveRecordRevision: null,
      publicationRevision: 1,
    },
    attendanceSnapshotId: "attendance-snapshot-4",
    attendees: [
      {
        membershipId: "membership-1",
        avatarKey: "banana-green-book",
        displayName: "멤버1",
        accountName: "안멤버1",
        rsvpStatus: "GOING",
        attendanceStatus: "UNKNOWN",
        participationStatus: "ACTIVE",
        attendanceRevision: 2,
        seenScheduleRevision: 7,
        scheduleSeenAt: "2026-07-22T12:00:00Z",
        scheduleSeenState: "CURRENT",
      },
    ],
    feedbackDocument: {
      uploaded: false,
      fileName: null,
      uploadedAt: null,
    },
    ...overrides,
  };
}

describe("host session recovery contracts", () => {
  it("rejects missing, extra, and wrong-domain restore expected revisions", () => {
    const valid = {
      idempotencyKey: "b6-restore-change-0001",
      expected: { sessionRevision: 3 },
      command: { expectedCurrentHash: "a".repeat(64) },
    };
    expect(HostSessionRestoreMutationEnvelopeSchema.safeParse(valid).success).toBe(true);
    expect(HostSessionRestoreMutationEnvelopeSchema.safeParse({
      ...valid,
      expected: {},
    }).success).toBe(false);
    expect(HostSessionRestoreMutationEnvelopeSchema.safeParse({
      ...valid,
      expected: { sessionRevision: 3, attendanceRevision: 2 },
    }).success).toBe(false);
    expect(HostSessionRestoreMutationEnvelopeSchema.safeParse({
      ...valid,
      expected: { publicationRevision: 3 },
    }).success).toBe(false);
  });

  it("parses a change receipt", () => {
    expect(parseHostSessionChangeReceipt(receipt)).toEqual(receipt);
  });

  it("reads an optional receipt from a partial mutation body without requiring full session detail", () => {
    expect(parseOptionalHostSessionChangeReceipt({
      changeReceipt: receipt,
    })).toEqual(receipt);
    expect(parseOptionalHostSessionChangeReceipt({
      title: "부분 응답",
    })).toBeNull();
    expect(parseOptionalHostSessionChangeReceipt({
      changeReceipt: null,
    })).toBeNull();
    expect(parseOptionalHostSessionChangeReceipt(null)).toBeNull();
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
