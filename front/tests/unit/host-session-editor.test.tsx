import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import HostSessionEditor, { type HostSessionEditorActions } from "@/features/host/components/host-session-editor";
import {
  buildHostSessionRequest,
  defaultSessionDateFrom,
} from "@/features/host/components/host-session-schedule";
import type {
  FeedbackDocumentResponse,
  HostSessionDeletionPreviewResponse,
  HostSessionDetailResponse,
} from "@/features/host/api/host-contracts";
import {
  feedbackDocumentContractFixture,
  hostSessionDetailContractFixture,
} from "./api-contract-fixtures";

const retiredPersonalFeedbackReportLabel = ["개인 피드백", "리포트"].join(" ");

const jsonHeaders = () => new Headers({ "Content-Type": "application/json" });

type JsonResponse<T> = Response & { json(): Promise<T> };

const hostSessionEditorTestActions = {
  loadDeletionPreview: (sessionId) =>
    fetch(`/api/bff/api/host/sessions/${encodeURIComponent(sessionId)}/deletion-preview`, {
      method: "GET",
      headers: jsonHeaders(),
      cache: "no-store",
    }) as Promise<Response & { json(): Promise<HostSessionDeletionPreviewResponse> }>,
  deleteSession: (sessionId) =>
    fetch(`/api/bff/api/host/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      headers: jsonHeaders(),
      cache: "no-store",
    }),
  closeSession: (sessionId) =>
    fetch(`/api/bff/api/host/sessions/${encodeURIComponent(sessionId)}/close`, {
      method: "POST",
    }) as Promise<JsonResponse<HostSessionDetailResponse>>,
  publishSession: (sessionId) =>
    fetch(`/api/bff/api/host/sessions/${encodeURIComponent(sessionId)}/publish`, {
      method: "POST",
    }) as Promise<JsonResponse<HostSessionDetailResponse>>,
  saveSession: (sessionId, request) =>
    fetch(
      sessionId === null
        ? "/api/bff/api/host/sessions"
        : `/api/bff/api/host/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: sessionId === null ? "POST" : "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify(request),
        cache: "no-store",
      },
    ),
  savePublication: (sessionId, request) =>
    fetch(`/api/bff/api/host/sessions/${encodeURIComponent(sessionId)}/publication`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify(request),
      cache: "no-store",
    }),
  updateAttendance: (sessionId, attendance) =>
    fetch(`/api/bff/api/host/sessions/${encodeURIComponent(sessionId)}/attendance`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(attendance),
      cache: "no-store",
    }),
  uploadFeedbackDocument: (sessionId, formData) =>
    fetch(`/api/bff/api/host/sessions/${encodeURIComponent(sessionId)}/feedback-document`, {
      method: "POST",
      body: formData,
      cache: "no-store",
    }) as Promise<Response & { json(): Promise<FeedbackDocumentResponse> }>,
} satisfies HostSessionEditorActions;

type HostSessionEditorProps = Parameters<typeof HostSessionEditor>[0];

function HostSessionEditorForTest({
  actions,
  ...props
}: Omit<HostSessionEditorProps, "actions"> & { actions?: HostSessionEditorActions }) {
  return <HostSessionEditor {...props} actions={actions ?? hostSessionEditorTestActions} />;
}

type DeferredFetchResponse = {
  ok: boolean;
};

function deferredFetchResponse() {
  let resolve!: (response: DeferredFetchResponse) => void;
  const promise = new Promise<DeferredFetchResponse>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

const session: HostSessionDetailResponse = hostSessionDetailContractFixture;

const openSession: HostSessionDetailResponse = {
  ...session,
  sessionId: "open-session-7",
  sessionNumber: 7,
  title: "7회차 모임 · 테스트 책",
  bookTitle: "테스트 책",
  state: "OPEN",
};

const deletionPreview: HostSessionDeletionPreviewResponse = {
  sessionId: "open-session-7",
  sessionNumber: 7,
  title: "7회차 모임 · 테스트 책",
  state: "OPEN",
  canDelete: true,
  counts: {
    participants: 6,
    rsvpResponses: 2,
    questions: 4,
    checkins: 3,
    oneLineReviews: 1,
    longReviews: 1,
    highlights: 0,
    publications: 0,
    feedbackReports: 7,
    feedbackDocuments: 8,
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("HostSessionEditor", () => {
  it("calculates the default session date as today", () => {
    expect(defaultSessionDateFrom(new Date(2026, 3, 21))).toBe("2026-04-21");
    expect(defaultSessionDateFrom(new Date(2026, 4, 20))).toBe("2026-05-20");
    expect(defaultSessionDateFrom(new Date(2026, 4, 21))).toBe("2026-05-21");
    expect(defaultSessionDateFrom(new Date(2026, 11, 17))).toBe("2026-12-17");
  });

  it("builds host session payloads without changing deadline semantics", () => {
    const values = {
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

    expect(buildHostSessionRequest(values)).toEqual({
      ...values,
      questionDeadlineAt: "2026-05-19T23:59:00+09:00",
    });
    expect(buildHostSessionRequest(values, { date: "2026-05-20" })).toEqual(values);
    expect(buildHostSessionRequest(values, { date: "2026-05-13" })).toEqual({
      ...values,
      questionDeadlineAt: "2026-05-19T23:59:00+09:00",
    });
  });

  it("labels new session creation separately from current session editing", () => {
    render(<HostSessionEditorForTest session={null} />);

    expect(screen.getByRole("heading", { name: "새 세션 만들기" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "운영으로" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "새 세션 만들기" })).toBeVisible();
    expect(screen.queryByRole("link", { name: /운영 대시보드/ })).not.toBeInTheDocument();
    const bookAndSessionPanel = screen.getByRole("heading", { name: "읽을 책" }).closest("section");
    expect(bookAndSessionPanel).not.toBeNull();
    expect(within(bookAndSessionPanel as HTMLElement).getByText("도서 정보")).toBeVisible();
    expect(screen.getByText("세션 기본 정보는 새 세션 만들기 버튼으로 저장하고, 기록 공개 범위와 피드백 문서는 각 섹션에서 따로 저장합니다.")).toBeVisible();
    expect(screen.queryByText("이번 세션 편집")).not.toBeInTheDocument();
  });

  it("shows helpful hints for the new-session title and book fields", () => {
    render(<HostSessionEditorForTest session={null} />);

    expect(screen.getByLabelText("세션 제목")).toHaveAttribute(
      "placeholder",
      "예: 8회차 모임 · 물고기는 존재하지 않는다",
    );
    expect(screen.getByLabelText("책 제목")).toHaveAttribute("placeholder", "예: 물고기는 존재하지 않는다");
    expect(screen.getByLabelText("저자")).toHaveAttribute("placeholder", "예: 룰루 밀러");
  });

  it("labels existing open session as current session editing", () => {
    render(<HostSessionEditorForTest session={openSession} />);

    expect(screen.getByRole("heading", { name: "이번 세션 편집" })).toBeVisible();
    expect(screen.getByText("No.07")).toBeVisible();
    expect(screen.getByText("이번 세션")).toBeVisible();
    expect(screen.getByText("세션 기본 정보는 변경 사항 저장 버튼으로 저장하고, 기록 공개 범위와 피드백 문서는 각 섹션에서 따로 저장합니다.")).toBeVisible();
  });

  it("switches the mobile editor between basic, publish, attendance, and feedback document contexts", async () => {
    const user = userEvent.setup();
    const { container } = render(<HostSessionEditorForTest session={session} />);

    const segments = screen.getByTestId("host-editor-mobile-segments");
    const basic = screen.getByRole("tab", { name: "기본" });
    const publish = screen.getByRole("tab", { name: "공개" });
    const attendance = screen.getByRole("tab", { name: "출석" });
    const report = screen.getByRole("tab", { name: "문서" });
    const basicPanels = Array.from(container.querySelectorAll('[data-mobile-editor-section="basic"]'));
    const publishPanel = container.querySelector('[data-mobile-editor-section="publish"]');

    expect(segments).toHaveAttribute("role", "tablist");
    expect(Array.from(segments.querySelectorAll('[role="tab"]')).map((button) => button.textContent)).toEqual([
      "기본",
      "공개",
      "출석",
      "문서",
    ]);
    expect(basic).toHaveAttribute("aria-selected", "true");
    expect(basic).toHaveAttribute("aria-controls", "host-editor-panel-basic-info host-editor-panel-basic-schedule");
    expect(basic).toHaveStyle({
      minHeight: "32px",
      height: "32px",
      padding: "0 14px",
      fontSize: "13px",
      borderColor: "var(--text)",
      background: "var(--text)",
      color: "var(--bg)",
    });
    expect(publish).toHaveStyle({
      minHeight: "32px",
      height: "32px",
      padding: "0 14px",
      fontSize: "13px",
      borderColor: "var(--line)",
      background: "transparent",
      color: "var(--text-2)",
    });
    expect(basicPanels).toHaveLength(2);
    basicPanels.forEach((panel) => {
      expect(panel).toHaveAttribute("role", "tabpanel");
      expect(panel).toHaveAttribute("aria-labelledby", "host-editor-tab-basic");
      expect(panel).toHaveClass("is-mobile-active");
    });
    expect(basicPanels.map((panel) => panel.id)).toEqual(["host-editor-panel-basic-info", "host-editor-panel-basic-schedule"]);
    expect(publishPanel).not.toHaveClass("is-mobile-active");

    await user.click(publish);
    expect(publish).toHaveAttribute("aria-selected", "true");
    basicPanels.forEach((panel) => expect(panel).not.toHaveClass("is-mobile-active"));
    expect(publishPanel).toHaveClass("is-mobile-active");

    await user.click(attendance);
    expect(attendance).toHaveAttribute("aria-selected", "true");
    expect(container.querySelector('[data-mobile-editor-section="attendance"]')).toHaveClass("is-mobile-active");

    await user.click(report);
    expect(report).toHaveAttribute("aria-selected", "true");
    expect(container.querySelector('[data-mobile-editor-section="report"]')).toHaveClass("is-mobile-active");
  });

  it("supports keyboard selection in the mobile editor tablist", async () => {
    const user = userEvent.setup();
    render(<HostSessionEditorForTest session={session} />);

    const basic = screen.getByRole("tab", { name: "기본" });
    const publish = screen.getByRole("tab", { name: "공개" });
    const report = screen.getByRole("tab", { name: "문서" });

    basic.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(publish).toHaveFocus());
    expect(publish).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{End}");
    await waitFor(() => expect(report).toHaveFocus());
    expect(report).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Home}");
    await waitFor(() => expect(basic).toHaveFocus());
    expect(basic).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowLeft}");
    await waitFor(() => expect(report).toHaveFocus());
    expect(report).toHaveAttribute("aria-selected", "true");
  });

  it("shows a new-session empty message instead of static attendance and feedback document controls", () => {
    render(<HostSessionEditorForTest />);

    expect(screen.getAllByText("세션을 만든 뒤 참석과 피드백 문서를 관리할 수 있습니다.")).toHaveLength(2);
    expect(screen.queryByText("HTML 파일을 드래그하거나 클릭해 업로드")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "파일 선택" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "에디터에서 작성" })).not.toBeInTheDocument();
    expect(screen.queryByText("이멤버14")).not.toBeInTheDocument();
    expect(screen.queryByText("feedback-14-sample-member.html")).not.toBeInTheDocument();
  });

  it("automatically derives the question deadline from the selected meeting date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 21, 12));
    render(<HostSessionEditorForTest />);
    vi.useRealTimers();

    const user = userEvent.setup();
    expect(screen.getByLabelText("모임 날짜")).toHaveValue("2026-04-21");
    expect(screen.getByLabelText("시작 시간")).toHaveValue("20:00");
    expect(screen.getByLabelText("질문 제출 마감")).toHaveValue("04-20 23:59까지 질문 제출");

    await user.clear(screen.getByLabelText("시작 시간"));
    await user.type(screen.getByLabelText("시작 시간"), "18:45");

    expect(screen.getByLabelText("질문 제출 마감")).toHaveValue("04-20 23:59까지 질문 제출");

    await user.clear(screen.getByLabelText("모임 날짜"));
    await user.type(screen.getByLabelText("모임 날짜"), "2026-01-01");

    expect(screen.getByLabelText("질문 제출 마감")).toHaveValue("12-31 23:59까지 질문 제출");
  });

  it("renders attendance and the session feedback document from the host session detail API payload", () => {
    render(<HostSessionEditorForTest session={session} />);

    expect(screen.getAllByText("우")).not.toHaveLength(0);
    expect(screen.getByText("피드백 문서")).toBeInTheDocument();
    expect(screen.getByLabelText("피드백 문서 파일")).toHaveAttribute("accept", ".md,.txt");
    expect(screen.getByText("업로드 완료")).toBeInTheDocument();
    expect(screen.getByText("251126 1차.md")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "미리보기" })).toHaveAttribute("href", "/app/feedback/session-1");
    expect(screen.queryByRole("link", { name: "운영으로" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "교체" })).toBeInTheDocument();
    expect(screen.queryByText(`${retiredPersonalFeedbackReportLabel} (HTML)`)).not.toBeInTheDocument();
    expect(screen.queryByText("HTML 파일을 드래그하거나 클릭해 업로드")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "우 리포트 열기 준비중" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "수 리포트 업로드 준비중" })).not.toBeInTheDocument();
    expect(screen.queryByText("이멤버14")).not.toBeInTheDocument();
    expect(screen.queryByText("feedback-14-sample-member.html")).not.toBeInTheDocument();
  });

  it("shows persisted book and neutral meeting fields", () => {
    render(<HostSessionEditorForTest session={session} />);

    expect(screen.getByLabelText("책 링크")).toHaveValue("https://example.com/books/factfulness");
    expect(screen.getByLabelText("책 이미지 URL")).toHaveValue(
      "https://image.aladin.co.kr/product/34538/43/cover500/8934933879_1.jpg",
    );
    expect(screen.getByRole("img", { name: "팩트풀니스 표지" })).toBeInTheDocument();
    expect(screen.getByLabelText("장소")).toHaveValue("온라인");
    expect(screen.getByLabelText("미팅 URL")).toHaveValue("https://meet.google.com/readmates-factfulness");
    expect(screen.getByLabelText("Passcode · 선택")).toHaveValue("fact");
    expect(screen.queryByLabelText("장소 / 미팅 링크")).not.toBeInTheDocument();
  });

  it("shows existing-session empty states when attendees are empty and no feedback document is uploaded", () => {
    render(
      <HostSessionEditorForTest
        session={{
          ...session,
          attendees: [],
          feedbackDocument: {
            uploaded: false,
            fileName: null,
            uploadedAt: null,
          },
        }}
      />,
    );

    expect(screen.getByText("아직 참석 대상자가 없습니다.")).toBeInTheDocument();
    expect(screen.getAllByText("미등록").length).toBeGreaterThan(0);
    expect(screen.queryByText("등록된 리포트 대상자가 없습니다.")).not.toBeInTheDocument();
  });

  it("uploads the selected feedback document and updates status from the backend response", async () => {
    const uploaded: FeedbackDocumentResponse = {
      ...feedbackDocumentContractFixture,
      subtitle: "팩트풀니스",
      fileName: "server-normalized-feedback.md",
      uploadedAt: "2026-04-20T12:00:00Z",
      metadata: [],
      observerNotes: [],
      participants: [],
    };
    const json = vi.fn().mockResolvedValue(uploaded);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HostSessionEditorForTest session={{ ...session, feedbackDocument: { uploaded: false, fileName: null, uploadedAt: null } }} />);

    const input = screen.getByLabelText("피드백 문서 파일") as HTMLInputElement;
    const file = new File(["# 독서모임 1차 피드백"], "local-draft.md", { type: "text/markdown" });
    await user.upload(input, file);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/sessions/session-1/feedback-document", expect.objectContaining({
      cache: "no-store",
      method: "POST",
      body: expect.any(FormData),
    }));

    const body = fetchMock.mock.calls[0]?.[1]?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("file")).toBe(file);
    await waitFor(() => expect(screen.getByText("server-normalized-feedback.md")).toBeInTheDocument());
    expect(json).toHaveBeenCalled();
    expect(screen.queryByText("local-draft.md")).not.toBeInTheDocument();
    expect(input.value).toBe("");
  });

  it("shows the upload failure toast when the feedback document request rejects", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network failed"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HostSessionEditorForTest session={{ ...session, feedbackDocument: { uploaded: false, fileName: null, uploadedAt: null } }} />);

    const file = new File(["# 독서모임 1차 피드백"], "retry.md", { type: "text/markdown" });
    await user.upload(screen.getByLabelText("피드백 문서 파일"), file);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("피드백 문서 업로드에 실패했습니다"));
  });

  it("posts a new session through the BFF and redirects to the created session editor", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessionId: "created-session-8" }),
    });
    const location = { href: "" };
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", location);
    const user = userEvent.setup();

    render(<HostSessionEditorForTest />);

    await user.clear(screen.getByLabelText("세션 제목"));
    await user.type(screen.getByLabelText("세션 제목"), "7회차 모임 · 새 책");
    await user.type(screen.getByLabelText("책 제목"), "새 책");
    await user.type(screen.getByLabelText("저자"), "새 저자");
    await user.clear(screen.getByLabelText("모임 날짜"));
    await user.type(screen.getByLabelText("모임 날짜"), "2026-05-20");
    await user.clear(screen.getByLabelText("시작 시간"));
    await user.type(screen.getByLabelText("시작 시간"), "19:30");
    await user.click(screen.getByRole("button", { name: "새 세션 만들기" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/sessions", expect.objectContaining({
        cache: "no-store",
        method: "POST",
        body: JSON.stringify({
          title: "7회차 모임 · 새 책",
          bookTitle: "새 책",
          bookAuthor: "새 저자",
          bookLink: "",
          bookImageUrl: "",
          locationLabel: "온라인",
          meetingUrl: "",
          meetingPasscode: "",
          date: "2026-05-20",
          startTime: "19:30",
          questionDeadlineAt: "2026-05-19T23:59:00+09:00",
        }),
      })),
    );
    expect(location.href).toBe("/app/host/sessions/created-session-8/edit");
  });

  it("posts custom book and meeting fields from the new-session editor", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessionId: "created-session-8" }),
    });
    const location = { href: "" };
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", location);
    const user = userEvent.setup();

    render(<HostSessionEditorForTest />);

    await user.clear(screen.getByLabelText("세션 제목"));
    await user.type(screen.getByLabelText("세션 제목"), "7회차 모임 · 커스텀 책");
    await user.type(screen.getByLabelText("책 제목"), "커스텀 책");
    await user.type(screen.getByLabelText("저자"), "커스텀 저자");
    await user.clear(screen.getByLabelText("책 링크"));
    await user.type(screen.getByLabelText("책 링크"), "https://example.com/books/custom-book");
    await user.type(screen.getByLabelText("책 이미지 URL"), "https://example.com/covers/custom-book.jpg");
    await user.clear(screen.getByLabelText("모임 날짜"));
    await user.type(screen.getByLabelText("모임 날짜"), "2026-05-20");
    await user.clear(screen.getByLabelText("장소"));
    await user.type(screen.getByLabelText("장소"), "성수 스터디룸");
    await user.type(screen.getByLabelText("미팅 URL"), "https://meet.google.com/readmates-custom");
    await user.type(screen.getByLabelText("Passcode · 선택"), "custom");
    await user.click(screen.getByRole("button", { name: "새 세션 만들기" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/sessions", expect.objectContaining({
        cache: "no-store",
        method: "POST",
        body: JSON.stringify({
          title: "7회차 모임 · 커스텀 책",
          bookTitle: "커스텀 책",
          bookAuthor: "커스텀 저자",
          bookLink: "https://example.com/books/custom-book",
          bookImageUrl: "https://example.com/covers/custom-book.jpg",
          locationLabel: "성수 스터디룸",
          meetingUrl: "https://meet.google.com/readmates-custom",
          meetingPasscode: "custom",
          date: "2026-05-20",
          startTime: "20:00",
          questionDeadlineAt: "2026-05-19T23:59:00+09:00",
        }),
      })),
    );
    expect(location.href).toBe("/app/host/sessions/created-session-8/edit");
  });

  it("patches the existing session with the persisted non-default start time when editing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const location = { href: "" };
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", location);
    const user = userEvent.setup();
    const editedSession = {
      ...session,
      startTime: "19:15",
    };

    render(<HostSessionEditorForTest session={editedSession} />);

    expect(screen.getByLabelText("시작 시간")).toHaveValue("19:15");

    await user.clear(screen.getByLabelText("세션 제목"));
    await user.type(screen.getByLabelText("세션 제목"), "6회차 모임 · 수정");
    await user.click(screen.getByRole("button", { name: "변경 사항 저장" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/sessions/session-1", expect.objectContaining({
        cache: "no-store",
        method: "PATCH",
        body: JSON.stringify({
          title: "6회차 모임 · 수정",
          bookTitle: "팩트풀니스",
          bookAuthor: "한스 로슬링",
          bookLink: "https://example.com/books/factfulness",
          bookImageUrl: "https://image.aladin.co.kr/product/34538/43/cover500/8934933879_1.jpg",
          locationLabel: "온라인",
          meetingUrl: "https://meet.google.com/readmates-factfulness",
          meetingPasscode: "fact",
          date: "2025-11-26",
          startTime: "19:15",
        }),
      })),
    );
    expect(fetchMock).not.toHaveBeenCalledWith("/api/bff/api/host/sessions", expect.anything());
  });

  it("patches cleared optional book and meeting fields as empty strings", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const location = { href: "" };
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", location);
    const user = userEvent.setup();

    render(<HostSessionEditorForTest session={session} />);

    await user.clear(screen.getByLabelText("책 이미지 URL"));
    await user.clear(screen.getByLabelText("Passcode · 선택"));
    await user.click(screen.getByRole("button", { name: "변경 사항 저장" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/sessions/session-1", expect.objectContaining({
        cache: "no-store",
        method: "PATCH",
        body: JSON.stringify({
          title: "1회차 모임 · 팩트풀니스",
          bookTitle: "팩트풀니스",
          bookAuthor: "한스 로슬링",
          bookLink: "https://example.com/books/factfulness",
          bookImageUrl: "",
          locationLabel: "온라인",
          meetingUrl: "https://meet.google.com/readmates-factfulness",
          meetingPasscode: "",
          date: "2025-11-26",
          startTime: "20:00",
        }),
      })),
    );
    expect(fetchMock).not.toHaveBeenCalledWith("/api/bff/api/host/sessions", expect.anything());
  });

  it("initializes publication summary and visibility from the host session detail payload", () => {
    render(
      <HostSessionEditorForTest
        session={{
          ...session,
          publication: {
            publicSummary: "저장된 공개 요약입니다.",
            visibility: "MEMBER",
          },
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "기록 공개 범위" })).toBeVisible();
    expect(screen.getByLabelText("기록 요약")).toHaveValue("저장된 공개 요약입니다.");
    expect(screen.getByRole("radio", { name: /호스트 전용/ })).toBeVisible();
    expect(screen.getByRole("radio", { name: /멤버 공개/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /외부 공개/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "저장" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "요약 초안 저장" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "공개 기록 발행" })).not.toBeInTheDocument();
  });

  it("saves publication summary and record visibility through the publication API without redirecting", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const location = { href: "" };
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", location);
    const user = userEvent.setup();

    render(<HostSessionEditorForTest session={{ ...session, publication: null }} />);

    const publicationStatusRow = screen.getByText("공개 기록").closest(".row-between");
    expect(publicationStatusRow).not.toBeNull();
    expect(within(publicationStatusRow as HTMLElement).getByText("기록 없음")).toBeVisible();

    await user.type(screen.getByLabelText("기록 요약"), "멤버에게 공유할 기록입니다.");
    await user.click(screen.getByRole("radio", { name: /멤버 공개/ }));
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/sessions/session-1/publication", expect.objectContaining({
        cache: "no-store",
        method: "PUT",
        body: JSON.stringify({
          publicSummary: "멤버에게 공유할 기록입니다.",
          visibility: "MEMBER",
        }),
      })),
    );
    expect(location.href).toBe("");
    expect(await screen.findByRole("status")).toHaveTextContent("기록 공개 범위를 저장했습니다.");
    expect(within(publicationStatusRow as HTMLElement).getByText("멤버 공개")).toBeVisible();
  });

  it("lets hosts close an open session from the editor", async () => {
    const user = userEvent.setup();
    const closeSession = vi.fn(
      async () =>
        new Response(JSON.stringify({ ...openSession, state: "CLOSED" }), {
          status: 200,
        }) as JsonResponse<HostSessionDetailResponse>,
    );

    render(
      <HostSessionEditorForTest
        session={openSession}
        actions={{ ...hostSessionEditorTestActions, closeSession }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "세션 마감" }));

    expect(closeSession).toHaveBeenCalledWith(openSession.sessionId);
    expect(await screen.findByText("닫힘")).toBeInTheDocument();
  });

  it("saves publication and publishes a closed record", async () => {
    const user = userEvent.setup();
    const closedSession = { ...session, state: "CLOSED" as const };
    const savePublication = vi.fn(async () => new Response("{}", { status: 200 }));
    const publishSession = vi.fn(
      async () =>
        new Response(JSON.stringify({ ...closedSession, state: "PUBLISHED" }), {
          status: 200,
        }) as JsonResponse<HostSessionDetailResponse>,
    );

    render(
      <HostSessionEditorForTest
        session={closedSession}
        actions={{ ...hostSessionEditorTestActions, savePublication, publishSession }}
      />,
    );

    await user.clear(screen.getByLabelText("기록 요약"));
    await user.type(screen.getByLabelText("기록 요약"), "최종 공개 요약입니다.");
    await user.click(screen.getByRole("radio", { name: /외부 공개/ }));
    await user.click(screen.getByRole("button", { name: "기록 공개" }));

    expect(savePublication).toHaveBeenCalledWith(closedSession.sessionId, {
      publicSummary: "최종 공개 요약입니다.",
      visibility: "PUBLIC",
    });
    expect(publishSession).toHaveBeenCalledWith(closedSession.sessionId);
    expect((await screen.findAllByText("공개됨")).length).toBeGreaterThan(0);
  });

  it("disables publication editing controls while the record save is pending", async () => {
    const saveResponse = deferredFetchResponse();
    const fetchMock = vi.fn().mockReturnValue(saveResponse.promise);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HostSessionEditorForTest session={{ ...session, publication: null }} />);

    await user.type(screen.getByLabelText("기록 요약"), "저장 중에는 수정할 수 없는 기록입니다.");
    await user.click(screen.getByRole("radio", { name: /멤버 공개/ }));
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("기록 요약")).toBeDisabled();
    expect(screen.getByRole("button", { name: "저장하는 중" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /호스트 전용/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /멤버 공개/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /외부 공개/ })).toBeDisabled();

    saveResponse.resolve({ ok: true });

    expect(await screen.findByRole("status")).toHaveTextContent("기록 공개 범위를 저장했습니다.");
  });

  it("disables publication actions for unsaved new sessions and explains why", () => {
    render(<HostSessionEditorForTest />);

    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
    expect(screen.getByText("세션을 만든 뒤 기록 요약과 공개 범위를 저장할 수 있습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "요약 초안 저장" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "공개 기록 발행" })).not.toBeInTheDocument();
  });

  it("shows publication validation feedback inside the publication section without sending a request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HostSessionEditorForTest session={{ ...session, publication: null }} />);

    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("기록 요약을 입력한 뒤 저장해주세요.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows publication API failure feedback inside the publication section", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HostSessionEditorForTest session={{ ...session, publication: null }} />);

    await user.type(screen.getByLabelText("기록 요약"), "저장 실패를 확인할 공개 요약입니다.");
    await user.click(screen.getByRole("radio", { name: /외부 공개/ }));
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "기록 공개 범위 저장에 실패했습니다. 입력값을 확인한 뒤 다시 시도해 주세요.",
    );
  });

  it("persists attendance toggles for the edited session and updates selected state", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HostSessionEditorForTest session={session} />);

    const absentToggle = screen.getByRole("button", { name: "수 불참" });
    expect(absentToggle).toHaveAttribute("aria-pressed", "false");

    await user.click(absentToggle);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/sessions/session-1/attendance", expect.objectContaining({
        cache: "no-store",
        method: "POST",
        body: JSON.stringify([{ membershipId: "membership-suhan", attendanceStatus: "ABSENT" }]),
      })),
    );
    expect(absentToggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "수 참석" })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows removed participants in a separate collapsed attendance section", () => {
    render(
      <HostSessionEditorForTest
        session={{
          ...session,
          attendees: [
            ...session.attendees,
            {
              membershipId: "membership-removed",
              displayName: "제외",
              accountName: "제외된 멤버",
              rsvpStatus: "GOING",
              attendanceStatus: "UNKNOWN",
              participationStatus: "REMOVED",
            },
          ],
        }}
      />,
    );

    expect(screen.queryByText("제외")).not.toBeInTheDocument();
    expect(screen.getAllByText("제외된 참가자 1명").length).toBeGreaterThan(0);
  });

  it("serializes and coalesces attendance writes so stale success cannot overtake the latest desired status", async () => {
    const firstAttendanceSave = deferredFetchResponse();
    const secondAttendanceSave = deferredFetchResponse();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstAttendanceSave.promise)
      .mockReturnValueOnce(secondAttendanceSave.promise);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <HostSessionEditorForTest
        session={{
          ...session,
          attendees: session.attendees.map((attendee) =>
            attendee.membershipId === "membership-suhan"
              ? { ...attendee, attendanceStatus: "UNKNOWN" }
              : attendee,
          ),
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "수 참석" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/bff/api/host/sessions/session-1/attendance", expect.objectContaining({
        cache: "no-store",
        method: "POST",
        body: JSON.stringify([{ membershipId: "membership-suhan", attendanceStatus: "ATTENDED" }]),
      })),
    );
    expect(screen.getByRole("button", { name: "수 참석" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "수 불참" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "수 불참" })).toHaveAttribute("aria-pressed", "true");

    firstAttendanceSave.resolve({ ok: true });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/bff/api/host/sessions/session-1/attendance", expect.objectContaining({
        cache: "no-store",
        method: "POST",
        body: JSON.stringify([{ membershipId: "membership-suhan", attendanceStatus: "ABSENT" }]),
      })),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);

    secondAttendanceSave.resolve({ ok: true });

    await waitFor(() => expect(screen.getByRole("button", { name: "수 불참" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: "수 참석" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("rolls back to a successful in-flight attendance commit when the queued write fails", async () => {
    const firstAttendanceSave = deferredFetchResponse();
    const secondAttendanceSave = deferredFetchResponse();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstAttendanceSave.promise)
      .mockReturnValueOnce(secondAttendanceSave.promise);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <HostSessionEditorForTest
        session={{
          ...session,
          attendees: session.attendees.map((attendee) =>
            attendee.membershipId === "membership-suhan"
              ? { ...attendee, attendanceStatus: "UNKNOWN" }
              : attendee,
          ),
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "수 참석" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/bff/api/host/sessions/session-1/attendance", expect.objectContaining({
        cache: "no-store",
        method: "POST",
        body: JSON.stringify([{ membershipId: "membership-suhan", attendanceStatus: "ATTENDED" }]),
      })),
    );
    expect(screen.getByRole("button", { name: "수 참석" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "수 불참" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "수 불참" })).toHaveAttribute("aria-pressed", "true");

    firstAttendanceSave.resolve({ ok: true });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/bff/api/host/sessions/session-1/attendance", expect.objectContaining({
        cache: "no-store",
        method: "POST",
        body: JSON.stringify([{ membershipId: "membership-suhan", attendanceStatus: "ABSENT" }]),
      })),
    );

    secondAttendanceSave.resolve({ ok: false });

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("출석 저장에 실패했습니다"));
    expect(screen.getByRole("button", { name: "수 참석" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "수 불참" })).toHaveAttribute("aria-pressed", "false");
  });

  it("rolls back to the last committed attendance status when the latest coalesced write fails", async () => {
    const firstAttendanceSave = deferredFetchResponse();
    const secondAttendanceSave = deferredFetchResponse();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstAttendanceSave.promise)
      .mockReturnValueOnce(secondAttendanceSave.promise);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <HostSessionEditorForTest
        session={{
          ...session,
          attendees: session.attendees.map((attendee) =>
            attendee.membershipId === "membership-suhan"
              ? { ...attendee, attendanceStatus: "UNKNOWN" }
              : attendee,
          ),
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "수 참석" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/bff/api/host/sessions/session-1/attendance", expect.objectContaining({
        cache: "no-store",
        method: "POST",
        body: JSON.stringify([{ membershipId: "membership-suhan", attendanceStatus: "ATTENDED" }]),
      })),
    );
    expect(screen.getByRole("button", { name: "수 참석" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "수 불참" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "수 불참" })).toHaveAttribute("aria-pressed", "true");

    firstAttendanceSave.resolve({ ok: false });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/bff/api/host/sessions/session-1/attendance", expect.objectContaining({
        cache: "no-store",
        method: "POST",
        body: JSON.stringify([{ membershipId: "membership-suhan", attendanceStatus: "ABSENT" }]),
      })),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    secondAttendanceSave.resolve({ ok: false });

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("출석 저장에 실패했습니다"));
    expect(screen.getByRole("button", { name: "수 참석" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "수 불참" })).toHaveAttribute("aria-pressed", "false");
  });

  it("rolls back an optimistic attendance update when the save request rejects", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network failed"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HostSessionEditorForTest session={session} />);

    await user.click(screen.getByRole("button", { name: "수 불참" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/sessions/session-1/attendance", expect.objectContaining({
        cache: "no-store",
        method: "POST",
        body: JSON.stringify([{ membershipId: "membership-suhan", attendanceStatus: "ABSENT" }]),
      })),
    );

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("출석 저장에 실패했습니다"));
    expect(screen.getByRole("button", { name: "수 참석" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "수 불참" })).toHaveAttribute("aria-pressed", "false");
  });

  it("previews and deletes an open session from the danger modal", async () => {
    const location = { href: "" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(deletionPreview),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          sessionId: "open-session-7",
          sessionNumber: 7,
          deleted: true,
          counts: deletionPreview.counts,
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", location);
    const user = userEvent.setup();

    render(<HostSessionEditorForTest session={openSession} />);

    await user.click(screen.getByRole("button", { name: "세션 삭제" }));

    const dialog = await screen.findByRole("dialog", { name: "이 세션을 삭제할까요?" });
    expect(dialog).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/sessions/open-session-7/deletion-preview", expect.objectContaining({
        cache: "no-store",
        method: "GET",
      })),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("참석 대상")).toBeInTheDocument();
    expect(screen.getByText("6명")).toBeInTheDocument();
    expect(screen.getByText("질문")).toBeInTheDocument();
    expect(screen.getByText("4개")).toBeInTheDocument();
    expect(screen.getByText("레거시 개인 피드백")).toBeInTheDocument();
    expect(screen.getByText("7개")).toBeInTheDocument();
    expect(screen.queryByText(retiredPersonalFeedbackReportLabel)).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "세션 삭제" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/sessions/open-session-7", expect.objectContaining({
        cache: "no-store",
        method: "DELETE",
      })),
    );
    expect(location.href).toBe("/app/host/sessions/new");
  });

  it("keeps keyboard focus inside the delete modal and restores focus when Escape closes", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(deletionPreview),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HostSessionEditorForTest session={openSession} />);

    const trigger = screen.getByRole("button", { name: "세션 삭제" });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "이 세션을 삭제할까요?" });
    const cancelButton = within(dialog).getByRole("button", { name: "취소" });
    await waitFor(() => expect(cancelButton).toHaveFocus());

    await screen.findByText("참석 대상");
    const confirmButton = within(dialog).getByRole("button", { name: "세션 삭제" });
    expect(confirmButton).toBeEnabled();

    await user.tab();
    expect(confirmButton).toHaveFocus();
    await user.tab();
    expect(cancelButton).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirmButton).toHaveFocus();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "이 세션을 삭제할까요?" })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith("/api/bff/api/host/sessions/open-session-7", expect.objectContaining({
      method: "DELETE",
    }));
  });

  it("does not show the delete action on the new-session editor", () => {
    render(<HostSessionEditorForTest />);

    expect(screen.queryByRole("button", { name: "세션 삭제" })).not.toBeInTheDocument();
  });

  it("disables delete action for non-open sessions", () => {
    render(<HostSessionEditorForTest session={session} />);

    expect(screen.getByRole("button", { name: "세션 삭제" })).toBeDisabled();
  });

  it("shows a preview failure message and does not send delete", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 409 });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HostSessionEditorForTest session={openSession} />);

    await user.click(screen.getByRole("button", { name: "세션 삭제" }));

    expect(await screen.findByText("이미 닫히거나 공개된 세션은 삭제할 수 없습니다.")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: "이 세션을 삭제할까요?" });
    expect(within(dialog).getByRole("button", { name: "세션 삭제" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the modal open when delete fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(deletionPreview),
      })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HostSessionEditorForTest session={openSession} />);

    await user.click(screen.getByRole("button", { name: "세션 삭제" }));
    await screen.findByText("참석 대상");
    const dialog = screen.getByRole("dialog", { name: "이 세션을 삭제할까요?" });
    await user.click(within(dialog).getByRole("button", { name: "세션 삭제" }));

    expect(await screen.findByText("세션 삭제에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.")).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
  });
});
