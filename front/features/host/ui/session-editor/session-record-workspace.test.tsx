import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { SessionImportPreviewResponse } from "@/features/host/model/host-view-types";
import type { SessionImportCommitResult } from "@/features/host/model/session-import-model";
import type { HostSessionDraftSource } from "@/features/host/model/host-session-editor-navigation";
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
  visibilityLabel: "멤버 공개",
  items: ["공개 요약 초안 교체"],
  nextAction: "공통 초안을 검토해 주세요.",
};

function props(
  overrides: Partial<SessionRecordWorkspaceProps> = {},
): SessionRecordWorkspaceProps {
  return {
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

    const applied = screen.getByRole("region", { name: "현재 적용본" });
    const draft = screen.getByRole("region", { name: "작업 중인 초안" });
    const next = screen.getByRole("region", { name: "다음 할 일" });
    const sourceTabs = screen.getByRole("tablist", { name: "초안 만들기" });

    expect(within(applied).getByText("현재 멤버 화면에 적용된 요약")).toBeVisible();
    expect(within(applied).queryByText("아직 반영하지 않은 초안 요약")).not.toBeInTheDocument();
    expect(within(draft).getByText("저장됨")).toBeVisible();
    expect(within(next).getByRole("button", { name: "반영 검토" })).toBeEnabled();
    expect(within(sourceTabs).getByRole("tab", { name: "직접 작성" })).toBeVisible();
    expect(within(sourceTabs).getByRole("tab", { name: "AI로 생성" })).toBeVisible();
    expect(within(sourceTabs).getByRole("tab", { name: "외부 JSON" })).toBeVisible();
    expect(screen.queryByText("버전 0")).not.toBeInTheDocument();
    expect(screen.queryByText("세션 기록 완성")).not.toBeInTheDocument();
    expect(screen.queryByText("공개 기록 초안")).not.toBeInTheDocument();
    expect(screen.queryByText(/live revision/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/draft revision/i)).not.toBeInTheDocument();
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
              onSnapshotChange: setSnapshot,
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
    await user.click(screen.getByRole("tab", { name: "외부 JSON" }));
    const jsonReview = screen.getByRole("region", { name: "세션 기록 미리보기" });
    expect(aiWorkspace).not.toBeVisible();

    await user.click(screen.getByRole("tab", { name: "직접 작성" }));
    expect(screen.getByRole("textbox", { name: "공개 요약" }))
      .toHaveValue("source를 바꿔도 유지할 입력");
    await user.click(screen.getByRole("tab", { name: "외부 JSON" }));
    expect(screen.getByRole("region", { name: "세션 기록 미리보기" })).toBe(jsonReview);
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
    expect(screen.getByRole("button", { name: "반영 검토" })).toBeDisabled();
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
    expect(screen.getByRole("button", { name: "반영 검토" })).toBeDisabled();

    rerender(<SessionRecordWorkspace {...props()} />);
    expect(screen.queryByRole("link", { name: "첫 오류 확인" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "반영 검토" })).toBeEnabled();
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
    expect(screen.getByRole("region", { name: "현재 적용본" }))
      .toHaveTextContent("현재 멤버 화면에 적용된 요약");
  });

  it("returns a committed JSON draft to the focused common editor instead of showing a second result artifact", async () => {
    const user = userEvent.setup();

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
              onImportCommit: () => setCommitResult(importCommitResult),
            },
          })}
        />
      );
    }

    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "초안으로 가져오기" }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "직접 작성" })).toHaveAttribute("aria-selected", "true");
    });
    expect(screen.getByRole("textbox", { name: "공개 요약" })).toHaveFocus();
    expect(screen.queryByRole("region", { name: "세션 기록 초안 저장 결과" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "현재 적용본" }))
      .toHaveTextContent("현재 멤버 화면에 적용된 요약");
  });
});
