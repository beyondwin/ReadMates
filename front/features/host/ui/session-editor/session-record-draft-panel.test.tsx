import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState, type PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useSessionRecordDraftController,
} from "@/features/host/hooks/use-session-record-draft-controller";
import {
  SessionRecordDraftPanel,
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

describe("SessionRecordDraftPanel", () => {
  it("treats a persisted draft as saved when the editor is reopened", () => {
    const { result } = renderHook(() => useSessionRecordDraftController({
      editor: editor(),
      onSave: vi.fn(),
      onReload: vi.fn(),
    }));

    expect(result.current.saveState).toBe("saved");
    expect(result.current.expectedDraftRevision).toBe(4);
  });

  it("keeps live preview unchanged while editing a draft", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [snapshot, setSnapshot] = useState(draftSnapshot);
      return (
        <SessionRecordDraftPanel
          activeMobileSection="records"
          liveSnapshot={liveSnapshot}
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
    expect(screen.getByRole("region", { name: "현재 적용된 공개 기록" }))
      .toHaveTextContent("현재 멤버 화면에 적용된 요약");
    expect(screen.getByRole("region", { name: "현재 적용된 공개 기록" }))
      .not.toHaveTextContent("아직 적용하지 않은 초안");
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
      <SessionRecordDraftPanel
        activeMobileSection="records"
        liveSnapshot={liveSnapshot}
        snapshot={draftSnapshot}
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
  });
});
