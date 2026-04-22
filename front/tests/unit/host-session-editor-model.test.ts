import { describe, expect, it } from "vitest";
import {
  buildHostSessionRequest,
  buildPublicationRequest,
  defaultBookLink,
  defaultHostSessionFormValues,
  getDestructiveActionAvailability,
  hydrateHostSessionFormValues,
  initialAttendanceStatuses,
  initialFeedbackDocumentStatus,
  initialPublicationMode,
  initialPublicationSummary,
  questionDeadlineIsoFromSessionDate,
  questionDeadlineLabelForForm,
  questionDeadlineLabelFromIso,
  questionDeadlineLabelFromSessionDate,
  type HostSessionEditorSession,
  type HostSessionFormValues,
} from "@/features/host/model/host-session-editor-model";

const session: HostSessionEditorSession = {
  sessionId: "session-1",
  sessionNumber: 1,
  title: "1회차 모임 · 팩트풀니스",
  bookTitle: "팩트풀니스",
  bookAuthor: "한스 로슬링",
  bookLink: "https://example.com/books/factfulness",
  bookImageUrl: null,
  locationLabel: "온라인",
  meetingUrl: "https://meet.google.com/readmates-factfulness",
  meetingPasscode: null,
  date: "2025-11-26",
  startTime: "19:15",
  questionDeadlineAt: "2025-11-25T14:59:00Z",
  publication: {
    publicSummary: "저장된 공개 요약입니다.",
    isPublic: false,
  },
  state: "OPEN",
  attendees: [
    { membershipId: "membership-host", attendanceStatus: "ATTENDED" },
    { membershipId: "membership-member", attendanceStatus: "UNKNOWN" },
  ],
  feedbackDocument: {
    uploaded: true,
    fileName: "251126 1차.md",
    uploadedAt: "2026-04-20T09:00:00Z",
  },
};

const formValues: HostSessionFormValues = {
  title: "7회차 모임 · 새 책",
  bookTitle: "새 책",
  bookAuthor: "새 저자",
  bookLink: "https://example.com/books/new-book",
  bookImageUrl: "https://example.com/covers/new-book.jpg",
  locationLabel: "온라인",
  meetingUrl: "https://meet.google.com/readmates-new",
  meetingPasscode: "new",
  date: "2026-05-20",
  startTime: "20:00",
};

describe("host session editor model", () => {
  it("builds new session defaults from the next third Wednesday", () => {
    expect(defaultHostSessionFormValues(new Date(2026, 3, 21))).toEqual({
      title: "7회차 모임 · ",
      bookTitle: "",
      bookAuthor: "",
      bookLink: defaultBookLink,
      bookImageUrl: "",
      locationLabel: "온라인",
      meetingUrl: "",
      meetingPasscode: "",
      date: "2026-05-20",
      startTime: "20:00",
    });
    expect(initialPublicationMode(null)).toBe("internal");
    expect(initialPublicationSummary(null)).toBe("");
    expect(initialFeedbackDocumentStatus(null)).toEqual({ uploaded: false, fileName: null, uploadedAt: null });
  });

  it("hydrates edit-session form and side-panel helpers from session detail", () => {
    expect(hydrateHostSessionFormValues(session)).toEqual({
      title: "1회차 모임 · 팩트풀니스",
      bookTitle: "팩트풀니스",
      bookAuthor: "한스 로슬링",
      bookLink: "https://example.com/books/factfulness",
      bookImageUrl: "",
      locationLabel: "온라인",
      meetingUrl: "https://meet.google.com/readmates-factfulness",
      meetingPasscode: "",
      date: "2025-11-26",
      startTime: "19:15",
    });
    expect(initialPublicationMode(session)).toBe("draft");
    expect(initialPublicationSummary(session)).toBe("저장된 공개 요약입니다.");
    expect(initialAttendanceStatuses(session.attendees)).toEqual({
      "membership-host": "ATTENDED",
      "membership-member": "UNKNOWN",
    });
    expect(initialFeedbackDocumentStatus(session)).toEqual({
      uploaded: true,
      fileName: "251126 1차.md",
      uploadedAt: "2026-04-20T09:00:00Z",
    });
    expect(getDestructiveActionAvailability(session)).toEqual({
      canDelete: true,
      guidance: "세션과 관련 준비 기록이 모두 제거됩니다. 되돌릴 수 없습니다.",
    });
  });

  it("normalizes optional URL and passcode fields when building requests", () => {
    expect(
      buildHostSessionRequest({
        ...formValues,
        bookLink: "  https://example.com/books/trimmed  ",
        bookImageUrl: "  https://example.com/covers/trimmed.jpg  ",
        meetingUrl: "  https://meet.google.com/trimmed  ",
        meetingPasscode: "  trimmed  ",
      }),
    ).toEqual({
      ...formValues,
      bookLink: "https://example.com/books/trimmed",
      bookImageUrl: "https://example.com/covers/trimmed.jpg",
      meetingUrl: "https://meet.google.com/trimmed",
      meetingPasscode: "trimmed",
      questionDeadlineAt: "2026-05-19T23:59:00+09:00",
    });
    expect(buildPublicationRequest("  공개 요약입니다.  ", "public")).toEqual({
      publicSummary: "공개 요약입니다.",
      isPublic: true,
    });
    expect(buildPublicationRequest("   ", "draft")).toBeNull();
  });

  it("preserves deadline defaults and existing-session deadline semantics", () => {
    expect(questionDeadlineIsoFromSessionDate("2026-05-20")).toBe("2026-05-19T23:59:00+09:00");
    expect(questionDeadlineLabelFromSessionDate("2026-05-20")).toBe("05-19 23:59까지 질문 제출");
    expect(questionDeadlineLabelFromIso("2025-11-25T14:59:00Z")).toBe("11-25 23:59까지 질문 제출");
    expect(questionDeadlineLabelForForm(session, "2025-11-26")).toBe("11-25 23:59까지 질문 제출");
    expect(questionDeadlineLabelForForm(session, "2026-05-20")).toBe("05-19 23:59까지 질문 제출");
    expect(buildHostSessionRequest(formValues, { date: "2026-05-20" })).toEqual(formValues);
    expect(buildHostSessionRequest(formValues, { date: "2026-05-13" })).toEqual({
      ...formValues,
      questionDeadlineAt: "2026-05-19T23:59:00+09:00",
    });
  });

  it("handles invalid schedule values without creating a deadline", () => {
    const invalidValues = {
      ...formValues,
      date: "2026-02-31",
    };

    expect(questionDeadlineIsoFromSessionDate("not-a-date")).toBeNull();
    expect(questionDeadlineIsoFromSessionDate("2026-02-31")).toBeNull();
    expect(questionDeadlineLabelFromSessionDate("2026-02-31")).toBe("");
    expect(questionDeadlineLabelForForm(session, "not-a-date")).toBe("");
    expect(buildHostSessionRequest(invalidValues)).toEqual(invalidValues);
    expect(getDestructiveActionAvailability({ state: "CLOSED" })).toEqual({
      canDelete: false,
      guidance: "닫히거나 공개된 세션은 삭제할 수 없습니다.",
    });
  });
});
