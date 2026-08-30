import { describe, expect, it } from "vitest";
import type { HostSessionDetailResponse } from "../api/host-contracts";
import type { SessionClosingStatusInput } from "./session-closing-model";
import {
  buildHostOperatingRoomView,
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
    }))).toEqual([
      { id: "schedule-seen", numerator: 2, denominator: 4, value: "현재 일정 확인 2/4" },
      { id: "rsvp", numerator: 2, denominator: 4, value: "응답 2/4" },
      { id: "questions", numerator: 3, denominator: 4, value: "질문 작성 3/4 · 5개" },
      { id: "place", numerator: null, denominator: null, value: "작은 서재" },
    ]);
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

  it("uses 집계 준비 중 only for an absent or failed expected contract and reports each failure", () => {
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
    expect(view.partialFailures.map(({ source }) => source)).toEqual(["questions", "closing"]);
    expect(view.nextAction).toMatchObject({ state: "unknown", kind: "closing", workItemKey: null });
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

  it("chooses exactly one next action in the fixed attendance, schedule, RSVP, questions, place, closing order", () => {
    const base = input();
    expect(buildHostOperatingRoomView(base).nextAction.kind).toBe("attendance");

    const attendanceDone = session({
      attendees: session().attendees.map((row) => ({ ...row, attendanceStatus: row.membershipId === "member-2" ? "ABSENT" : "ATTENDED" })),
    });
    expect(buildHostOperatingRoomView(input({ currentMeeting: attendanceDone })).nextAction.kind).toBe("schedule-seen");

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
    })).nextAction).toMatchObject({ kind: "closing", label: "기록 패키지 검토" });
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
      { numerator: 2, denominator: 4, value: "현재 일정 확인 2/4" },
      { numerator: 0, denominator: 0, value: "응답 0/0" },
      { numerator: 0, denominator: 0, value: "질문 작성 0/0 · 0개" },
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
