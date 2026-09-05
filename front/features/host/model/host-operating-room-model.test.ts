import { describe, expect, it } from "vitest";
import type { HostSessionDetailResponse } from "../api/host-contracts";
import type { SessionClosingStatusInput } from "./session-closing-model";
import {
  buildClosingPhaseStatusRows,
  buildHostOperatingRoomView,
  buildLivePhaseStatusRows,
  type HostOperatingRoomInput,
  type HostOperatingRoomSource,
} from "./host-operating-room-model";

const TODAY = "2026-08-30";

function session(
  overrides: Partial<HostSessionDetailResponse> = {},
): HostSessionDetailResponse {
  return {
    sessionId: "session-12",
    sessionNumber: 12,
    title: "열두 번째 모임",
    bookTitle: "우리가 읽은 책",
    bookAuthor: "작가",
    bookLink: null,
    bookImageUrl: null,
    locationLabel: "작은 서재",
    meetingUrl: null,
    meetingPasscode: null,
    date: TODAY,
    startTime: "19:30",
    endTime: "21:30",
    questionDeadlineAt: "2026-08-29T23:59:00+09:00",
    visibility: "HOST_ONLY",
    publication: null,
    state: "OPEN",
    scheduleRevision: 3,
    scheduleSeenAvailability: "AVAILABLE",
    scheduleSeenSummary: {
      currentCount: 2,
      staleCount: 1,
      unseenCount: 1,
      eligibleCount: 4,
    },
    versions: {
      lifecycleRevision: 2,
      scheduleRevision: 3,
      contentRevision: 1,
      visibilityRevision: 1,
      attendanceSnapshotId: "attendance-snapshot-1",
      attendanceVersions: [],
    },
    attendanceSnapshotId: "attendance-snapshot-1",
    attendees: [
      attendee("member-1", "GOING", "ATTENDED", "CURRENT"),
      attendee("member-2", "DECLINED", "ABSENT", "CURRENT"),
      attendee("member-3", "NO_RESPONSE", "UNKNOWN", "STALE"),
      attendee("member-4", "NO_RESPONSE", "UNKNOWN", "UNSEEN"),
    ],
    feedbackDocument: { uploaded: false, fileName: null, uploadedAt: null },
    ...overrides,
  };
}

function withUnknownAttendance(
  meeting: HostSessionDetailResponse,
  unknownCount: number,
): HostSessionDetailResponse {
  const attendees = meeting.attendees.map((row, index) => ({
    ...row,
    attendanceStatus: (index < unknownCount ? "UNKNOWN" : "ATTENDED") as
      HostSessionDetailResponse["attendees"][number]["attendanceStatus"],
  }));
  while (attendees.length < unknownCount) {
    attendees.push(attendee(`member-u-${attendees.length + 1}`, "NO_RESPONSE", "UNKNOWN", "UNSEEN"));
  }
  return { ...meeting, attendees };
}

function attendee(
  membershipId: string,
  rsvpStatus: "NO_RESPONSE" | "GOING" | "MAYBE" | "DECLINED",
  attendanceStatus: "UNKNOWN" | "ATTENDED" | "ABSENT",
  scheduleSeenState: "CURRENT" | "STALE" | "UNSEEN",
): HostSessionDetailResponse["attendees"][number] {
  return {
    membershipId,
    avatarKey: "banana-green-book",
    displayName: membershipId,
    accountName: `${membershipId}-account`,
    rsvpStatus,
    attendanceStatus,
    participationStatus: "ACTIVE",
    attendanceRevision: 1,
    seenScheduleRevision: scheduleSeenState === "UNSEEN" ? null : scheduleSeenState === "CURRENT" ? 3 : 2,
    scheduleSeenAt: scheduleSeenState === "UNSEEN" ? null : "2026-08-29T12:00:00+09:00",
    scheduleSeenState,
  };
}

function closing(
  state: SessionClosingStatusInput["overall"]["state"],
  primaryAction: SessionClosingStatusInput["overall"]["primaryAction"],
): SessionClosingStatusInput {
  return {
    schema: "host.session_closing_status.v1",
    session: {
      sessionId: "session-12",
      sessionNumber: 12,
      bookTitle: "우리가 읽은 책",
      meetingDate: TODAY,
      state: state === "PUBLISHED" ? "PUBLISHED" : "CLOSED",
      recordVisibility: "HOST_ONLY",
    },
    overall: { state, label: `마감 ${state}`, primaryAction },
    checklist: [],
    evidence: {
      summaryPublished: state === "PUBLISHED",
      highlightCount: 0,
      oneLinerCount: 0,
      feedbackDocumentState: "MISSING",
      latestNotificationEvent: null,
      publicRecordHref: null,
      memberReflectionHref: null,
    },
  };
}

function ready<T>(data: T): HostOperatingRoomSource<T> {
  return { state: "ready", data };
}

function input(
  overrides: Partial<HostOperatingRoomInput> = {},
): HostOperatingRoomInput {
  return {
    currentMeeting: session(),
    requestedPhase: null,
    today: TODAY,
    basePath: "/clubs/book-club/app/host",
    questions: ready({ respondingMemberCount: 3, eligibleMemberCount: 4, questionCount: 5 }),
    closing: { state: "absent" },
    pendingOutcome: null,
    deferredWorkItemKeys: [],
    authoritativeWorkItems: [],
    ...overrides,
  };
}

describe("buildHostOperatingRoomView", () => {
  it("returns an empty operating room and one create action when the server selects no meeting", () => {
    const view = buildHostOperatingRoomView(input({ currentMeeting: null, questions: { state: "absent" } }));

    expect(view.meeting).toBeNull();
    expect(view.phases.map(({ id, availability }) => [id, availability])).toEqual([
      ["prep", "blocked"],
      ["live", "blocked"],
      ["closing", "blocked"],
    ]);
    expect(view.nextAction).toMatchObject({
      state: "actionable",
      workItemKey: null,
      label: "첫 모임 만들기",
      href: "/clubs/book-club/app/host/sessions/new",
    });
    expect(view.preparation).toEqual([]);
    expect(view.partialFailures).toEqual([]);
  });

  it.each([
    ["DRAFT before", "DRAFT", "2026-09-03", null, "prep", [["prep", "available"], ["live", "blocked"], ["closing", "blocked"]]],
    ["OPEN before", "OPEN", "2026-09-03", null, "prep", [["prep", "available"], ["live", "blocked"], ["closing", "blocked"]]],
    ["OPEN day-of", "OPEN", TODAY, null, "live", [["prep", "available"], ["live", "available"], ["closing", "blocked"]]],
    ["OPEN after", "OPEN", "2026-08-29", null, "live", [["prep", "available"], ["live", "available"], ["closing", "blocked"]]],
    ["CLOSED", "CLOSED", "2026-08-29", null, "closing", [["prep", "complete"], ["live", "complete"], ["closing", "available"]]],
    ["PUBLISHED", "PUBLISHED", "2026-08-29", null, "closing", [["prep", "complete"], ["live", "complete"], ["closing", "complete"]]],
  ] as const)("derives %s phase availability without rewriting lifecycle state", (_name, state, date, requestedPhase, phase, phases) => {
    const view = buildHostOperatingRoomView(input({
      currentMeeting: session({ state, date }),
      requestedPhase,
      closing: state === "CLOSED" || state === "PUBLISHED"
        ? ready(closing(state === "PUBLISHED" ? "PUBLISHED" : "READY", state === "PUBLISHED" ? "NONE" : "PUBLISH_RECORDS"))
        : { state: "absent" },
    }));

    expect(view.phase).toBe(phase);
    expect(view.phases.map(({ id, availability }) => [id, availability])).toEqual(phases);
  });

  it("normalizes invalid and unavailable requested phases while retaining completed phases as readable", () => {
    expect(buildHostOperatingRoomView(input({
      currentMeeting: session({ state: "OPEN", date: "2026-09-03" }),
      requestedPhase: "live",
    })).phase).toBe("prep");
    expect(buildHostOperatingRoomView(input({ requestedPhase: "unknown" })).phase).toBe("live");
    expect(buildHostOperatingRoomView(input({
      currentMeeting: session({ state: "CLOSED", date: "2026-08-29" }),
      requestedPhase: "prep",
      closing: ready(closing("READY", "PUBLISH_RECORDS")),
    })).phase).toBe("prep");
  });

  it("uses canonical schedule-seen counts and keeps RSVP, questions, and place as independent rows", () => {
    const view = buildHostOperatingRoomView(input());

    expect(view.preparation.map((row) => ({
      id: row.id,
      numerator: row.numerator,
      denominator: row.denominator,
      value: row.value,
      actionLabel: row.actionLabel,
    }))).toEqual([
      { id: "schedule-seen", numerator: 2, denominator: 4, value: "2 / 4", actionLabel: "멤버 보기" },
      { id: "rsvp", numerator: 2, denominator: 4, value: "2 / 4", actionLabel: "응답 보기" },
      { id: "questions", numerator: 3, denominator: 4, value: "3 / 4", actionLabel: "질문 보기" },
      { id: "place", numerator: null, denominator: null, value: "작은 서재", actionLabel: "정보 보기" },
    ]);
  });

  it("keeps the question count in detail and warns an incomplete member ratio", () => {
    const row = buildHostOperatingRoomView(input()).preparation.find(({ id }) => id === "questions");

    expect(row).toMatchObject({
      value: "3 / 4",
      detail: expect.stringContaining("5개"),
      state: "warning",
    });
    expect(row?.detail).not.toMatch(/질문 작성/);
    expect(row?.value).not.toContain("5개");
  });

  it("does not invent a schedule denominator or work item for an unpublished future draft", () => {
    const view = buildHostOperatingRoomView(input({
      currentMeeting: session({
        state: "DRAFT",
        date: "2026-09-03",
        scheduleSeenAvailability: "UNAVAILABLE",
        scheduleSeenSummary: { currentCount: null, staleCount: null, unseenCount: null, eligibleCount: null },
      }),
    }));
    const row = view.preparation.find(({ id }) => id === "schedule-seen");

    expect(row).toMatchObject({
      state: "unavailable",
      value: "아직 멤버에게 공개되지 않음",
      numerator: null,
      denominator: null,
      href: null,
      workItemKey: null,
    });
    expect(view.nextAction.kind).not.toBe("schedule-seen");
  });

  it("uses 집계 준비 중 for an absent questions contract without reporting it as a failure", () => {
    const view = buildHostOperatingRoomView(input({
      currentMeeting: session({ state: "CLOSED", date: "2026-08-29" }),
      questions: { state: "absent" },
      closing: { state: "failed", failure: { source: "closing", message: "마감 상태를 불러오지 못했습니다.", retryable: true } },
    }));

    expect(view.preparation.find(({ id }) => id === "questions")).toMatchObject({
      state: "unavailable",
      value: "집계 준비 중",
      numerator: null,
      denominator: null,
    });
    expect(view.partialFailures.map(({ source }) => source)).toEqual(["closing"]);
    expect(view.nextAction).toMatchObject({ state: "unknown", kind: "closing", workItemKey: null });
  });

  it("reports a failed questions contract", () => {
    const view = buildHostOperatingRoomView(input({
      questions: {
        state: "failed",
        failure: { source: "questions", message: "발제 질문 집계를 불러오지 못했습니다.", retryable: true },
      },
    }));

    expect(view.partialFailures.map(({ source }) => source)).toEqual(["questions"]);
    expect(view.preparation.find(({ id }) => id === "questions")?.state).toBe("unavailable");
  });

  it.each([
    ["conflict", { kind: "schedule-notification", state: "conflict", workItemKey: "receipt:1", label: "일정 안내 충돌 확인", reason: "최신 상태와 비교하세요.", href: "/review" }, "conflict", "schedule-notification"],
    ["unknown", { kind: "schedule-notification", state: "unknown", workItemKey: "receipt:1", label: "일정 안내 결과 확인", reason: "처리 결과를 재조정하세요.", href: "/review" }, "unknown", "schedule-notification"],
  ] as const)("puts a %s receipt outcome ahead of every domain action", (_name, pendingOutcome, expectedState, kind) => {
    expect(buildHostOperatingRoomView(input({ pendingOutcome })).nextAction).toMatchObject({
      state: expectedState,
      kind,
      workItemKey: "receipt:1",
    });
  });

  it("prefers attendance in live phase and yields sentence labels with a defer label", () => {
    const view = buildHostOperatingRoomView(input({
      requestedPhase: "live",
      currentMeeting: withUnknownAttendance(session(), 3),
    }));
    expect(view.nextAction.kind).toBe("attendance");
    expect(view.nextAction.label).toBe("아직 출석을 확인하지 않은 3명이 있어요");
    expect(view.nextAction.deferLabel).toBe("내일 09:00까지 보류");
  });

  it("keeps preparation next-action when live is available but the requested phase is prep", () => {
    const view = buildHostOperatingRoomView(input({
      requestedPhase: "prep",
      currentMeeting: withUnknownAttendance(session(), 3),
    }));
    expect(view.phase).toBe("prep");
    expect(view.nextAction.kind).toBe("schedule-seen");
    expect(view.nextAction.label).toBe("최신 일정을 아직 보지 않은 2명이 있어요");
    expect(view.nextAction.reason).toBe("대상과 문구를 확인한 뒤 직접 보내세요. 자동 발송하지 않아요.");
    expect(view.nextAction.deferLabel).toBe("내일 09:00까지 보류");
  });

  it("chooses exactly one next action in the fixed attendance, schedule, RSVP, questions, place, closing order", () => {
    const base = input();
    expect(buildHostOperatingRoomView(base).nextAction).toMatchObject({
      kind: "attendance",
      label: "아직 출석을 확인하지 않은 2명이 있어요",
      ctaLabel: "출석 확인 시작",
      reason: "참석 응답과 실제 출석은 별개로 기록해요.",
      deferLabel: "내일 09:00까지 보류",
    });

    const attendanceDone = session({
      attendees: session().attendees.map((row) => ({ ...row, attendanceStatus: row.membershipId === "member-2" ? "ABSENT" : "ATTENDED" })),
    });
    expect(buildHostOperatingRoomView(input({ currentMeeting: attendanceDone })).nextAction).toMatchObject({
      kind: "schedule-seen",
      label: "최신 일정을 아직 보지 않은 2명이 있어요",
      ctaLabel: "대상과 문구 검토",
      reason: "대상과 문구를 확인한 뒤 직접 보내세요. 자동 발송하지 않아요.",
      deferLabel: "내일 09:00까지 보류",
    });

    const scheduleDone = session({
      attendees: attendanceDone.attendees,
      scheduleSeenSummary: { currentCount: 4, staleCount: 0, unseenCount: 0, eligibleCount: 4 },
    });
    expect(buildHostOperatingRoomView(input({ currentMeeting: scheduleDone })).nextAction.kind).toBe("rsvp");

    const rsvpDone = session({
      scheduleSeenSummary: scheduleDone.scheduleSeenSummary,
      attendees: scheduleDone.attendees.map((row) => ({ ...row, rsvpStatus: "GOING" })),
    });
    expect(buildHostOperatingRoomView(input({
      currentMeeting: rsvpDone,
      questions: ready({ respondingMemberCount: 0, eligibleMemberCount: 4, questionCount: 0 }),
    })).nextAction.kind).toBe("questions");

    expect(buildHostOperatingRoomView(input({
      currentMeeting: rsvpDone,
      questions: ready({ respondingMemberCount: 4, eligibleMemberCount: 4, questionCount: 5 }),
    })).nextAction.kind).toBe("none");

    expect(buildHostOperatingRoomView(input({
      currentMeeting: session({ ...rsvpDone, locationLabel: "", meetingUrl: null }),
      questions: ready({ respondingMemberCount: 4, eligibleMemberCount: 4, questionCount: 5 }),
    })).nextAction.kind).toBe("place");

    expect(buildHostOperatingRoomView(input({
      currentMeeting: session({ ...rsvpDone, state: "CLOSED", date: "2026-08-29" }),
      questions: ready({ respondingMemberCount: 4, eligibleMemberCount: 4, questionCount: 5 }),
      closing: ready(closing("BLOCKED", "IMPORT_RECORDS")),
    })).nextAction).toMatchObject({
      kind: "closing",
      label: "기록 초안을 검토하면 멤버에게 게시할 수 있어요",
      ctaLabel: "기록 초안 검토",
      deferLabel: "내일 18:00까지 보류",
      href: "/clubs/book-club/app/host/records",
    });
  });

  it("carries a closing checklist note on an actionable next-action", () => {
    const status = closing("BLOCKED", "IMPORT_RECORDS");
    status.checklist = [{
      id: "FEEDBACK_DOCUMENT_READY",
      state: "ACTION_REQUIRED",
      label: "피드백 문서",
      detail: "게시 전에 피드백 문서를 확인해 주세요.",
      href: "/app/host/sessions/session-12?section=records",
    }];
    const view = buildHostOperatingRoomView(input({
      currentMeeting: session({ state: "CLOSED", date: "2026-08-29" }),
      closing: ready(status),
    }));
    expect(view.nextAction).toMatchObject({
      kind: "closing",
      state: "actionable",
      note: "게시 전에 피드백 문서를 확인해 주세요.",
    });
  });

  it("keeps unpublished schedule-seen copy on DRAFT only", () => {
    const draft = buildHostOperatingRoomView(input({
      currentMeeting: session({
        state: "DRAFT",
        date: "2026-09-03",
        scheduleSeenAvailability: "UNAVAILABLE",
        scheduleSeenSummary: { currentCount: null, staleCount: null, unseenCount: null, eligibleCount: null },
      }),
    }));
    expect(draft.preparation.find(({ id }) => id === "schedule-seen")).toMatchObject({
      value: "아직 멤버에게 공개되지 않음",
    });
    expect(draft.partialFailures).toEqual([]);

    const closedUnavailable = buildHostOperatingRoomView(input({
      currentMeeting: session({
        state: "CLOSED",
        date: "2026-08-29",
        scheduleSeenAvailability: "UNAVAILABLE",
        scheduleSeenSummary: {
          currentCount: null,
          staleCount: null,
          unseenCount: null,
          eligibleCount: null,
        },
      }),
      closing: ready(closing("IN_PROGRESS", "IMPORT_RECORDS")),
    }));
    expect(closedUnavailable.preparation.find(({ id }) => id === "schedule-seen")).toMatchObject({
      value: "집계 준비 중",
    });
    expect(closedUnavailable.partialFailures).toEqual([
      expect.objectContaining({ source: "schedule-seen", retryable: true }),
    ]);
    expect(closedUnavailable.nextAction.href).toBe("/clubs/book-club/app/host/records");
  });

  it("routes IMPORT_RECORDS closing next-action to host records, not the Korean label", () => {
    const importRecords = buildHostOperatingRoomView(input({
      currentMeeting: session({ state: "CLOSED", date: "2026-08-29" }),
      closing: ready(closing("BLOCKED", "IMPORT_RECORDS")),
    }));
    expect(importRecords.nextAction).toMatchObject({
      kind: "closing",
      href: "/clubs/book-club/app/host/records",
    });

    const publishRecords = buildHostOperatingRoomView(input({
      currentMeeting: session({ state: "CLOSED", date: "2026-08-29" }),
      closing: ready(closing("READY", "PUBLISH_RECORDS")),
    }));
    expect(publishRecords.nextAction.href).not.toBe("/clubs/book-club/app/host/records");
  });

  it("does not synthesize authority or defer from a locally predictable key", () => {
    const view = buildHostOperatingRoomView(input({
      deferredWorkItemKeys: ["ATTENDANCE:session-12:attendance-snapshot-1"],
    }));

    expect(view.nextAction).toMatchObject({
      state: "actionable",
      kind: "attendance",
      workItemKey: null,
    });
  });

  it("preserves an authoritative work-item key and state verbatim", () => {
    const view = buildHostOperatingRoomView(input({
      authoritativeWorkItems: [{
        kind: "attendance",
        workItemKey: "server/opaque:key:with exact bytes",
        state: "deferred",
      }],
    }));

    expect(view.nextAction).toMatchObject({
      state: "deferred",
      kind: "attendance",
      workItemKey: "server/opaque:key:with exact bytes",
    });
    expect(view.preparation.find(({ id }) => id === "schedule-seen")?.workItemKey).toBeNull();
  });

  it("preserves zero as measured data instead of calling it unavailable", () => {
    const view = buildHostOperatingRoomView(input({
      currentMeeting: session({ attendees: [] }),
      questions: ready({ respondingMemberCount: 0, eligibleMemberCount: 0, questionCount: 0 }),
    }));

    expect(view.preparation.slice(0, 3).map(({ numerator, denominator, value }) => ({ numerator, denominator, value }))).toEqual([
      { numerator: 2, denominator: 4, value: "2 / 4" },
      { numerator: 0, denominator: 0, value: "0 / 0" },
      { numerator: 0, denominator: 0, value: "0 / 0" },
    ]);
    expect(view.preparation.some(({ value }) => value === "집계 준비 중")).toBe(false);
  });

  it.each([
    ["BLOCKED", "IMPORT_RECORDS", "기록 패키지 검토"],
    ["READY", "PUBLISH_RECORDS", "기록 보기 범위 확인"],
    ["PUBLISHED", "NONE", "추가 조치 없음"],
  ] as const)("derives %s closing presentation from the canonical closing model", (state, action, label) => {
    const view = buildHostOperatingRoomView(input({
      currentMeeting: session({ state: state === "PUBLISHED" ? "PUBLISHED" : "CLOSED", date: "2026-08-29" }),
      closing: ready(closing(state, action)),
    }));

    expect(view.closing?.primaryAction.label).toBe(label);
  });

  it.each([
    ["IMPORT_RECORDS", "https://example.com/unused", "/clubs/book-club/app/host/sessions/session-12/edit?records=json"],
    ["SEND_NOTIFICATION", "https://example.com/unused", "/clubs/book-club/app/host/notifications"],
    ["REVIEW_PUBLIC_PAGE", "https://public.example.com/records/12", "https://public.example.com/records/12"],
    ["REVIEW_PUBLIC_PAGE", "/clubs/book-club/app/host/records/12", "/clubs/book-club/app/host/records/12"],
  ] as const)("normalizes only legacy closing hrefs for %s", (action, publicRecordHref, expectedHref) => {
    const status = closing(action === "REVIEW_PUBLIC_PAGE" ? "PUBLISHED" : "BLOCKED", action);
    status.evidence.publicRecordHref = publicRecordHref;
    const view = buildHostOperatingRoomView(input({
      currentMeeting: session({ state: "CLOSED", date: "2026-08-29" }),
      closing: ready(status),
    }));

    expect(view.closing?.primaryAction.href).toBe(expectedHref);
  });

  it("scopes legacy closing checklist and host-surface hrefs without rewriting member or public destinations", () => {
    const status = closing("BLOCKED", "IMPORT_RECORDS");
    status.checklist = [{
      id: "RECORD_PACKAGE_SAVED",
      state: "ACTION_REQUIRED",
      label: "기록 패키지",
      detail: "기록을 확인하세요.",
      href: "/app/host/sessions/session-12/edit?records=json",
    }];
    status.evidence.memberReflectionHref = "/clubs/book-club/app/member/sessions/session-12";
    status.evidence.publicRecordHref = "https://public.example.com/records/12";

    const view = buildHostOperatingRoomView(input({
      currentMeeting: session({ state: "CLOSED", date: "2026-08-29" }),
      closing: ready(status),
    }));

    expect(view.closing?.checklist[0]?.href).toBe(
      "/clubs/book-club/app/host/sessions/session-12/edit?records=json",
    );
    expect(view.closing?.surfaces).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "HOST",
        href: "/clubs/book-club/app/host/sessions/session-12/edit",
      }),
      expect.objectContaining({
        id: "MEMBER",
        href: "/clubs/book-club/app/member/sessions/session-12",
      }),
      expect.objectContaining({
        id: "PUBLIC",
        href: "https://public.example.com/records/12",
      }),
    ]));
  });
});

describe("operating-room phase status rows", () => {
  it("keeps actual attendance separate from RSVP in the live ledger", () => {
    const rows = buildLivePhaseStatusRows(session(), "/clubs/book-club/app/host");

    expect(rows.map(({ label }) => label)).toEqual(["실제 출석", "참석 응답", "진행 순서", "현장 메모"]);
    expect(rows[0]).toMatchObject({
      value: "1 / 4",
      detail: "참석 1 · 알린 불참 1 · 확인 필요 2",
      action: "출석 보기",
      href: "/clubs/book-club/app/host/sessions/session-12?section=attendance",
      tone: "warn",
    });
    expect(rows[1]).toMatchObject({
      value: "2 / 4",
      detail: "참석 1 · 불참 1 · 미응답 2",
      action: "응답 보기",
      tone: "warn",
    });
    expect(rows[2]).toMatchObject({ value: "확인 전", tone: "muted" });
    expect(rows[3]?.detail).toBe("호스트만 볼 수 있어요");
    expect(rows[3]?.tone).toBe("muted");
  });

  it("maps the closing checklist into the approved 마감 현황 composition", () => {
    const view = buildHostOperatingRoomView(input({
      currentMeeting: session({ state: "CLOSED", date: "2026-08-29" }),
      closing: ready({
        ...closing("IN_PROGRESS", "IMPORT_RECORDS"),
        checklist: [
          { id: "SESSION_CLOSED", state: "DONE", label: "모임 종료", detail: "출석이 확정되었습니다.", href: null },
          {
            id: "RECORD_PACKAGE_SAVED",
            state: "ACTION_REQUIRED",
            label: "기록 패키지",
            detail: "정리본을 검토하세요.",
            href: "/app/host/sessions/session-12?section=records",
          },
        ],
      }),
    }));

    expect(view.closing).not.toBeNull();
    const rows = buildClosingPhaseStatusRows(view.closing!);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "출석 확정",
        value: "완료",
        action: "출석 보기",
        tone: "ok",
      }),
      expect.objectContaining({
        label: "기록 초안",
        value: "조치 필요",
        detail: "정리본을 검토하세요.",
        action: "초안 열기",
        href: "/clubs/book-club/app/host/sessions/session-12?section=records",
        tone: "warn",
      }),
    ]));
  });
});
