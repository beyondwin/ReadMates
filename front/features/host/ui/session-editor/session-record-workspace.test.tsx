import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionImportPreviewResponse } from "@/features/host/model/host-view-types";
import type { SessionImportCommitResult } from "@/features/host/model/session-import-model";
import type { HostSessionDraftSource } from "@/features/host/model/host-session-workspace-navigation";
import type { HostSessionEditorLinkComponent } from "./session-editor-links";
import {
  SessionRecordWorkspace,
  type SessionRecordWorkspaceProps,
} from "./session-record-workspace";

vi.mock("@/features/host/aigen/ui/AiGenerateTab", () => ({
  AiGenerateTab: ({
    onCommitted,
  }: {
    onCommitted: (result: {
      sessionId: string;
      status: "COMMITTED";
      recovered: boolean;
      participantUpdatesCount: number | null;
      draftRevision: number;
      baseLiveRevision: number;
      liveApplied: boolean;
    }) => void;
  }) => (
    <div data-testid="aigen-workspace">
      <button
        type="button"
        onClick={() => onCommitted({
          sessionId: "session-1",
          status: "COMMITTED",
          recovered: false,
          participantUpdatesCount: null,
          draftRevision: 5,
          baseLiveRevision: 0,
          liveApplied: false,
        })}
      >
        AI 초안 저장 완료
      </button>
    </div>
  ),
}));

const liveSnapshot = {
  schema: "readmates-session-record:v1" as const,
  visibility: "HOST_ONLY" as const,
  publicationSummary: "현재 멤버 화면에 적용된 요약",
  highlights: [],
  oneLineReviews: [],
  feedbackDocument: {
    fileName: "currently-applied.md",
    title: "현재 적용 문서",
    markdown: "# 현재 적용 문서",
  },
};

const draftSnapshot = {
  ...liveSnapshot,
  visibility: "MEMBER" as const,
  publicationSummary: "아직 반영하지 않은 초안 요약",
  feedbackDocument: {
    fileName: "draft-document-with-a-very-long-file-name-that-must-wrap.md",
    title: "작업 중인 문서",
    markdown: "# 작업 중인 문서\n\nhttps://example.com/a/very/long/path/that/must/not/overflow",
  },
};

const importPreview: SessionImportPreviewResponse = {
  valid: true,
  session: { sessionNumber: 7, bookTitle: "테스트 책", meetingDate: "2026-05-16" },
  publication: { summary: "JSON 검토 중인 요약" },
  highlights: [],
  oneLineReviews: [],
  feedbackDocument: {
    fileName: "import-preview.md",
    title: "가져올 문서",
    valid: true,
  },
  issues: [],
};

const importCommitResult: SessionImportCommitResult = {
  tone: "success",
  title: "초안 저장 완료",
  message: "가져온 세션 기록을 공유 초안으로 저장했습니다.",
  visibilityLabel: "게스트 공개",
  items: ["공개 요약 초안 교체"],
  nextAction: "공통 초안을 검토해 주세요.",
};

const TestLinkComponent: HostSessionEditorLinkComponent = ({
  to,
  state: _state,
  children,
  ...props
}) => {
  void _state;
  return <a {...props} href={to}>{children}</a>;
};

afterEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
});

function props(
  overrides: Partial<SessionRecordWorkspaceProps> = {},
): SessionRecordWorkspaceProps {
  return {
    state: "CLOSED",
    accessScope: "GUEST_READABLE",
    siteVisibility: "HIDDEN",
    source: "manual",
    onSourceChange: vi.fn(),
    liveRevision: 0,
    liveSnapshot,
    draft: {
      snapshot: draftSnapshot,
      source: "MANUAL",
      updatedAt: "2026-07-27T10:00:00+09:00",
      saveState: "saved",
      validationIssues: [],
      liveBaseStale: false,
      rebasePending: false,
      rebaseError: null,
    },
    reviewPending: false,
    feedbackDocument: {
      uploaded: true,
      fileName: "currently-applied.md",
      previewState: undefined,
      LinkComponent: TestLinkComponent,
    },
    creation: {
      sessionId: "session-1",
      clubSlug: "club-a",
      expectedDraftRevision: 4,
      importPreview,
      importCommitResult: null,
      importStatus: "ready",
      importError: null,
    },
    actions: {
      onSnapshotChange: vi.fn(),
      onReloadDraft: vi.fn(),
      onRebaseDraft: vi.fn(),
      onCopyInput: vi.fn(),
      onReviewDraft: vi.fn(),
      onAigenCommitted: vi.fn(),
      onImportFileSelected: vi.fn(),
      onImportCommit: vi.fn(),
    },
    ...overrides,
  };
}

describe("SessionRecordWorkspace", () => {
  it("separates the current applied record, working draft, and next action without internal revision language", () => {
    render(<SessionRecordWorkspace {...props()} />);

    const applied = screen.getByRole("region", { name: "멤버에게 보이는 기록" });
    const draft = screen.getByRole("region", { name: "작성 중" });
    const next = screen.getByRole("region", { name: "다음 할 일" });
    const sourceTabs = screen.getByRole("tablist", { name: "초안 만들기" });

    expect(within(applied).getByText("현재 멤버 화면에 적용된 요약")).toBeVisible();
    expect(within(applied).queryByText("아직 반영하지 않은 초안 요약")).not.toBeInTheDocument();
    expect(within(applied).getByText("업로드 완료")).toBeVisible();
    expect(within(applied).getByRole("link", { name: "피드백 문서 미리보기" }))
      .toHaveAttribute(
        "href",
        "/clubs/club-a/app/host/sessions/session-1/feedback-document",
      );
    expect(within(draft).getByText("저장됨")).toBeVisible();
    expect(within(draft).getByText("초안 문서")).toBeVisible();
    expect(within(draft).getByText("2026.07.27 10:00")).toHaveAttribute(
      "datetime",
      "2026-07-27T10:00:00+09:00",
    );
    expect(within(draft).getByText(draftSnapshot.feedbackDocument.fileName)).toBeVisible();
    expect(within(next).queryByRole("button", { name: "반영 검토" })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "반영 전 확인" }))
        .getByRole("button", { name: "반영 전 확인" }),
    ).toBeEnabled();
    expect(screen.getByText("다른 방법")).toBeVisible();
    expect(within(sourceTabs).getByRole("tab", { name: "직접 작성" })).toBeVisible();
    expect(within(sourceTabs).getByRole("tab", { name: "AI로 생성" })).toBeVisible();
    expect(within(sourceTabs).getByRole("tab", { name: "정리본 올리기" })).toBeVisible();
    expect(within(sourceTabs).queryByRole("tab", { name: "외부 JSON" })).not.toBeInTheDocument();
    expect(within(applied).getByText("이전 적용본")).toBeVisible();
    expect(screen.queryByText("버전 0")).not.toBeInTheDocument();
    expect(screen.queryByText("세션 기록 완성")).not.toBeInTheDocument();
    expect(screen.queryByText("공개 기록 초안")).not.toBeInTheDocument();
    expect(screen.queryByText(/live revision/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/draft revision/i)).not.toBeInTheDocument();
  });

  it("shows the missing feedback document state in the applied and common draft context", () => {
    render(
      <SessionRecordWorkspace
        {...props({
          liveSnapshot: {
            ...liveSnapshot,
            feedbackDocument: { fileName: "", title: "", markdown: "" },
          },
          draft: {
            ...props().draft,
            snapshot: {
              ...draftSnapshot,
              feedbackDocument: { fileName: "", title: "", markdown: "" },
            },
          },
          feedbackDocument: {
            uploaded: false,
            fileName: null,
            previewState: undefined,
            LinkComponent: TestLinkComponent,
          },
        })}
      />,
    );

    expect(screen.getByRole("region", { name: "멤버에게 보이는 기록" })).toHaveTextContent("미등록");
    expect(screen.getByRole("region", { name: "작성 중" })).toHaveTextContent(
      "초안 문서 없음",
    );
    expect(screen.queryByRole("link", { name: "피드백 문서 미리보기" }))
      .not.toBeInTheDocument();
  });

  it("keeps one compact primary review action in a bottom sticky action bar", () => {
    render(<SessionRecordWorkspace {...props()} />);

    const stickyAction = screen.getByRole("region", { name: "반영 전 확인" });
    expect(stickyAction).toHaveClass("rm-session-record-workspace__sticky-action");
    expect(stickyAction).toHaveStyle({ position: "sticky", bottom: "8px" });
    expect(stickyAction).toHaveTextContent("저장된 초안을 반영 전에 검토해 주세요");
    expect(screen.getAllByRole("button", { name: "반영 전 확인" })).toHaveLength(1);
    expect(within(stickyAction).getByRole("button", { name: "반영 전 확인" })).toBeEnabled();
  });

  it.each([
    { width: 390, source: "ai" as const, sourceLabel: "AI로 생성" },
    { width: 320, source: "json" as const, sourceLabel: "정리본 올리기" },
  ])(
    "orders status, $sourceLabel creation controls, and creation panel at $width px",
    ({ width, source, sourceLabel }) => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      window.dispatchEvent(new Event("resize"));

      render(<SessionRecordWorkspace {...props({ source })} />);

      const appliedStatus = screen.getByRole("region", { name: "멤버에게 보이는 기록" });
      const creationHeading = screen.getByRole("heading", { name: /정리본을 올리거나 다른 방법으로 작성하세요|시작 방법을 선택하세요/ });
      const creationPanel = screen.getByRole("tabpanel", { name: sourceLabel });
      const follows = (earlier: Element, later: Element) =>
        Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);

      expect(follows(appliedStatus, creationHeading)).toBe(true);
      expect(follows(creationHeading, creationPanel)).toBe(true);
      expect(creationPanel).toHaveClass("rm-session-record-workspace__creation-panel");
      if (source === "json") {
        expect(screen.queryByLabelText(/Markdown/i)).not.toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "공통 초안 편집기" })).not.toBeInTheDocument();
      } else {
        expect(screen.getByRole("region", { name: "공통 초안 편집기" })).toBeInTheDocument();
      }
    },
  );

  it("disables review while the apply preview is pending and ignores rapid repeat activation", async () => {
    const user = userEvent.setup();
    const onReviewDraft = vi.fn();
    const ready = props({
      actions: {
        ...props().actions,
        onReviewDraft,
      },
    });
    const { rerender } = render(<SessionRecordWorkspace {...ready} />);

    await user.click(screen.getByRole("button", { name: "반영 전 확인" }));
    expect(onReviewDraft).toHaveBeenCalledTimes(1);

    rerender(<SessionRecordWorkspace {...ready} reviewPending />);
    expect(screen.getByRole("region", { name: "반영 전 확인" }))
      .toHaveTextContent("반영 전 확인 준비 중");
    expect(screen.getByRole("button", { name: "반영 전 확인" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "반영 전 확인" }));
    expect(onReviewDraft).toHaveBeenCalledTimes(1);
  });

  it("forwards rebase pending and error state to the common draft editor", () => {
    const onRebaseDraft = vi.fn();
    const pending = props({
      draft: {
        ...props().draft,
        liveBaseStale: true,
        rebasePending: true,
        rebaseError: null,
      },
      actions: {
        ...props().actions,
        onRebaseDraft,
      },
    });
    const { rerender } = render(<SessionRecordWorkspace {...pending} />);

    expect(screen.getByRole("button", { name: "최신 정보 확인 중…" })).toBeDisabled();

    rerender(
      <SessionRecordWorkspace
        {...pending}
        draft={{
          ...pending.draft,
          rebasePending: false,
          rebaseError: "최신 적용본을 불러오지 못했습니다.",
        }}
      />,
    );
    expect(screen.getByText("최신 적용본을 불러오지 못했습니다.")).toBeVisible();
    expect(screen.getByRole("button", { name: "최신 정보 확인 완료" })).toBeEnabled();
  });

  it("keeps the common draft editor and visited AI/JSON review surfaces mounted across source changes", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [source, setSource] = useState<HostSessionDraftSource>("manual");
      const [snapshot, setSnapshot] = useState(draftSnapshot);
      return (
        <SessionRecordWorkspace
          {...props({
            source,
            onSourceChange: setSource,
            draft: {
              ...props().draft,
              snapshot,
            },
            actions: {
              ...props().actions,
              onSnapshotChange: (nextSnapshot) => setSnapshot(nextSnapshot),
            },
          })}
        />
      );
    }

    render(<Harness />);
    const summary = screen.getByRole("textbox", { name: "공개 요약" });
    await user.clear(summary);
    await user.type(summary, "source를 바꿔도 유지할 입력");

    await user.click(screen.getByRole("tab", { name: "AI로 생성" }));
    const aiWorkspace = screen.getByTestId("aigen-workspace");
    await user.click(screen.getByRole("tab", { name: "정리본 올리기" }));
    const jsonReview = screen.getByRole("region", { name: "정리본 미리보기" });
    expect(aiWorkspace).not.toBeVisible();

    await user.click(screen.getByRole("tab", { name: "직접 작성" }));
    expect(screen.getByRole("textbox", { name: "공개 요약" }))
      .toHaveValue("source를 바꿔도 유지할 입력");
    await user.click(screen.getByRole("tab", { name: "정리본 올리기" }));
    expect(screen.getByRole("region", { name: "정리본 미리보기" })).toBe(jsonReview);
    await user.click(screen.getByRole("tab", { name: "AI로 생성" }));
    expect(screen.getByTestId("aigen-workspace")).toBe(aiWorkspace);
  });

  it.each([
    {
      name: "missing draft",
      draft: { source: null, saveState: "saved" as const, validationIssues: [], liveBaseStale: false },
      guidance: "초안을 먼저 만들어 주세요",
    },
    {
      name: "saving",
      draft: { source: "MANUAL" as const, saveState: "saving" as const, validationIssues: [], liveBaseStale: false },
      guidance: "저장 중",
    },
    {
      name: "save error",
      draft: { source: "MANUAL" as const, saveState: "error" as const, validationIssues: [], liveBaseStale: false },
      guidance: "저장 실패 후 다시 시도해 주세요",
    },
    {
      name: "stale",
      draft: { source: "MANUAL" as const, saveState: "saved" as const, validationIssues: [], liveBaseStale: true },
      guidance: "최신 적용본 확인",
    },
  ])("blocks review for $name", ({ draft, guidance }) => {
    render(
      <SessionRecordWorkspace
        {...props({
          draft: {
            ...props().draft,
            ...draft,
          },
        })}
      />,
    );

    expect(screen.getByRole("region", { name: "다음 할 일" })).toHaveTextContent(guidance);
    expect(screen.getByRole("button", { name: "반영 전 확인" })).toBeDisabled();
  });

  it("links the first validation error and enables review only after a valid saved draft", () => {
    const initial = props({
      draft: {
        ...props().draft,
        validationIssues: ["SUMMARY_REQUIRED", "FEEDBACK_DOCUMENT_INVALID"],
      },
    });
    const { rerender } = render(<SessionRecordWorkspace {...initial} />);

    expect(screen.getByRole("link", { name: "첫 오류 확인" }))
      .toHaveAttribute("href", "#session-record-summary");
    expect(screen.getByRole("button", { name: "반영 전 확인" })).toBeDisabled();

    rerender(<SessionRecordWorkspace {...props()} />);
    expect(screen.queryByRole("link", { name: "첫 오류 확인" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "반영 전 확인" })).toBeEnabled();
  });

  it("waits for an AI draft refresh before returning to the common editor without changing the applied preview", async () => {
    const user = userEvent.setup();
    let resolveCommit!: () => void;
    const commitFinished = new Promise<void>((resolve) => {
      resolveCommit = resolve;
    });
    const onAigenCommitted = vi.fn(() => commitFinished);

    function Harness() {
      const [source, setSource] = useState<HostSessionDraftSource>("ai");
      return (
        <SessionRecordWorkspace
          {...props({
            source,
            onSourceChange: setSource,
            actions: {
              ...props().actions,
              onAigenCommitted,
            },
          })}
        />
      );
    }

    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "AI 초안 저장 완료" }));

    expect(onAigenCommitted).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("tab", { name: "AI로 생성" })).toHaveAttribute("aria-selected", "true");
    resolveCommit();

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "직접 작성" })).toHaveAttribute("aria-selected", "true");
    });
    expect(screen.getByRole("textbox", { name: "공개 요약" })).toHaveFocus();
    expect(screen.getByRole("region", { name: "멤버에게 보이는 기록" }))
      .toHaveTextContent("현재 멤버 화면에 적용된 요약");
  });

  it("opens apply review after a committed package instead of showing filename and Markdown fields", async () => {
    const user = userEvent.setup();
    const onReviewDraft = vi.fn();

    function Harness() {
      const [source, setSource] = useState<HostSessionDraftSource>("json");
      const [commitResult, setCommitResult] = useState<SessionImportCommitResult | null>(null);
      return (
        <SessionRecordWorkspace
          {...props({
            source,
            onSourceChange: setSource,
            creation: {
              ...props().creation,
              importCommitResult: commitResult,
            },
            actions: {
              ...props().actions,
              onReviewDraft,
              onImportCommit: () => setCommitResult(importCommitResult),
            },
          })}
        />
      );
    }

    render(<Harness />);
    expect(screen.queryByLabelText(/Markdown/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("피드백 파일 이름")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "작성 중에 넣기" }));

    expect(onReviewDraft).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "정리본 올리기" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("region", { name: "세션 기록 초안 저장 결과" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "멤버에게 보이는 기록" }))
      .toHaveTextContent("현재 멤버 화면에 적용된 요약");
  });
});
