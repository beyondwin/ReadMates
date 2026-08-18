import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostSessionEditorActions } from "@/features/host/route/host-session-editor-actions";

vi.mock("@/features/host/aigen/ui/AiGenerateTab", () => ({
  AiGenerateTab: ({
    sessionId,
    clubSlug,
    onCommitted,
  }: {
    sessionId: string;
    clubSlug: string;
    onCommitted: (result: {
      draftRevision: number;
      baseLiveRevision: number;
      liveApplied: boolean;
    }) => void;
  }) => (
    <div data-testid="aigen-tab" data-session-id={sessionId} data-club-slug={clubSlug}>
      <button
        type="button"
        onClick={() => onCommitted({
          draftRevision: 5,
          baseLiveRevision: 0,
          liveApplied: false,
        })}
      >
        simulate AI commit
      </button>
    </div>
  ),
}));

import HostSessionEditor from "@/features/host/ui/host-session-editor";
import type { HostSessionEditorLocation } from "@/features/host/model/host-session-editor-navigation";
import {
  buildHostSessionRequest,
  defaultSessionDateFrom,
} from "@/features/host/ui/host-session-schedule";
import type {
  HostSessionDeletionPreviewResponse,
  HostSessionDetailResponse,
  SessionImportRequest,
  SessionImportPreviewResponse,
} from "@/features/host/api/host-contracts";
import { openAlreadyExistsMessage } from "@/features/host/model/host-session-lifecycle-model";
import {
  hostSessionDetailContractFixture,
} from "./api-contract-fixtures";

const retiredPersonalFeedbackReportLabel = ["개인 피드백", "리포트"].join(" ");
type HostSessionEditorRecordWorkflow =
  NonNullable<Parameters<typeof HostSessionEditor>[0]["recordWorkflow"]>;
type RestoreReturnsPromise =
  ReturnType<HostSessionEditorRecordWorkflow["onRestore"]> extends Promise<void> ? true : false;
const restoreReturnsPromise: RestoreReturnsPromise = true;

const jsonHeaders = () => new Headers({ "Content-Type": "application/json" });

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
  closeSession: async () => ({ ok: true, session: hostSessionDetailContractFixture }),
  publishSession: async () => ({ ok: true, session: hostSessionDetailContractFixture }),
  reopenSession: async () => ({ ok: true, session: hostSessionDetailContractFixture }),
  unpublishSession: async () => ({ ok: true, session: hostSessionDetailContractFixture }),
  returnSessionToDraft: async () => ({ ok: true, session: hostSessionDetailContractFixture }),
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
  updateAttendance: (sessionId, attendance) =>
    fetch(`/api/bff/api/host/sessions/${encodeURIComponent(sessionId)}/attendance`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(attendance),
      cache: "no-store",
    }),
  previewSessionImport: async (_sessionId, request: SessionImportRequest) => ({
    valid: true,
    session: { sessionNumber: request.session.number, bookTitle: request.session.bookTitle, meetingDate: request.session.meetingDate },
    publication: { summary: request.publication.summary },
    highlights: request.highlights.map((record, index) => ({
      ...record,
      authorMatched: true,
      membershipId: `membership-highlight-${index + 1}`,
    })),
    oneLineReviews: request.oneLineReviews.map((record, index) => ({
      ...record,
      authorMatched: true,
      membershipId: `membership-review-${index + 1}`,
    })),
    feedbackDocument: { fileName: request.feedbackDocument.fileName, title: "독서모임 7차 피드백", valid: true },
    issues: [],
  }),
  commitSessionImport: async (sessionId) => ({
    sessionId,
    draftRevision: 1,
    baseLiveRevision: 0,
    liveApplied: false,
  }),
} satisfies HostSessionEditorActions;

type HostSessionEditorProps = Parameters<typeof HostSessionEditor>[0];

function HostSessionEditorForTest({
  actions,
  navigation,
  initialLocation = { section: "overview", source: "manual" },
  recordWorkflow: workflow,
  session: testSession,
  ...props
}: Omit<HostSessionEditorProps, "actions" | "navigation"> & {
  actions?: HostSessionEditorActions;
  navigation?: HostSessionEditorProps["navigation"];
  initialLocation?: HostSessionEditorLocation;
}) {
  const [location, setLocation] = useState(initialLocation);
  const [defaultWorkflow, setDefaultWorkflow] = useState(
    () => recordWorkflow(testSession?.visibility ?? "HOST_ONLY"),
  );
  const effectiveWorkflow = workflow ?? (testSession
    ? {
        ...defaultWorkflow,
        onSnapshotChange: (snapshot: HostSessionEditorRecordWorkflow["snapshot"]) => {
          setDefaultWorkflow((current) => ({ ...current, snapshot }));
        },
      }
    : undefined);

  return (
    <HostSessionEditor
      {...props}
      session={testSession}
      actions={actions ?? hostSessionEditorTestActions}
      navigation={navigation ?? { location, onChange: setLocation }}
      recordWorkflow={effectiveWorkflow}
    />
  );
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

function sessionImportJson() {
  return JSON.stringify({
    format: "readmates-session-import:v1",
    session: {
      number: session.sessionNumber,
      bookTitle: session.bookTitle,
      meetingDate: session.date,
    },
    publication: {
      summary: "Import summary.",
    },
    highlights: [{ authorName: "호스트", text: "Import highlight." }],
    oneLineReviews: [{ authorName: "호스트", text: "Import one line." }],
    feedbackDocument: {
      fileName: "session-import.md",
      markdown: "<!-- readmates-feedback:v1 -->",
    },
  });
}

function recordWorkflow(
  visibility: "HOST_ONLY" | "MEMBER" | "PUBLIC",
): NonNullable<HostSessionEditorProps["recordWorkflow"]> {
  const snapshot = {
    schema: "readmates-session-record:v1" as const,
    visibility,
    publicationSummary: "공유 초안 요약",
    highlights: [],
    oneLineReviews: [],
    feedbackDocument: {
      fileName: "feedback.md",
      title: "",
      markdown: "",
    },
  };

  return {
    editor: {
      liveRevision: 0,
      liveSessionUpdatedAt: "2026-05-13T10:00:00Z",
      liveSnapshot: { ...snapshot, visibility: "HOST_ONLY", publicationSummary: "" },
      draft: {
        source: "MANUAL",
        updatedAt: "2026-05-13T10:00:00Z",
      },
      draftLiveBaseStale: false,
      validationSummary: { valid: true, issues: [] },
    },
    history: [],
    historyNextCursor: null,
    historyLoadingMore: false,
    snapshot,
    saveState: "saved",
    expectedDraftRevision: 4,
    restoring: false,
    rebasePending: false,
    rebaseError: null,
    onSnapshotChange: vi.fn(),
    onReloadDraft: vi.fn(),
    onRebaseDraft: vi.fn(),
    onDraftCommitted: vi.fn(),
    onLoadMoreHistory: vi.fn(),
    onCopyInput: vi.fn(),
    confirmation: {
      open: false,
      preview: null,
      submitting: false,
      message: null,
      onReview: vi.fn(),
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
    },
    onRestore: vi.fn(),
  };
}

function ApplyDialogDismissHarness({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  const workflow = recordWorkflow("MEMBER");
  workflow.confirmation = {
    open,
    preview: {
      eventType: "SESSION_RECORD_UPDATED",
      changedSections: ["공개 요약"],
      liveRevision: 2,
      nextLiveRevision: 3,
      draftRevision: 6,
      visibility: "MEMBER",
    },
    submitting: false,
    message: null,
    onReview: vi.fn(),
    onCancel: () => {
      onCancel();
      setOpen(false);
    },
    onConfirm,
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>반영 대화상자 열기</button>
      <HostSessionEditorForTest session={session} recordWorkflow={workflow} />
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("HostSessionEditor", () => {
  it("requires restore workflows to expose completion as a promise", () => {
    expect(restoreReturnsPromise).toBe(true);
  });

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

  it("labels new session document creation separately from current session editing", () => {
    render(
      <HostSessionEditorForTest
        session={null}
        initialLocation={{ section: "basic", source: "manual" }}
      />,
    );

    expect(screen.getByRole("heading", { name: "세션 문서 만들기" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "운영으로" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "세션 문서 저장" })).toBeVisible();
    expect(screen.queryByRole("link", { name: /운영 대시보드/ })).not.toBeInTheDocument();
    const bookAndSessionPanel = screen.getByRole("heading", { name: "읽을 책" }).closest("section");
    expect(bookAndSessionPanel).not.toBeNull();
    expect(within(bookAndSessionPanel as HTMLElement).getByText("도서 정보")).toBeVisible();
    expect(screen.queryByText("세션 문서 편집")).not.toBeInTheDocument();
    const mobileMetadata = screen.getByRole("group", { name: "모바일 세션 상태" });
    expect(Array.from(mobileMetadata.children, (item) => item.textContent)).toEqual([
      "새 예정 세션",
      "호스트 전용",
      "초안 준비됨",
    ]);
  });

  it("shows helpful hints for the new-session title and book fields", () => {
    render(
      <HostSessionEditorForTest
        session={null}
        initialLocation={{ section: "basic", source: "manual" }}
      />,
    );

    expect(screen.getByLabelText("세션 제목")).toHaveAttribute(
      "placeholder",
      "예: 8회차 모임 · 물고기는 존재하지 않는다",
    );
    expect(screen.getByLabelText("책 제목")).toHaveAttribute("placeholder", "예: 물고기는 존재하지 않는다");
    expect(screen.getByLabelText("저자")).toHaveAttribute("placeholder", "예: 룰루 밀러");
  });

  it("labels existing open session as session document editing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 2));

    const currentOpenSession = {
      ...openSession,
      date: "2026-05-20",
    };
    const workflow = recordWorkflow("HOST_ONLY");
    workflow.saveState = "idle";

    render(<HostSessionEditorForTest session={currentOpenSession} recordWorkflow={workflow} />);

    expect(screen.getByRole("heading", { name: "세션 문서 편집" })).toBeVisible();
    expect(screen.getByText("세션 운영 문서")).toBeVisible();
    expect(screen.queryByText("세션 운영 문서 · No.7")).not.toBeInTheDocument();
    const desktopMetadata = screen.getByRole("group", { name: "데스크톱 세션 상태" });
    expect(within(desktopMetadata).getByRole("group", {
      name: "No.07 · 이번 세션 · 준비 중 · D-18",
    })).toBeVisible();
    expect(within(desktopMetadata).getByText("No.07")).toHaveClass("rm-session-identity__number");
    expect(within(desktopMetadata).getByText("준비 중")).toHaveClass("rm-session-identity__chip", "rm-state", "rm-state--pending");
    expect(within(desktopMetadata).getByText("D-18")).toHaveClass("rm-session-identity__chip", "rm-state", "rm-state--pending");
    expect(within(desktopMetadata).getByText("이번 세션")).toHaveClass("rm-session-identity__chip");

    const mobileMetadata = screen.getByRole("group", { name: "모바일 세션 상태" });
    expect(within(mobileMetadata).getByText("No.07")).toBeInTheDocument();
    expect(within(mobileMetadata).getByText("준비 중")).toBeInTheDocument();
    expect(within(mobileMetadata).getAllByText("호스트 전용")).toHaveLength(1);
    expect(within(mobileMetadata).getByText("초안 준비됨")).toBeInTheDocument();
    expect(within(mobileMetadata).queryByText("이번 세션")).not.toBeInTheDocument();
    expect(within(mobileMetadata).queryByText("D-18")).not.toBeInTheDocument();
    expect(screen.queryByText("문서 있음")).not.toBeInTheDocument();
    expect(screen.queryByText("No.07 · D-18")).not.toBeInTheDocument();
    expect(screen.getByText("현재 적용본")).toBeVisible();
    expect(screen.getByText("작업 중인 초안")).toBeVisible();
    expect(screen.getByText("다음 할 일")).toBeVisible();
  });

  it("fails fast when a persisted session is rendered without its record workflow", () => {
    expect(() => render(
      <HostSessionEditor
        session={session}
        actions={hostSessionEditorTestActions}
        navigation={{
          location: { section: "overview", source: "manual" },
          onChange: vi.fn(),
        }}
      />,
    )).toThrow("recordWorkflow is required for persisted sessions");
  });

  it("shows only the overview by default without a global save action", () => {
    render(<HostSessionEditorForTest session={session} />);

    expect(screen.getByRole("tab", { name: "개요" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("현재 적용본")).toBeVisible();
    expect(screen.getByText("작업 중인 초안")).toBeVisible();
    expect(screen.getByText("다음 할 일")).toBeVisible();
    expect(screen.queryByRole("button", { name: "변경 사항 저장" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("세션 제목")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("기록 요약")).not.toBeInTheDocument();
  });

  it("switches the desktop and mobile editor through five section contexts", async () => {
    const user = userEvent.setup();
    render(<HostSessionEditorForTest session={session} />);

    const segments = screen.getByRole("tablist", { name: "호스트 편집 섹션" });
    const overview = screen.getByRole("tab", { name: "개요" });
    const basic = screen.getByRole("tab", { name: "기본 정보" });
    const attendance = screen.getByRole("tab", { name: "출석" });
    const records = screen.getByRole("tab", { name: "기록 작업대" });
    const history = screen.getByRole("tab", { name: "변경 기록" });

    expect(segments).toHaveAttribute("role", "tablist");
    expect(Array.from(segments.querySelectorAll('[role="tab"]')).map((button) => button.getAttribute("aria-label"))).toEqual([
      "개요",
      "기본 정보",
      "출석",
      "기록 작업대",
      "변경 기록",
    ]);
    expect(overview).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByLabelText("세션 제목")).not.toBeInTheDocument();

    await user.click(basic);
    expect(basic).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("세션 제목")).toBeVisible();
    await user.click(records);
    expect(records).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("공개 요약")).toBeVisible();
    expect(screen.getByLabelText("세션 제목")).not.toBeVisible();

    await user.click(attendance);
    expect(attendance).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "출석 확정 명단" })).toBeVisible();

    await user.click(history);
    expect(history).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "버전과 작업 기록" })).toBeVisible();
  });

  it("supports keyboard selection in the five-section editor tablist", async () => {
    const user = userEvent.setup();
    render(<HostSessionEditorForTest session={session} />);

    const overview = screen.getByRole("tab", { name: "개요" });
    const basic = screen.getByRole("tab", { name: "기본 정보" });
    const history = screen.getByRole("tab", { name: "변경 기록" });

    overview.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(basic).toHaveFocus());
    expect(basic).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{End}");
    await waitFor(() => expect(history).toHaveFocus());
    expect(history).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Home}");
    await waitFor(() => expect(overview).toHaveFocus());
    expect(overview).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowLeft}");
    await waitFor(() => expect(history).toHaveFocus());
    expect(history).toHaveAttribute("aria-selected", "true");
  });

  it("keeps basic and records edits when visiting other sections", async () => {
    const user = userEvent.setup();
    render(
      <HostSessionEditorForTest
        session={session}
        initialLocation={{ section: "basic", source: "manual" }}
      />,
    );

    await user.clear(screen.getByLabelText("세션 제목"));
    await user.type(screen.getByLabelText("세션 제목"), "수정 중인 세션 제목");

    await user.click(screen.getByRole("tab", { name: "기록 작업대" }));
    await user.clear(screen.getByLabelText("공개 요약"));
    await user.type(screen.getByLabelText("공개 요약"), "수정 중인 공개 요약");

    await user.click(screen.getByRole("tab", { name: "변경 기록" }));
    await user.click(screen.getByRole("tab", { name: "기본 정보" }));
    expect(screen.getByLabelText("세션 제목")).toHaveValue("수정 중인 세션 제목");

    await user.click(screen.getByRole("tab", { name: "기록 작업대" }));
    expect(screen.getByLabelText("공개 요약")).toHaveValue("수정 중인 공개 요약");
  });

  it("does not submit basic information when Enter is pressed in a record input", async () => {
    const user = userEvent.setup();
    const saveSession = vi.fn(async () => ({ ok: true }) as Response);
    const workflow = recordWorkflow("MEMBER");
    workflow.snapshot.oneLineReviews = [{
      membershipId: "membership-reviewer",
      authorDisplayName: "테스트 멤버",
      text: "기존 한줄평",
    }];

    render(
      <HostSessionEditorForTest
        session={session}
        initialLocation={{ section: "basic", source: "manual" }}
        actions={{ ...hostSessionEditorTestActions, saveSession }}
        recordWorkflow={workflow}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "기록 작업대" }));
    await user.click(screen.getByLabelText("한줄평 1 · 테스트 멤버"));
    await user.keyboard("{Enter}");

    expect(saveSession).not.toHaveBeenCalled();
  });

  it("keeps externally activated record source state mounted after another controlled location arrives", () => {
    const onChange = vi.fn();
    const workflow = recordWorkflow("MEMBER");
    const renderAt = (location: HostSessionEditorLocation) => (
      <HostSessionEditor
        session={session}
        clubSlug="club-a"
        actions={hostSessionEditorTestActions}
        navigation={{ location, onChange }}
        recordWorkflow={workflow}
      />
    );
    const { rerender } = render(renderAt({ section: "basic", source: "manual" }));

    rerender(renderAt({ section: "records", source: "json" }));
    const fileInput = screen.getByLabelText("AI 결과 JSON 가져오기", { selector: "input" });
    const sourceFile = new File([sessionImportJson()], "controlled-source.json", {
      type: "application/json",
    });
    fireEvent.change(fileInput, { target: { files: [sourceFile] } });
    expect((fileInput as HTMLInputElement).files?.[0]?.name).toBe("controlled-source.json");

    rerender(renderAt({ section: "history", source: "manual" }));

    const keptAliveInput = screen.getByLabelText("AI 결과 JSON 가져오기", { selector: "input" });
    expect(keptAliveInput).toBe(fileInput);
    expect(keptAliveInput).not.toBeVisible();
    expect((keptAliveInput as HTMLInputElement).files?.[0]?.name).toBe("controlled-source.json");
  });

  it("keeps basic save feedback beside the section-local action", async () => {
    const user = userEvent.setup();
    const saveSession = vi.fn(async () => ({ ok: true }) as Response);

    render(
      <HostSessionEditorForTest
        session={session}
        initialLocation={{ section: "basic", source: "manual" }}
        actions={{ ...hostSessionEditorTestActions, saveSession }}
      />,
    );

    const saveButton = screen.getByRole("button", { name: "기본 정보 저장" });
    expect(screen.queryByRole("button", { name: "변경 사항 저장" })).not.toBeInTheDocument();
    await user.click(saveButton);

    const feedback = await screen.findByRole("status");
    expect(feedback).toHaveTextContent("저장되었습니다.");
    expect(saveButton.closest("form")).toContainElement(feedback);
  });

  it("keeps attendance writes independent from the basic form submit", async () => {
    const user = userEvent.setup();
    const saveSession = vi.fn(hostSessionEditorTestActions.saveSession);
    const updateAttendance = vi.fn(async () => ({ ok: true }) as Response);

    render(
      <HostSessionEditorForTest
        session={session}
        initialLocation={{ section: "attendance", source: "manual" }}
        actions={{ ...hostSessionEditorTestActions, saveSession, updateAttendance }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "수 불참" }));
    await waitFor(() => expect(updateAttendance).toHaveBeenCalledTimes(1));
    expect(saveSession).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "변경 사항 저장" })).not.toBeInTheDocument();
  });

  it("shows notifications and danger actions only in their relevant section context", async () => {
    const user = userEvent.setup();
    render(<HostSessionEditorForTest session={openSession} />);

    expect(screen.getByText("알림 발송")).toBeVisible();
    expect(screen.queryByText("운영 순서")).not.toBeInTheDocument();
    expect(screen.queryByText("저장 안내")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "세션 삭제" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "기본 정보" }));
    expect(screen.getByRole("button", { name: "세션 삭제" })).toBeVisible();
    expect(screen.queryByText("알림 발송")).not.toBeVisible();
    expect(screen.queryByText("운영 순서")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "출석" }));
    expect(screen.queryByRole("button", { name: "세션 삭제" })).not.toBeInTheDocument();
    expect(screen.queryByText("알림 발송")).not.toBeVisible();
  });

  it("shows a new-session empty message instead of static attendance and feedback document controls", () => {
    render(
      <HostSessionEditorForTest
        initialLocation={{ section: "attendance", source: "manual" }}
      />,
    );

    expect(screen.getByText("세션을 만든 뒤 참석과 피드백 문서를 관리할 수 있습니다.")).toBeInTheDocument();
    expect(screen.queryByText("HTML 파일을 드래그하거나 클릭해 업로드")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "파일 선택" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "에디터에서 작성" })).not.toBeInTheDocument();
    expect(screen.queryByText("이멤버14")).not.toBeInTheDocument();
    expect(screen.queryByText("feedback-14-sample-member.html")).not.toBeInTheDocument();
  });

  it("automatically derives the question deadline from the selected meeting date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 21, 12));
    render(
      <HostSessionEditorForTest
        initialLocation={{ section: "basic", source: "manual" }}
      />,
    );
    vi.useRealTimers();

    const user = userEvent.setup();
    expect(screen.getByLabelText("모임 날짜")).toHaveValue("2026-04-21");
    expect(screen.getByLabelText("시작 시간")).toHaveValue("20:00");
    expect(screen.getByLabelText("질문 제출 마감")).toHaveValue("04-20 23:59까지");

    await user.clear(screen.getByLabelText("시작 시간"));
    await user.type(screen.getByLabelText("시작 시간"), "18:45");

    expect(screen.getByLabelText("질문 제출 마감")).toHaveValue("04-20 23:59까지");

    await user.clear(screen.getByLabelText("모임 날짜"));
    await user.type(screen.getByLabelText("모임 날짜"), "2026-01-01");

    expect(screen.getByLabelText("질문 제출 마감")).toHaveValue("12-31 23:59까지");
  });

  it("renders attendance from the host session detail API payload", () => {
    render(
      <HostSessionEditorForTest
        session={session}
        initialLocation={{ section: "attendance", source: "manual" }}
      />,
    );

    expect(screen.getAllByText("우")).not.toHaveLength(0);
    expect(screen.queryByRole("link", { name: "운영으로" })).not.toBeInTheDocument();
    expect(screen.queryByText(`${retiredPersonalFeedbackReportLabel} (HTML)`)).not.toBeInTheDocument();
    expect(screen.queryByText("HTML 파일을 드래그하거나 클릭해 업로드")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "우 리포트 열기 준비중" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "수 리포트 업로드 준비중" })).not.toBeInTheDocument();
    expect(screen.queryByText("이멤버14")).not.toBeInTheDocument();
    expect(screen.queryByText("feedback-14-sample-member.html")).not.toBeInTheDocument();
  });

  it.each(["OPEN", "CLOSED", "PUBLISHED"] as const)(
    "keeps the %s session feedback document in the shared record context",
    (state) => {
      const workflow = recordWorkflow("MEMBER");
      workflow.editor.liveSnapshot.feedbackDocument.fileName = "251126 1차.md";
      render(
        <HostSessionEditorForTest
          session={{ ...session, state }}
          clubSlug="club-a"
          initialLocation={{ section: "records", source: "json" }}
          recordWorkflow={workflow}
        />,
      );

      expect(screen.getByRole("region", { name: "현재 적용본" }))
        .toHaveTextContent("251126 1차.md");
      expect(screen.getByRole("region", { name: "현재 적용본" }))
        .toHaveTextContent("업로드 완료");
      expect(screen.getByRole("link", { name: "피드백 문서 미리보기" }))
        .toHaveAttribute(
          "href",
          "/clubs/club-a/app/host/sessions/session-1/feedback-document",
        );
      expect(screen.queryByText("세션 기록 완성")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("피드백 문서 파일")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "교체" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "등록" })).not.toBeInTheDocument();
    },
  );

  it("renders manual notification sent badges from route data", () => {
    render(
      <HostSessionEditorForTest
        session={openSession}
        notificationDispatches={[
          {
            manualDispatchId: "dispatch-1",
            eventId: "event-1",
            source: "MANUAL",
            eventType: "SESSION_REMINDER_DUE",
            sessionId: openSession.sessionId,
            sessionNumber: openSession.sessionNumber,
            bookTitle: openSession.bookTitle,
            requestedChannels: "BOTH",
            audience: "ALL_ACTIVE_MEMBERS",
            resend: false,
            requestedBy: "h***@example.com",
            targetCount: 17,
            expectedInAppCount: 17,
            expectedEmailCount: 14,
            eventStatus: "PUBLISHED",
            createdAt: "2026-05-13T10:10:00Z",
          },
        ]}
      />,
    );

    expect(screen.getByText("이미 발송됨")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /재발송 검토/ })).toHaveAttribute(
      "href",
      expect.stringContaining("eventType=SESSION_REMINDER_DUE"),
    );
  });

  it("shows persisted book and neutral meeting fields", () => {
    render(
      <HostSessionEditorForTest
        session={session}
        initialLocation={{ section: "basic", source: "manual" }}
      />,
    );

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
        initialLocation={{ section: "attendance", source: "manual" }}
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
    expect(screen.queryByText("등록된 리포트 대상자가 없습니다.")).not.toBeInTheDocument();
  });

  it("previews a selected session import json before commit", async () => {
    const user = userEvent.setup();
    const previewSessionImport = vi.fn(hostSessionEditorTestActions.previewSessionImport);

    render(
      <HostSessionEditorForTest
        session={session}
        initialLocation={{ section: "records", source: "json" }}
        actions={{ ...hostSessionEditorTestActions, previewSessionImport }}
      />,
    );

    const file = new File([sessionImportJson()], "session-import.json", { type: "application/json" });
    await user.upload(screen.getByLabelText("AI 결과 JSON 가져오기"), file);

    await waitFor(() => expect(previewSessionImport).toHaveBeenCalledTimes(1));
    expect(previewSessionImport.mock.calls[0]?.[1]).toMatchObject({
      expectedDraftRevision: 4,
    });
    expect(screen.getByText("Import summary.")).toBeVisible();
    expect(screen.getByRole("button", { name: "초안으로 가져오기" })).toBeEnabled();
  });

  it("previews JSON with the shared draft visibility and revision", async () => {
    const user = userEvent.setup();
    const previewSessionImport = vi.fn(hostSessionEditorTestActions.previewSessionImport);

    render(
      <HostSessionEditorForTest
        session={{ ...session, publication: null }}
        initialLocation={{ section: "records", source: "json" }}
        recordWorkflow={recordWorkflow("MEMBER")}
        actions={{ ...hostSessionEditorTestActions, previewSessionImport }}
      />,
    );

    await user.upload(
      screen.getByLabelText("AI 결과 JSON 가져오기"),
      new File([sessionImportJson()], "session-import.json", { type: "application/json" }),
    );

    await waitFor(() => expect(previewSessionImport).toHaveBeenCalledTimes(1));
    expect(previewSessionImport.mock.calls[0]?.[1]).toMatchObject({
      recordVisibility: "MEMBER",
      expectedDraftRevision: 4,
    });
    expect(screen.getByRole("button", { name: "초안으로 가져오기" })).toBeEnabled();
  });

  it.each([
    {
      changedContext: "visibility",
      nextVisibility: "PUBLIC" as const,
      nextDraftRevision: 4,
    },
    {
      changedContext: "draft revision",
      nextVisibility: "MEMBER" as const,
      nextDraftRevision: 5,
    },
  ])(
    "re-previews JSON when shared draft $changedContext changes and blocks a stale commit",
    async ({ nextVisibility, nextDraftRevision }) => {
      const user = userEvent.setup();
      let resolveRepreview!: (value: SessionImportPreviewResponse) => void;
      const repreviewPending = new Promise<SessionImportPreviewResponse>((resolve) => {
        resolveRepreview = resolve;
      });
      const previewSessionImport = vi
        .fn(hostSessionEditorTestActions.previewSessionImport)
        .mockImplementationOnce(hostSessionEditorTestActions.previewSessionImport)
        .mockImplementationOnce(() => repreviewPending);
      const commitSessionImport = vi.fn(hostSessionEditorTestActions.commitSessionImport);
      const initialWorkflow = recordWorkflow("MEMBER");
      const nextWorkflow = recordWorkflow(nextVisibility);
      nextWorkflow.expectedDraftRevision = nextDraftRevision;
      const renderEditor = (workflow: NonNullable<HostSessionEditorProps["recordWorkflow"]>) => (
        <HostSessionEditorForTest
          session={session}
          initialLocation={{ section: "records", source: "json" }}
          recordWorkflow={workflow}
          actions={{
            ...hostSessionEditorTestActions,
            previewSessionImport,
            commitSessionImport,
          }}
        />
      );
      const { rerender } = render(renderEditor(initialWorkflow));

      await user.upload(
        screen.getByLabelText("AI 결과 JSON 가져오기"),
        new File([sessionImportJson()], "session-import.json", { type: "application/json" }),
      );
      await waitFor(() => expect(previewSessionImport).toHaveBeenCalledTimes(1));
      expect(screen.getByRole("button", { name: "초안으로 가져오기" })).toBeEnabled();

      rerender(renderEditor(nextWorkflow));

      await waitFor(() => expect(previewSessionImport).toHaveBeenCalledTimes(2));
      const refreshedRequest = previewSessionImport.mock.calls[1]?.[1];
      expect(refreshedRequest).toMatchObject({
        recordVisibility: nextVisibility,
        expectedDraftRevision: nextDraftRevision,
      });
      expect(screen.getByRole("button", { name: "초안으로 가져오기" })).toBeDisabled();
      await user.click(screen.getByRole("button", { name: "초안으로 가져오기" }));
      expect(commitSessionImport).not.toHaveBeenCalled();

      resolveRepreview(
        await hostSessionEditorTestActions.previewSessionImport(
          session.sessionId,
          refreshedRequest!,
        ),
      );
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "초안으로 가져오기" })).toBeEnabled();
      });
    },
  );

  it("removes a rejected automatic re-preview and clears its error after recovery succeeds", async () => {
    const user = userEvent.setup();
    const previewSessionImport = vi
      .fn(hostSessionEditorTestActions.previewSessionImport)
      .mockImplementationOnce(hostSessionEditorTestActions.previewSessionImport)
      .mockRejectedValueOnce(new Error("preview unavailable"))
      .mockImplementationOnce(hostSessionEditorTestActions.previewSessionImport);
    const initialWorkflow = recordWorkflow("MEMBER");
    const renderEditor = (workflow: NonNullable<HostSessionEditorProps["recordWorkflow"]>) => (
      <HostSessionEditorForTest
        session={session}
        initialLocation={{ section: "records", source: "json" }}
        recordWorkflow={workflow}
        actions={{ ...hostSessionEditorTestActions, previewSessionImport }}
      />
    );
    const { rerender } = render(renderEditor(initialWorkflow));

    await user.upload(
      screen.getByLabelText("AI 결과 JSON 가져오기"),
      new File([sessionImportJson()], "session-import.json", { type: "application/json" }),
    );
    await waitFor(() => expect(previewSessionImport).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("region", { name: "세션 기록 미리보기" })).toBeVisible();

    const failedWorkflow = recordWorkflow("MEMBER");
    failedWorkflow.expectedDraftRevision = 5;
    rerender(renderEditor(failedWorkflow));

    await waitFor(() => expect(previewSessionImport).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "가져온 JSON에서 수정할 항목이 있습니다.",
    );
    expect.soft(screen.queryByRole("region", { name: "세션 기록 미리보기" }))
      .not.toBeInTheDocument();
    expect.soft(screen.getByRole("button", { name: "초안으로 가져오기" })).toBeDisabled();

    const recoveredWorkflow = recordWorkflow("MEMBER");
    recoveredWorkflow.expectedDraftRevision = 6;
    rerender(renderEditor(recoveredWorkflow));

    await waitFor(() => expect(previewSessionImport).toHaveBeenCalledTimes(3));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "초안으로 가져오기" })).toBeEnabled();
    });
    expect(previewSessionImport.mock.calls[2]?.[1]).toMatchObject({
      recordVisibility: "MEMBER",
      expectedDraftRevision: 6,
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "세션 기록 미리보기" })).toBeVisible();
  });

  it("forwards apply-preview pending state to the sticky review action", () => {
    const workflow = recordWorkflow("MEMBER");
    workflow.confirmation.submitting = true;

    render(
      <HostSessionEditorForTest
        session={session}
        initialLocation={{ section: "records", source: "manual" }}
        recordWorkflow={workflow}
      />,
    );

    expect(screen.getByRole("region", { name: "반영 검토 작업" }))
      .toHaveTextContent("반영 검토 준비 중");
    expect(screen.getByRole("button", { name: "반영 검토" })).toBeDisabled();
  });

  it("shows the approved version, visibility, and no-notification apply review", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const workflow = recordWorkflow("MEMBER");
    workflow.confirmation = {
      open: true,
      preview: {
        eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
        changedSections: ["공개 요약", "피드백 문서"],
        liveRevision: 0,
        nextLiveRevision: 1,
        draftRevision: 4,
        visibility: "MEMBER",
      },
      submitting: false,
      message: null,
      onReview: vi.fn(),
      onCancel: vi.fn(),
      onConfirm,
    } as never;

    render(
      <HostSessionEditorForTest
        session={session}
        recordWorkflow={workflow}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "새 버전으로 반영" });
    expect(within(dialog).getByText("공개 요약")).toBeVisible();
    expect(within(dialog).getByText("피드백 문서")).toBeVisible();
    expect(within(dialog).getByText("현재 적용본 없음 → 버전 1")).toBeVisible();
    expect(within(dialog).getByText("공개 범위")).toBeVisible();
    expect(within(dialog).getByText("게스트 공개")).toBeVisible();
    expect(within(dialog).getByText("이 단계에서는 알림을 만들거나 보내지 않습니다")).toBeVisible();
    expect(dialog).not.toHaveTextContent(/revision|live|draft/i);
    expect(within(dialog).queryByRole("radio", { name: /알림/ })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "새 버전으로 반영" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it.each(["Escape", "cancel", "backdrop"] as const)(
    "dismisses the apply dialog with %s without confirming and restores focus",
    async (dismissal) => {
      const user = userEvent.setup();
      const onCancel = vi.fn();
      const onConfirm = vi.fn();
      render(<ApplyDialogDismissHarness onCancel={onCancel} onConfirm={onConfirm} />);
      const trigger = screen.getByRole("button", { name: "반영 대화상자 열기" });
      await user.click(trigger);
      const dialog = screen.getByRole("dialog", { name: "새 버전으로 반영" });
      expect(within(dialog).getByText("버전 2 → 버전 3")).toBeVisible();

      if (dismissal === "Escape") {
        await user.keyboard("{Escape}");
      } else if (dismissal === "cancel") {
        await user.click(within(dialog).getByRole("button", { name: "취소" }));
      } else {
        fireEvent.mouseDown(dialog.parentElement as HTMLElement);
      }

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() => expect(trigger).toHaveFocus());
    },
  );

  it("commits a valid session import preview and refreshes editor state", async () => {
    const user = userEvent.setup();
    const commitSessionImport = vi.fn(hostSessionEditorTestActions.commitSessionImport);
    const workflow = recordWorkflow("MEMBER");

    render(
      <HostSessionEditorForTest
        session={session}
        initialLocation={{ section: "records", source: "json" }}
        actions={{ ...hostSessionEditorTestActions, commitSessionImport }}
        recordWorkflow={workflow}
      />,
    );

    await user.upload(
      screen.getByLabelText("AI 결과 JSON 가져오기"),
      new File([sessionImportJson()], "session-import.json", { type: "application/json" }),
    );
    await user.click(await screen.findByRole("button", { name: "초안으로 가져오기" }));

    await waitFor(() => expect(commitSessionImport).toHaveBeenCalledTimes(1));
    expect(workflow.onDraftCommitted).toHaveBeenCalledWith({
      sessionId: session.sessionId,
      draftRevision: 1,
      baseLiveRevision: 0,
      liveApplied: false,
    });
  });

  it("waits for JSON draft refresh before returning to the focused common editor", async () => {
    const user = userEvent.setup();
    let finishRefresh!: () => void;
    const refreshFinished = new Promise<void>((resolve) => {
      finishRefresh = resolve;
    });
    const commitSessionImport = vi.fn(async (sessionId: string) => ({
      sessionId,
      draftRevision: 2,
      baseLiveRevision: 0,
      liveApplied: false,
    }));
    const onSessionRecordsChanged = vi.fn(() => refreshFinished);
    const workflow = recordWorkflow("MEMBER");

    render(
      <HostSessionEditorForTest
        session={session}
        initialLocation={{ section: "records", source: "json" }}
        actions={{ ...hostSessionEditorTestActions, commitSessionImport }}
        onSessionRecordsChanged={onSessionRecordsChanged}
        recordWorkflow={workflow}
      />,
    );

    await user.upload(
      screen.getByLabelText("AI 결과 JSON 가져오기"),
      new File([sessionImportJson()], "session-import.json", { type: "application/json" }),
    );
    await user.click(await screen.findByRole("button", { name: "초안으로 가져오기" }));

    await waitFor(() => expect(onSessionRecordsChanged).toHaveBeenCalledWith(session.sessionId));
    expect(screen.getByRole("tab", { name: "외부 JSON" })).toHaveAttribute("aria-selected", "true");
    finishRefresh();

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "직접 작성" })).toHaveAttribute("aria-selected", "true");
    });
    expect(screen.getByRole("textbox", { name: "공개 요약" })).toHaveFocus();
    expect(workflow.onDraftCommitted).toHaveBeenCalledWith({
      sessionId: session.sessionId,
      draftRevision: 2,
      baseLiveRevision: 0,
      liveApplied: false,
    });
    expect(screen.queryByRole("region", { name: "세션 기록 초안 저장 결과" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "현재 적용본" })).not.toHaveTextContent("Import summary.");
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

    render(
      <HostSessionEditorForTest
        initialLocation={{ section: "basic", source: "manual" }}
      />,
    );

    await user.clear(screen.getByLabelText("세션 제목"));
    await user.type(screen.getByLabelText("세션 제목"), "7회차 모임 · 새 책");
    await user.type(screen.getByLabelText("책 제목"), "새 책");
    await user.type(screen.getByLabelText("저자"), "새 저자");
    await user.clear(screen.getByLabelText("모임 날짜"));
    await user.type(screen.getByLabelText("모임 날짜"), "2026-05-20");
    await user.clear(screen.getByLabelText("시작 시간"));
    await user.type(screen.getByLabelText("시작 시간"), "19:30");
    await user.click(screen.getByRole("button", { name: "세션 문서 저장" }));

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

    render(
      <HostSessionEditorForTest
        initialLocation={{ section: "basic", source: "manual" }}
      />,
    );

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
    await user.click(screen.getByRole("button", { name: "세션 문서 저장" }));

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

  it("keeps new-session save redirects inside the scoped host route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessionId: "created-session-8" }),
    });
    const location = { href: "", pathname: "/clubs/reading-sai/app/host/sessions/new" };
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", location);
    const user = userEvent.setup();

    render(
      <HostSessionEditorForTest
        initialLocation={{ section: "basic", source: "manual" }}
      />,
    );

    await user.clear(screen.getByLabelText("세션 제목"));
    await user.type(screen.getByLabelText("세션 제목"), "7회차 모임 · 새 책");
    await user.type(screen.getByLabelText("책 제목"), "새 책");
    await user.type(screen.getByLabelText("저자"), "새 저자");
    await user.clear(screen.getByLabelText("모임 날짜"));
    await user.type(screen.getByLabelText("모임 날짜"), "2026-05-20");
    await user.click(screen.getByRole("button", { name: "세션 문서 저장" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(location.href).toBe("/clubs/reading-sai/app/host/sessions/created-session-8/edit");
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

    render(
      <HostSessionEditorForTest
        session={editedSession}
        initialLocation={{ section: "basic", source: "manual" }}
      />,
    );

    expect(screen.getByLabelText("시작 시간")).toHaveValue("19:15");

    await user.clear(screen.getByLabelText("세션 제목"));
    await user.type(screen.getByLabelText("세션 제목"), "6회차 모임 · 수정");
    await user.click(screen.getByRole("button", { name: "기본 정보 저장" }));

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

  it("stays on the scoped edit page after saving an existing session", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const location = {
      href: "/clubs/reading-sai/app/host/sessions/session-1/edit",
      pathname: "/clubs/reading-sai/app/host/sessions/session-1/edit",
    };
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", location);
    const user = userEvent.setup();

    render(
      <HostSessionEditorForTest
        session={session}
        initialLocation={{ section: "basic", source: "manual" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "기본 정보 저장" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/sessions/session-1", expect.anything()));
    expect(location.href).toBe("/clubs/reading-sai/app/host/sessions/session-1/edit");
  });

  it("patches cleared optional book and meeting fields as empty strings", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const location = { href: "" };
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", location);
    const user = userEvent.setup();

    render(
      <HostSessionEditorForTest
        session={session}
        initialLocation={{ section: "basic", source: "manual" }}
      />,
    );

    await user.clear(screen.getByLabelText("책 이미지 URL"));
    await user.clear(screen.getByLabelText("Passcode · 선택"));
    await user.click(screen.getByRole("button", { name: "기본 정보 저장" }));

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

  it("does not label closed public-visibility records as published before lifecycle publish", () => {
    render(
      <HostSessionEditorForTest
        initialLocation={{ section: "attendance", source: "manual" }}
        session={{
          ...session,
          state: "CLOSED",
          publication: {
            publicSummary: "저장된 외부 공개 요약입니다.",
            visibility: "PUBLIC",
          },
        }}
      />,
    );

    expect(screen.getByRole("group", { name: /No\.01 · 지난 회차 · 비공개/ })).toBeVisible();
    expect(screen.queryByRole("group", { name: /No\.01 · 지난 회차 · 공개/ })).not.toBeInTheDocument();
  });

  it("labels published member-visibility records as published in the session identity", () => {
    render(
      <HostSessionEditorForTest
        session={{
          ...session,
          state: "PUBLISHED",
          publication: {
            publicSummary: "멤버에게 공개된 기록입니다.",
            visibility: "MEMBER",
          },
        }}
      />,
    );

    expect(screen.getByRole("group", { name: /No\.01 · 지난 회차 · 공개/ })).toBeVisible();
  });

  it("lets hosts close an open session from the editor", async () => {
    const user = userEvent.setup();
    const closedSession = { ...openSession, state: "CLOSED" as const };
    const closeSession = vi.fn(async () => ({ ok: true as const, session: closedSession }));

    render(
      <HostSessionEditorForTest
        session={openSession}
        actions={{ ...hostSessionEditorTestActions, closeSession }}
      />,
    );

    expect(screen.getByText("모임이 끝났다면 세션을 마감한 뒤 기록을 정리하세요.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "세션 마감" }));
    await user.click(within(screen.getByRole("dialog", { name: "세션 마감" })).getByRole("button", { name: "세션 마감" }));

    expect(closeSession).toHaveBeenCalledWith(openSession.sessionId);
    expect(await screen.findByRole("group", { name: /No\.07 · 지난 회차 · 비공개/ })).toBeVisible();
    expect(screen.getByText("모임은 마감되었습니다. 기록 작업대에서 초안을 검토한 뒤 세션을 공개할 수 있습니다.")).toBeVisible();
    expect(screen.getByRole("button", { name: "세션 공개" })).toBeEnabled();
  });

  it("opens a confirm dialog for 세션 마감 without calling closeSession", async () => {
    const user = userEvent.setup();
    const closeSession = vi.fn();

    render(
      <HostSessionEditorForTest
        session={openSession}
        actions={{ ...hostSessionEditorTestActions, closeSession }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "세션 마감" }));

    expect(screen.getByRole("dialog", { name: "세션 마감" })).toBeVisible();
    expect(closeSession).not.toHaveBeenCalled();
  });

  it("does not close a session when the confirm dialog is cancelled or dismissed", async () => {
    const user = userEvent.setup();
    const closeSession = vi.fn();

    render(
      <HostSessionEditorForTest
        session={openSession}
        actions={{ ...hostSessionEditorTestActions, closeSession }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "세션 마감" }));
    await user.click(screen.getByRole("button", { name: "취소" }));

    expect(screen.queryByRole("dialog", { name: "세션 마감" })).not.toBeInTheDocument();
    expect(closeSession).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "세션 마감" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "세션 마감" })).not.toBeInTheDocument();
    expect(closeSession).not.toHaveBeenCalled();
  });

  it("closes a session only after the confirm dialog is confirmed", async () => {
    const user = userEvent.setup();
    const closeSession = vi.fn(
      async () => ({ ok: true as const, session: { ...openSession, state: "CLOSED" as const } }),
    );

    render(
      <HostSessionEditorForTest
        session={openSession}
        actions={{ ...hostSessionEditorTestActions, closeSession }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "세션 마감" }));
    expect(closeSession).not.toHaveBeenCalled();

    await user.click(within(screen.getByRole("dialog", { name: "세션 마감" })).getByRole("button", { name: "세션 마감" }));

    expect(closeSession).toHaveBeenCalledTimes(1);
    expect(closeSession).toHaveBeenCalledWith(openSession.sessionId);
  });

  it("reopens a closed session after confirming 마감 취소", async () => {
    const user = userEvent.setup();
    const closedSession = { ...session, state: "CLOSED" as const };
    const reopenSession = vi.fn(
      async () => ({ ok: true as const, session: { ...closedSession, state: "OPEN" as const } }),
    );

    render(
      <HostSessionEditorForTest
        session={closedSession}
        actions={{ ...hostSessionEditorTestActions, reopenSession }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "마감 취소" }));
    expect(reopenSession).not.toHaveBeenCalled();

    await user.click(within(screen.getByRole("dialog", { name: "마감 취소" })).getByRole("button", { name: "마감 취소" }));

    expect(reopenSession).toHaveBeenCalledTimes(1);
    expect(reopenSession).toHaveBeenCalledWith(closedSession.sessionId);
  });

  it("keeps the dialog open and links to the other open session on SESSION_OPEN_ALREADY_EXISTS", async () => {
    const user = userEvent.setup();
    const closedSession = { ...session, state: "CLOSED" as const };
    const openSessionId = "00000000-0000-0000-0000-000000000307";
    const reopenSession = vi.fn(
      async () => ({
        ok: false as const,
        message: openAlreadyExistsMessage(),
        openSessionId,
      }),
    );

    render(
      <HostSessionEditorForTest
        session={closedSession}
        clubSlug="club-a"
        actions={{ ...hostSessionEditorTestActions, reopenSession }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "마감 취소" }));
    await user.click(within(screen.getByRole("dialog", { name: "마감 취소" })).getByRole("button", { name: "마감 취소" }));

    const dialog = await screen.findByRole("dialog", { name: "마감 취소" });
    expect(dialog).toBeVisible();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(openAlreadyExistsMessage());
    expect(within(dialog).getByRole("link", { name: "진행 중인 세션 열기" })).toHaveAttribute(
      "href",
      `/clubs/club-a/app/host/sessions/${openSessionId}/edit`,
    );
    expect(reopenSession).toHaveBeenCalledTimes(1);
  });

  it("unpublishes a published session after confirming 공개 취소", async () => {
    const user = userEvent.setup();
    const publishedSession = { ...session, state: "PUBLISHED" as const };
    const unpublishSession = vi.fn(
      async () => ({ ok: true as const, session: { ...publishedSession, state: "CLOSED" as const } }),
    );

    render(
      <HostSessionEditorForTest
        session={publishedSession}
        actions={{ ...hostSessionEditorTestActions, unpublishSession }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "공개 취소" }));
    expect(unpublishSession).not.toHaveBeenCalled();

    await user.click(within(screen.getByRole("dialog", { name: "공개 취소" })).getByRole("button", { name: "공개 취소" }));

    expect(unpublishSession).toHaveBeenCalledTimes(1);
    expect(unpublishSession).toHaveBeenCalledWith(publishedSession.sessionId);
  });

  it("returns an open session to draft after confirming 예정으로 되돌리기", async () => {
    const user = userEvent.setup();
    const returnSessionToDraft = vi.fn(
      async () => ({ ok: true as const, session: { ...openSession, state: "DRAFT" as const } }),
    );

    render(
      <HostSessionEditorForTest
        session={openSession}
        actions={{ ...hostSessionEditorTestActions, returnSessionToDraft }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "예정으로 되돌리기" }));
    expect(returnSessionToDraft).not.toHaveBeenCalled();

    await user.click(
      within(screen.getByRole("dialog", { name: "예정으로 되돌리기" })).getByRole("button", { name: "예정으로 되돌리기" }),
    );

    expect(returnSessionToDraft).toHaveBeenCalledTimes(1);
    expect(returnSessionToDraft).toHaveBeenCalledWith(openSession.sessionId);
  });

  it("publishes the applied record through the session publish action", async () => {
    const user = userEvent.setup();
    const closedSession = { ...session, state: "CLOSED" as const, publication: null };
    const publishSession = vi.fn(
      async () => ({
        ok: true as const,
        session: {
          ...closedSession,
          state: "PUBLISHED" as const,
          publication: {
            publicSummary: "현재 적용본 요약입니다.",
            visibility: "MEMBER" as const,
          },
        },
      }),
    );
    const workflow = recordWorkflow("MEMBER");
    workflow.editor.liveRevision = 3;
    workflow.editor.liveSnapshot = {
      ...workflow.editor.liveSnapshot,
      visibility: "MEMBER",
      publicationSummary: "현재 적용본 요약입니다.",
    };

    render(
      <HostSessionEditorForTest
        session={closedSession}
        recordWorkflow={workflow}
        actions={{ ...hostSessionEditorTestActions, publishSession }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "세션 공개" }));
    await user.click(within(screen.getByRole("dialog", { name: "세션 공개" })).getByRole("button", { name: "세션 공개" }));

    expect(publishSession).toHaveBeenCalledWith(closedSession.sessionId);
    expect(await screen.findByRole("group", { name: /No\.01 · 지난 회차 · 공개/ })).toBeVisible();
    expect(await screen.findByRole("status")).toHaveTextContent("세션을 공개했습니다.");
  });

  it("disables publication actions for unsaved new sessions and explains why", () => {
    render(
      <HostSessionEditorForTest
        initialLocation={{ section: "records", source: "manual" }}
      />,
    );

    expect(screen.getByText("기본 정보를 저장한 뒤 기록 작업대를 사용할 수 있습니다.")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "기록 공개 범위" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "저장" })).not.toBeInTheDocument();
  });

  it("persists attendance toggles for the edited session and updates selected state", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <HostSessionEditorForTest
        session={session}
        initialLocation={{ section: "attendance", source: "manual" }}
      />,
    );

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
        initialLocation={{ section: "attendance", source: "manual" }}
        session={{
          ...session,
          attendees: [
            ...session.attendees,
            {
              membershipId: "membership-removed",
              avatarKey: "cloud-green-book",
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
        initialLocation={{ section: "attendance", source: "manual" }}
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
        initialLocation={{ section: "attendance", source: "manual" }}
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
        initialLocation={{ section: "attendance", source: "manual" }}
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

    render(
      <HostSessionEditorForTest
        session={session}
        initialLocation={{ section: "attendance", source: "manual" }}
      />,
    );

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

    render(
      <HostSessionEditorForTest
        session={openSession}
        initialLocation={{ section: "basic", source: "manual" }}
      />,
    );

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

  it("keeps delete redirects inside the scoped host route", async () => {
    const location = { href: "", pathname: "/clubs/reading-sai/app/host/sessions/open-session-7/edit" };
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

    render(
      <HostSessionEditorForTest
        session={openSession}
        initialLocation={{ section: "basic", source: "manual" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "세션 삭제" }));
    const dialog = await screen.findByRole("dialog", { name: "이 세션을 삭제할까요?" });
    await user.click(within(dialog).getByRole("button", { name: "세션 삭제" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(location.href).toBe("/clubs/reading-sai/app/host/sessions/new");
  });

  it("keeps keyboard focus inside the delete modal and restores focus when Escape closes", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(deletionPreview),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <HostSessionEditorForTest
        session={openSession}
        initialLocation={{ section: "basic", source: "manual" }}
      />,
    );

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
    render(
      <HostSessionEditorForTest
        session={session}
        initialLocation={{ section: "basic", source: "manual" }}
      />,
    );

    expect(screen.getByRole("button", { name: "세션 삭제" })).toBeDisabled();
  });

  it("shows a preview failure message and does not send delete", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 409 });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <HostSessionEditorForTest
        session={openSession}
        initialLocation={{ section: "basic", source: "manual" }}
      />,
    );

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

    render(
      <HostSessionEditorForTest
        session={openSession}
        initialLocation={{ section: "basic", source: "manual" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "세션 삭제" }));
    await screen.findByText("참석 대상");
    const dialog = screen.getByRole("dialog", { name: "이 세션을 삭제할까요?" });
    await user.click(within(dialog).getByRole("button", { name: "세션 삭제" }));

    expect(await screen.findByText("세션 삭제에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.")).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
  });

  describe("record source navigation", () => {
    it("exposes source tab relationships only while their lazy panels are mounted", async () => {
      const user = userEvent.setup();
      render(
        <HostSessionEditorForTest
          session={session}
          clubSlug="club-a"
          initialLocation={{ section: "records", source: "manual" }}
          recordWorkflow={recordWorkflow("MEMBER")}
        />,
      );

      const sourceTabs = screen.getByRole("tablist", { name: "초안 만들기" });
      const manualTab = within(sourceTabs).getByRole("tab", { name: "직접 작성" });
      const aiTab = within(sourceTabs).getByRole("tab", { name: "AI로 생성" });
      const jsonTab = within(sourceTabs).getByRole("tab", { name: "외부 JSON" });

      expect(manualTab).toHaveAttribute("aria-controls", "host-editor-record-source-panel-manual");
      expect(document.getElementById("host-editor-record-source-panel-manual")).not.toBeNull();
      expect(aiTab).not.toHaveAttribute("aria-controls");
      expect(document.getElementById("host-editor-record-source-panel-ai")).toBeNull();
      expect(jsonTab).not.toHaveAttribute("aria-controls");
      expect(document.getElementById("host-editor-record-source-panel-json")).toBeNull();

      await user.click(aiTab);
      expect(aiTab).toHaveAttribute("aria-controls", "host-editor-record-source-panel-ai");
      expect(document.getElementById("host-editor-record-source-panel-ai")).not.toBeNull();
      expect(jsonTab).not.toHaveAttribute("aria-controls");

      await user.click(jsonTab);
      expect(jsonTab).toHaveAttribute("aria-controls", "host-editor-record-source-panel-json");
      expect(document.getElementById("host-editor-record-source-panel-json")).not.toBeNull();
      expect(manualTab).toHaveAttribute("aria-controls", "host-editor-record-source-panel-manual");
      expect(aiTab).toHaveAttribute("aria-controls", "host-editor-record-source-panel-ai");
    });

    it("keeps an enabled roving focus target when controlled AI selection is disabled", async () => {
      const user = userEvent.setup();
      render(
        <HostSessionEditorForTest
          session={session}
          initialLocation={{ section: "records", source: "ai" }}
          recordWorkflow={recordWorkflow("MEMBER")}
        />,
      );

      const sourceTabs = screen.getByRole("tablist", { name: "초안 만들기" });
      const manualTab = within(sourceTabs).getByRole("tab", { name: "직접 작성" });
      const aiTab = within(sourceTabs).getByRole("tab", { name: "AI로 생성" });
      const jsonTab = within(sourceTabs).getByRole("tab", { name: "외부 JSON" });

      expect(aiTab).toBeDisabled();
      expect(aiTab).toHaveAttribute("aria-selected", "true");
      expect(aiTab).toHaveAttribute("tabindex", "-1");
      expect(manualTab).toBeEnabled();
      expect(manualTab).toHaveAttribute("tabindex", "0");
      expect(jsonTab).toHaveAttribute("tabindex", "-1");

      manualTab.focus();
      await user.keyboard("{ArrowRight}");

      expect(jsonTab).toHaveFocus();
      expect(jsonTab).toHaveAttribute("aria-selected", "true");
      expect(jsonTab).toHaveAttribute("tabindex", "0");
    });

    it("links each record source tab to a source-labelled panel with roving tab stops", () => {
      render(
        <HostSessionEditorForTest
          session={session}
          clubSlug="club-a"
          initialLocation={{ section: "records", source: "manual" }}
          recordWorkflow={recordWorkflow("MEMBER")}
        />,
      );

      const sourceTabs = screen.getByRole("tablist", { name: "초안 만들기" });
      const manualTab = within(sourceTabs).getByRole("tab", { name: "직접 작성" });
      const aiTab = within(sourceTabs).getByRole("tab", { name: "AI로 생성" });
      const jsonTab = within(sourceTabs).getByRole("tab", { name: "외부 JSON" });

      expect(manualTab).toHaveAttribute("id", "host-editor-record-source-tab-manual");
      expect(manualTab).toHaveAttribute("aria-controls", "host-editor-record-source-panel-manual");
      expect(manualTab).toHaveAttribute("tabindex", "0");
      expect(aiTab).toHaveAttribute("tabindex", "-1");
      expect(jsonTab).toHaveAttribute("tabindex", "-1");
      expect(screen.getByRole("tabpanel", { name: "직접 작성" })).toHaveAttribute(
        "id",
        "host-editor-record-source-panel-manual",
      );
    });

    it("moves record source selection and focus with arrow, Home, and End keys", async () => {
      const user = userEvent.setup();
      render(
        <HostSessionEditorForTest
          session={session}
          clubSlug="club-a"
          initialLocation={{ section: "records", source: "manual" }}
          recordWorkflow={recordWorkflow("MEMBER")}
        />,
      );

      const sourceTabs = screen.getByRole("tablist", { name: "초안 만들기" });
      const manualTab = within(sourceTabs).getByRole("tab", { name: "직접 작성" });
      const aiTab = within(sourceTabs).getByRole("tab", { name: "AI로 생성" });
      const jsonTab = within(sourceTabs).getByRole("tab", { name: "외부 JSON" });

      manualTab.focus();
      await user.keyboard("{ArrowRight}");
      expect(aiTab).toHaveFocus();
      expect(aiTab).toHaveAttribute("aria-selected", "true");
      expect(aiTab).toHaveAttribute("tabindex", "0");
      expect(screen.getByRole("tabpanel", { name: "AI로 생성" })).toBeVisible();

      await user.keyboard("{End}");
      expect(jsonTab).toHaveFocus();
      expect(jsonTab).toHaveAttribute("aria-selected", "true");

      await user.keyboard("{Home}");
      expect(manualTab).toHaveFocus();
      expect(manualTab).toHaveAttribute("aria-selected", "true");
    });

    it("mounts only the selected AI source on first visit", () => {
      render(
        <HostSessionEditorForTest
          session={session}
          clubSlug="club-a"
          initialLocation={{ section: "records", source: "ai" }}
        />,
      );

      expect(screen.getByRole("tab", { name: "AI로 생성" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId("aigen-tab")).toBeVisible();
      expect(screen.queryByLabelText("AI 결과 JSON 가져오기")).not.toBeInTheDocument();
    });

    it("keeps a visited AI source mounted but hidden after switching to JSON", async () => {
      const user = userEvent.setup();
      render(
        <HostSessionEditorForTest
          session={session}
          clubSlug="club-a"
          initialLocation={{ section: "records", source: "ai" }}
        />,
      );

      await user.click(screen.getByRole("tab", { name: "외부 JSON" }));

      expect(screen.getByLabelText("AI 결과 JSON 가져오기")).toBeVisible();
      expect(screen.getByTestId("aigen-tab")).not.toBeVisible();
    });

    it("keeps a visited AI review surface mounted across editor sections", async () => {
      const user = userEvent.setup();
      render(
        <HostSessionEditorForTest
          session={session}
          clubSlug="club-a"
          initialLocation={{ section: "records", source: "ai" }}
          recordWorkflow={recordWorkflow("MEMBER")}
        />,
      );

      const aiWorkspace = screen.getByTestId("aigen-tab");
      await user.click(screen.getByRole("tab", { name: "기본 정보" }));
      expect(aiWorkspace).not.toBeVisible();
      await user.click(screen.getByRole("tab", { name: "기록 작업대" }));

      expect(screen.getByTestId("aigen-tab")).toBe(aiWorkspace);
      expect(aiWorkspace).not.toBeVisible();
      await user.click(screen.getByRole("tab", { name: "AI로 생성" }));
      expect(aiWorkspace).toBeVisible();
    });

    it("mounts only the selected JSON source on first visit", () => {
      render(
        <HostSessionEditorForTest
          session={session}
          clubSlug="club-a"
          initialLocation={{ section: "records", source: "json" }}
        />,
      );

      expect(screen.getByRole("tab", { name: "외부 JSON" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByLabelText("AI 결과 JSON 가져오기")).toBeVisible();
      expect(screen.queryByTestId("aigen-tab")).not.toBeInTheDocument();
    });

    it("keeps a visited JSON source mounted but hidden after switching to AI", async () => {
      const user = userEvent.setup();
      render(
        <HostSessionEditorForTest
          session={session}
          clubSlug="club-a"
          initialLocation={{ section: "records", source: "json" }}
        />,
      );

      await user.click(screen.getByRole("tab", { name: "AI로 생성" }));

      expect(screen.getByTestId("aigen-tab")).toBeVisible();
      expect(screen.getByLabelText("AI 결과 JSON 가져오기", { selector: "input" })).not.toBeVisible();
    });

    it("waits for AI draft refresh before returning to the focused common editor without reloading", async () => {
      const user = userEvent.setup();
      const reload = vi.fn();
      let finishRefresh!: () => void;
      const refreshFinished = new Promise<void>((resolve) => {
        finishRefresh = resolve;
      });
      const onSessionRecordsChanged = vi.fn(() => refreshFinished);
      const workflow = recordWorkflow("MEMBER");
      const onDraftCommitted = vi.fn().mockResolvedValue(undefined);
      workflow.onDraftCommitted = onDraftCommitted;
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: {
          ...window.location,
          reload,
        },
      });

      render(
        <HostSessionEditorForTest
          session={session}
          clubSlug="club-a"
          initialLocation={{ section: "records", source: "ai" }}
          onSessionRecordsChanged={onSessionRecordsChanged}
          recordWorkflow={workflow}
        />,
      );

      await user.click(screen.getByRole("button", { name: "simulate AI commit" }));

      expect(reload).not.toHaveBeenCalled();
      await waitFor(() => expect(onSessionRecordsChanged).toHaveBeenCalledWith(session.sessionId));
      expect(screen.getByRole("tab", { name: "AI로 생성" })).toHaveAttribute("aria-selected", "true");
      expect(onDraftCommitted).toHaveBeenCalledWith({
        draftRevision: 5,
        baseLiveRevision: 0,
        liveApplied: false,
      });
      finishRefresh();
      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "직접 작성" })).toHaveAttribute("aria-selected", "true");
      });
      expect(screen.getByRole("textbox", { name: "공개 요약" })).toHaveFocus();
      expect(screen.getByRole("region", { name: "현재 적용본" }))
        .not.toHaveTextContent("공유 초안 요약");
      expect(screen.queryByRole("dialog", {
        name: "멤버에게 알림을 보낼까요?",
      })).not.toBeInTheDocument();
    });

    it("does not mount a heavy source for a not-yet-created session", () => {
      render(
        <HostSessionEditorForTest
          session={null}
          clubSlug="club-a"
          initialLocation={{ section: "records", source: "ai" }}
        />,
      );

      expect(screen.queryByTestId("aigen-tab")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("AI 결과 JSON 가져오기")).not.toBeInTheDocument();
    });
  });
});
