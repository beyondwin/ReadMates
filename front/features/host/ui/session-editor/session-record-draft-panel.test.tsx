import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState, type PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useSessionRecordDraftController,
} from "@/features/host/hooks/use-session-record-draft-controller";
import {
  SessionRecordDraftPanelBody,
  type SessionRecordDraftSnapshot,
} from "./session-record-draft-panel";

const liveSnapshot: SessionRecordDraftSnapshot = {
  schema: "readmates-session-record:v1",
  visibility: "MEMBER",
  publicationSummary: "현재 멤버 화면에 적용된 요약",
  highlights: [{
    membershipId: "membership-1",
    authorDisplayName: "회원 1",
    text: "현재 하이라이트",
  }],
  oneLineReviews: [],
  feedbackDocument: {
    fileName: "session-1.md",
    title: "현재 피드백",
    markdown: "# 현재 피드백",
  },
};

const draftSnapshot: SessionRecordDraftSnapshot = {
  ...liveSnapshot,
  publicationSummary: "저장된 초안 요약",
  highlights: liveSnapshot.highlights.map((item) => ({ ...item })),
  feedbackDocument: { ...liveSnapshot.feedbackDocument },
};

function editor(snapshot = draftSnapshot, draftRevision = 4) {
  return {
    sessionId: "session-1",
    liveRevision: 3,
    liveSnapshot,
    draft: {
      sessionId: "session-1",
      baseLiveRevision: 3,
      draftRevision,
      source: "MANUAL" as const,
      restoredFromRevisionId: null,
      snapshot,
      updatedAt: "2026-07-23T10:00:00+09:00",
    },
    draftLiveBaseStale: false,
    validationSummary: { valid: true, issues: [] },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SessionRecordDraftPanelBody", () => {
  it("treats a persisted draft as saved when the editor is reopened", () => {
    const { result } = renderHook(() => useSessionRecordDraftController({
      editor: editor(),
      onSave: vi.fn(),
      onReload: vi.fn(),
    }));

    expect(result.current.saveState).toBe("saved");
    expect(result.current.expectedDraftRevision).toBe(4);
  });

  it("keeps draft inputs controlled by the shared snapshot", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [snapshot, setSnapshot] = useState(draftSnapshot);
      return (
        <SessionRecordDraftPanelBody
          snapshot={snapshot}
          saveState="idle"
          validationIssues={[]}
          draftLiveBaseStale={false}
          onSnapshotChange={setSnapshot}
          onReloadDraft={vi.fn()}
          onCopyInput={vi.fn()}
        />
      );
    }
    render(<Harness />);

    await user.clear(screen.getByRole("textbox", { name: "공개 요약" }));
    await user.type(screen.getByRole("textbox", { name: "공개 요약" }), "아직 적용하지 않은 초안");

    expect(screen.getByRole("textbox", { name: "공개 요약" })).toHaveValue("아직 적용하지 않은 초안");
  });

  it("changes public visibility only through the draft snapshot callback", async () => {
    const user = userEvent.setup();
    const onSnapshotChange = vi.fn();
    render(
      <SessionRecordDraftPanelBody
        snapshot={draftSnapshot}
        saveState="saved"
        validationIssues={[]}
        draftLiveBaseStale={false}
        onSnapshotChange={onSnapshotChange}
        onReloadDraft={vi.fn()}
        onCopyInput={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "외부 공개" }));

    expect(onSnapshotChange).toHaveBeenCalledWith({
      ...draftSnapshot,
      visibility: "PUBLIC",
    });
  });

  it("autosaves one section with the expected draft revision", async () => {
    vi.useFakeTimers();
    const onSave = vi.fn().mockResolvedValue(editor({
      ...draftSnapshot,
      publicationSummary: "변경",
    }, 5).draft);
    const { result } = renderHook(() => useSessionRecordDraftController({
      editor: editor(),
      onSave,
      onReload: vi.fn(),
    }));

    act(() => {
      result.current.updateSnapshot({
        ...draftSnapshot,
        publicationSummary: "변경",
      });
      vi.advanceTimersByTime(599);
    });
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(onSave).toHaveBeenCalledWith({
      sessionId: "session-1",
      request: {
        expectedDraftRevision: 4,
        snapshot: {
          ...draftSnapshot,
          publicationSummary: "변경",
        },
      },
    });
    expect(result.current.saveState).toBe("saved");
  });

  it("autosaves after the StrictMode effect remount used by the app entrypoint", async () => {
    vi.useFakeTimers();
    const onSave = vi.fn().mockResolvedValue(editor({
      ...draftSnapshot,
      visibility: "PUBLIC",
    }, 5).draft);
    const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;
    const { result } = renderHook(() => useSessionRecordDraftController({
      editor: editor(),
      onSave,
      onReload: vi.fn(),
    }), { wrapper });

    act(() => result.current.updateSnapshot({
      ...draftSnapshot,
      visibility: "PUBLIC",
    }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(result.current.saveState).toBe("saved");
  });

  it("serializes autosaves, queues only the latest snapshot, and marks saved only for its acknowledgement", async () => {
    vi.useFakeTimers();
    let resolveFirst!: (value: NonNullable<ReturnType<typeof editor>["draft"]>) => void;
    let resolveSecond!: (value: NonNullable<ReturnType<typeof editor>["draft"]>) => void;
    const first = new Promise<NonNullable<ReturnType<typeof editor>["draft"]>>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<NonNullable<ReturnType<typeof editor>["draft"]>>((resolve) => {
      resolveSecond = resolve;
    });
    const onSave = vi.fn()
      .mockImplementationOnce(() => first)
      .mockImplementationOnce(() => second);
    const { result } = renderHook(() => useSessionRecordDraftController({
      editor: editor(),
      onSave,
      onReload: vi.fn(),
    }));

    act(() => result.current.updateSnapshot({
      ...draftSnapshot,
      publicationSummary: "첫 입력",
    }));
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(onSave).toHaveBeenCalledTimes(1);

    act(() => result.current.updateSnapshot({
      ...draftSnapshot,
      publicationSummary: "가장 최신 입력",
    }));
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => resolveFirst(editor({
      ...draftSnapshot,
      publicationSummary: "첫 입력",
    }, 5).draft!));
    expect(result.current.saveState).not.toBe("saved");
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith({
      sessionId: "session-1",
      request: {
        expectedDraftRevision: 5,
        snapshot: {
          ...draftSnapshot,
          publicationSummary: "가장 최신 입력",
        },
      },
    });

    await act(async () => resolveSecond(editor({
      ...draftSnapshot,
      publicationSummary: "가장 최신 입력",
    }, 6).draft!));
    expect(result.current.saveState).toBe("saved");
    expect(result.current.expectedDraftRevision).toBe(6);
  });

  it("cancels an older pending autosave when a restored editor is adopted and still saves later edits", async () => {
    vi.useFakeTimers();
    const restoredSnapshot = {
      ...draftSnapshot,
      publicationSummary: "복원된 서버 초안",
    };
    const laterSnapshot = {
      ...restoredSnapshot,
      publicationSummary: "복원 후 새로 입력한 초안",
    };
    const onSave = vi.fn().mockResolvedValue(editor(laterSnapshot, 9).draft);
    const { result } = renderHook(() => useSessionRecordDraftController({
      editor: editor(),
      onSave,
      onReload: vi.fn(),
    }));

    act(() => result.current.updateSnapshot({
      ...draftSnapshot,
      publicationSummary: "복원 전에 예약된 오래된 초안",
    }));
    act(() => result.current.adoptEditor(editor(restoredSnapshot, 8)));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(result.current.snapshot.publicationSummary).toBe("복원된 서버 초안");
    expect(result.current.expectedDraftRevision).toBe(8);
    expect(onSave).not.toHaveBeenCalled();

    act(() => result.current.updateSnapshot(laterSnapshot));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      sessionId: "session-1",
      request: {
        expectedDraftRevision: 8,
        snapshot: laterSnapshot,
      },
    });
    expect(result.current.saveState).toBe("saved");
  });

  it("replays a post-adoption edit when the superseded in-flight autosave rejects", async () => {
    vi.useFakeTimers();
    let rejectSupersededSave!: (reason: unknown) => void;
    let resolvePostAdoptionSave!: (value: NonNullable<ReturnType<typeof editor>["draft"]>) => void;
    const supersededSave = new Promise<NonNullable<ReturnType<typeof editor>["draft"]>>(
      (_resolve, reject) => {
        rejectSupersededSave = reject;
      },
    );
    const postAdoptionSave = new Promise<NonNullable<ReturnType<typeof editor>["draft"]>>(
      (resolve) => {
        resolvePostAdoptionSave = resolve;
      },
    );
    const restoredSnapshot = {
      ...draftSnapshot,
      publicationSummary: "복원된 서버 초안",
    };
    const postAdoptionSnapshot = {
      ...restoredSnapshot,
      publicationSummary: "복원 후 새로 입력한 초안",
    };
    const onSave = vi.fn()
      .mockImplementationOnce(() => supersededSave)
      .mockImplementationOnce(() => postAdoptionSave);
    const { result } = renderHook(() => useSessionRecordDraftController({
      editor: editor(),
      onSave,
      onReload: vi.fn(),
    }));

    act(() => result.current.updateSnapshot({
      ...draftSnapshot,
      publicationSummary: "복원 전에 시작된 오래된 초안",
    }));
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(onSave).toHaveBeenCalledTimes(1);

    act(() => result.current.adoptEditor(editor(restoredSnapshot, 8)));
    act(() => result.current.updateSnapshot(postAdoptionSnapshot));
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectSupersededSave({ code: "SESSION_RECORD_DRAFT_STALE" });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith({
      sessionId: "session-1",
      request: {
        expectedDraftRevision: 8,
        snapshot: postAdoptionSnapshot,
      },
    });
    expect(result.current.saveState).toBe("saving");
    expect(result.current.shouldBlockNavigation).toBe(true);

    await act(async () => {
      resolvePostAdoptionSave(editor(postAdoptionSnapshot, 9).draft!);
    });

    expect(result.current.snapshot).toEqual(postAdoptionSnapshot);
    expect(result.current.expectedDraftRevision).toBe(9);
    expect(result.current.saveState).toBe("saved");
    expect(result.current.shouldBlockNavigation).toBe(false);
  });

  it("shows unsaved state and blocks navigation after autosave failure", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSessionRecordDraftController({
      editor: editor(),
      onSave: vi.fn().mockRejectedValue(new Error("offline")),
      onReload: vi.fn(),
    }));

    act(() => result.current.updateSnapshot({
      ...draftSnapshot,
      publicationSummary: "저장되지 않은 입력",
    }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(result.current.saveState).toBe("error");

    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
  });

  it("does not overwrite on SESSION_RECORD_DRAFT_STALE", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const latest = editor({
      ...draftSnapshot,
      publicationSummary: "서버의 최신 초안",
    }, 6);
    const { result } = renderHook(() => useSessionRecordDraftController({
      editor: editor(),
      onSave: vi.fn().mockRejectedValue({ code: "SESSION_RECORD_DRAFT_STALE" }),
      onReload: vi.fn().mockResolvedValue(latest),
    }));

    act(() => result.current.updateSnapshot({
      ...draftSnapshot,
      publicationSummary: "내가 입력한 초안",
    }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(result.current.saveState).toBe("stale");
    expect(result.current.snapshot.publicationSummary).toBe("내가 입력한 초안");
    await act(async () => result.current.copyInput());
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("내가 입력한 초안"));
    await act(async () => result.current.reloadDraft());
    expect(result.current.snapshot.publicationSummary).toBe("서버의 최신 초안");
  });

  it("adopts a JSON or AI commit revision before reloading the shared draft", async () => {
    const onReload = vi.fn().mockResolvedValue(editor(draftSnapshot, 8));
    const { result } = renderHook(() => useSessionRecordDraftController({
      editor: editor(),
      onSave: vi.fn(),
      onReload,
    }));

    act(() => result.current.adoptDraftRevision(8));
    expect(result.current.expectedDraftRevision).toBe(8);
    expect(result.current.saveState).toBe("saved");

    await act(async () => result.current.reloadDraft());
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(result.current.expectedDraftRevision).toBe(8);
  });

  it("maps validation issues to summary highlights reviews and feedback", () => {
    render(
      <SessionRecordDraftPanelBody
        snapshot={{
          ...draftSnapshot,
          oneLineReviews: [{
            membershipId: "membership-1",
            authorDisplayName: "회원 1",
            text: "확인이 필요한 한줄평",
          }],
        }}
        saveState="saved"
        validationIssues={[
          "SUMMARY_REQUIRED",
          "HIGHLIGHT_AUTHOR_INVALID",
          "ONE_LINE_REVIEW_AUTHOR_INVALID",
          "FEEDBACK_DOCUMENT_INVALID",
        ]}
        draftLiveBaseStale={false}
        onSnapshotChange={vi.fn()}
        onReloadDraft={vi.fn()}
        onCopyInput={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: "공개 요약 오류" })).toHaveAttribute("href", "#session-record-summary");
    expect(screen.getByRole("link", { name: "하이라이트 오류" })).toHaveAttribute("href", "#session-record-highlights");
    expect(screen.getByRole("link", { name: "한줄평 오류" })).toHaveAttribute("href", "#session-record-reviews");
    expect(screen.getByRole("link", { name: "피드백 문서 오류" })).toHaveAttribute("href", "#session-record-feedback");

    const summary = screen.getByRole("textbox", { name: "공개 요약" });
    expect(summary).toHaveAttribute("aria-invalid", "true");
    expect(summary).toHaveAttribute("aria-describedby", "session-record-summary-error");
    expect(document.getElementById("session-record-summary-error"))
      .toHaveTextContent("공개 요약을 입력하거나 내용을 확인해 주세요.");

    const highlight = screen.getByRole("textbox", { name: "하이라이트 1 · 회원 1" });
    expect(highlight).toHaveAttribute("aria-invalid", "true");
    expect(highlight).toHaveAttribute("aria-describedby", "session-record-highlights-error");
    expect(document.getElementById("session-record-highlights-error"))
      .toHaveTextContent("하이라이트의 작성자와 내용을 확인해 주세요.");

    const review = screen.getByRole("textbox", { name: "한줄평 1 · 회원 1" });
    expect(review).toHaveAttribute("aria-invalid", "true");
    expect(review).toHaveAttribute("aria-describedby", "session-record-reviews-error");
    expect(document.getElementById("session-record-reviews-error"))
      .toHaveTextContent("한줄평의 작성자와 내용을 확인해 주세요.");

    const feedbackFileName = screen.getByRole("textbox", { name: "피드백 파일 이름" });
    const feedbackTitle = screen.getByRole("textbox", { name: "피드백 문서 제목" });
    const feedbackMarkdown = screen.getByRole("textbox", { name: "피드백 Markdown 본문" });
    for (const field of [feedbackFileName, feedbackTitle, feedbackMarkdown]) {
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveAttribute("aria-describedby", "session-record-feedback-error");
    }
    expect(document.getElementById("session-record-feedback-error"))
      .toHaveTextContent("피드백 문서의 파일 이름, 제목, Markdown 본문을 확인해 주세요.");
  });

  it("does not mark fields invalid when their validation section has no issue", () => {
    render(
      <SessionRecordDraftPanelBody
        snapshot={draftSnapshot}
        saveState="saved"
        validationIssues={["SUMMARY_REQUIRED"]}
        draftLiveBaseStale={false}
        onSnapshotChange={vi.fn()}
        onReloadDraft={vi.fn()}
        onCopyInput={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox", { name: "공개 요약" }))
      .toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("textbox", { name: "하이라이트 1 · 회원 1" }))
      .not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("textbox", { name: "피드백 파일 이름" }))
      .not.toHaveAttribute("aria-describedby");
  });

  it("offers an explicit retryable rebase action while review remains blocked", async () => {
    const user = userEvent.setup();
    const onRebaseDraft = vi.fn().mockResolvedValue(undefined);
    render(
      <SessionRecordDraftPanelBody
        snapshot={draftSnapshot}
        saveState="saved"
        validationIssues={["LIVE_REVISION_STALE"]}
        draftLiveBaseStale
        onSnapshotChange={vi.fn()}
        onReloadDraft={vi.fn()}
        onCopyInput={vi.fn()}
        onRebaseDraft={onRebaseDraft}
        rebasePending={false}
        rebaseError={null}
        onReviewDraft={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "최신 정보 확인 완료" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "최신 정보 확인 완료" }));
    expect(onRebaseDraft).toHaveBeenCalledTimes(1);
  });

  it("keeps failed input and exposes retry reload and copy recovery actions", async () => {
    const user = userEvent.setup();
    const onSnapshotChange = vi.fn();
    const onReloadDraft = vi.fn();
    const onCopyInput = vi.fn();
    render(
      <SessionRecordDraftPanelBody
        snapshot={draftSnapshot}
        saveState="error"
        validationIssues={[]}
        draftLiveBaseStale={false}
        onSnapshotChange={onSnapshotChange}
        onReloadDraft={onReloadDraft}
        onCopyInput={onCopyInput}
      />,
    );

    expect(screen.getByRole("textbox", { name: "공개 요약" }))
      .toHaveValue("저장된 초안 요약");
    await user.click(screen.getByRole("button", { name: "저장 다시 시도" }));
    await user.click(screen.getByRole("button", { name: "최신 초안 불러오기" }));
    await user.click(screen.getByRole("button", { name: "내 입력 복사" }));

    expect(onSnapshotChange).toHaveBeenCalledWith(draftSnapshot);
    expect(onReloadDraft).toHaveBeenCalledTimes(1);
    expect(onCopyInput).toHaveBeenCalledTimes(1);
  });

  it("contains long file names URLs and Markdown inside overflow-safe fields", () => {
    render(
      <SessionRecordDraftPanelBody
        snapshot={{
          ...draftSnapshot,
          feedbackDocument: {
            fileName: "a-very-long-file-name-without-breaks-that-must-stay-inside-the-editor.md",
            title: "https://example.com/a/very/long/unbroken/path/inside/the/title",
            markdown: "# 긴 본문\n\nhttps://example.com/a/very/long/unbroken/path/inside/markdown",
          },
        }}
        saveState="saved"
        validationIssues={[]}
        draftLiveBaseStale={false}
        onSnapshotChange={vi.fn()}
        onReloadDraft={vi.fn()}
        onCopyInput={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox", { name: "피드백 파일 이름" }))
      .toHaveStyle({ minWidth: "0", maxWidth: "100%" });
    expect(screen.getByRole("textbox", { name: "피드백 문서 제목" }))
      .toHaveStyle({ minWidth: "0", maxWidth: "100%" });
    expect(screen.getByRole("textbox", { name: "피드백 Markdown 본문" }))
      .toHaveStyle({ minWidth: "0", maxWidth: "100%", overflowWrap: "anywhere" });
  });
});
