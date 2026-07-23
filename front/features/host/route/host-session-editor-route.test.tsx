import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, vi, describe, expect, it } from "vitest";

const routeMocks = vi.hoisted(() => ({
  apply: vi.fn(),
  preview: vi.fn(),
  reload: vi.fn(),
  capturedProps: null as Record<string, unknown> | null,
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useBlocker: () => ({ state: "unblocked" }),
}));

vi.mock("@/features/host/ui/host-session-editor", () => ({
  default: (props: Record<string, unknown>) => {
    routeMocks.capturedProps = props;
    return <div>record workflow route ready</div>;
  },
}));

vi.mock("@/features/host/hooks/use-session-record-draft-controller", () => ({
  useSessionRecordDraftController: () => ({
    snapshot: recordEditor.liveSnapshot,
    saveState: "idle",
    expectedDraftRevision: 4,
    shouldBlockNavigation: false,
    updateSnapshot: vi.fn(),
    reloadDraft: routeMocks.reload,
    adoptDraftRevision: vi.fn(),
    copyInput: vi.fn(),
    adoptEditor: vi.fn(),
  }),
}));

vi.mock("@/features/host/queries/host-session-record-queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/host/queries/host-session-record-queries")>()),
  useSaveHostSessionRecordDraftMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRestoreHostSessionRevisionToDraftMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePreviewHostSessionRecordApplyMutation: () => ({ mutateAsync: routeMocks.preview, isPending: false }),
  useApplyHostSessionRecordMutation: () => ({ mutateAsync: routeMocks.apply, isPending: false }),
}));

import { EditHostSessionRecordWorkflow } from "./host-session-editor-route";

const snapshot = {
  schema: "readmates-session-record:v1" as const,
  visibility: "HOST_ONLY" as const,
  publicationSummary: "",
  highlights: [],
  oneLineReviews: [],
  feedbackDocument: { fileName: "", title: "", markdown: "" },
};

const recordEditor = {
  sessionId: "session-1",
  liveRevision: 0,
  liveSnapshot: snapshot,
  draft: null,
  draftLiveBaseStale: false,
  validationSummary: { valid: true, issues: [] },
};

describe("EditHostSessionRecordWorkflow", () => {
  beforeEach(() => {
    routeMocks.apply.mockReset();
    routeMocks.preview.mockReset();
    routeMocks.reload.mockReset();
    routeMocks.capturedProps = null;
  });

  it("renders the stateful route workflow without a missing React hook runtime", () => {
    render(
      <EditHostSessionRecordWorkflow
        session={{ sessionId: "session-1" } as never}
        recordEditor={recordEditor}
        historyPage={{ items: [], nextCursor: null }}
        loadHistoryPage={vi.fn()}
        notificationDispatches={[]}
        context={{ clubSlug: "club-a" }}
        actions={{} as never}
        reloadRecordEditor={vi.fn()}
        onSessionRecordsChanged={vi.fn()}
      />,
    );

    expect(screen.getByText("record workflow route ready")).toBeInTheDocument();
  });

  it("keeps an ambiguous record apply retryable with the same idempotent preview", async () => {
    routeMocks.preview.mockResolvedValue({
      previewId: "preview-1",
      eventType: "SESSION_RECORD_UPDATED",
      targetCount: 1,
      expectedInAppCount: 1,
      expectedEmailCount: 1,
      excludedCount: 0,
      expiresAt: "2026-07-23T20:00:00+09:00",
    });
    routeMocks.apply
      .mockRejectedValueOnce(new TypeError("network response lost"))
      .mockResolvedValueOnce({
        revisionId: "revision-5",
        liveRevision: 5,
        decisionId: "decision-1",
        notificationDecision: "SKIP",
        eventId: null,
      });
    render(
      <EditHostSessionRecordWorkflow
        session={{ sessionId: "session-1" } as never}
        recordEditor={recordEditor}
        historyPage={{ items: [], nextCursor: null }}
        loadHistoryPage={vi.fn()}
        notificationDispatches={[]}
        context={{ clubSlug: "club-a" }}
        actions={{} as never}
        reloadRecordEditor={vi.fn()}
        onSessionRecordsChanged={vi.fn()}
      />,
    );

    const workflow = () => (
      routeMocks.capturedProps?.recordWorkflow as {
        confirmation: {
          open: boolean;
          message: { text: string } | null;
          onReview: () => Promise<void>;
          onDecisionChange: (decision: "SEND" | "SKIP") => void;
          onConfirm: () => Promise<void>;
        };
      }
    );
    await act(async () => workflow().confirmation.onReview());
    act(() => workflow().confirmation.onDecisionChange("SKIP"));
    await act(async () => workflow().confirmation.onConfirm());

    expect(workflow().confirmation.open).toBe(true);
    expect(workflow().confirmation.message?.text).toContain("처리 결과를 확인하지 못했습니다");
    expect(workflow().confirmation.message?.text).not.toContain("변경되지 않았습니다");
    await act(async () => workflow().confirmation.onConfirm());

    expect(routeMocks.apply).toHaveBeenCalledTimes(2);
    expect(routeMocks.apply.mock.calls[0]).toEqual(routeMocks.apply.mock.calls[1]);
    expect(workflow().confirmation.open).toBe(false);
    expect(routeMocks.reload).toHaveBeenCalledTimes(1);
  });

  it("marks the stale dialog submitting while a replacement preview is pending", async () => {
    let resolveReplacement!: (value: Awaited<ReturnType<typeof routeMocks.preview>>) => void;
    const replacement = new Promise<Awaited<ReturnType<typeof routeMocks.preview>>>((resolve) => {
      resolveReplacement = resolve;
    });
    const firstPreview = {
      previewId: "preview-1",
      eventType: "SESSION_RECORD_UPDATED",
      targetCount: 1,
      expectedInAppCount: 1,
      expectedEmailCount: 1,
      excludedCount: 0,
      expiresAt: "2026-07-23T20:00:00+09:00",
    };
    routeMocks.preview.mockResolvedValueOnce(firstPreview).mockImplementationOnce(() => replacement);
    routeMocks.apply.mockRejectedValue({ code: "NOTIFICATION_TARGETS_CHANGED" });
    render(
      <EditHostSessionRecordWorkflow
        session={{ sessionId: "session-1" } as never}
        recordEditor={recordEditor}
        historyPage={{ items: [], nextCursor: null }}
        loadHistoryPage={vi.fn()}
        notificationDispatches={[]}
        context={{ clubSlug: "club-a" }}
        actions={{} as never}
        reloadRecordEditor={vi.fn()}
        onSessionRecordsChanged={vi.fn()}
      />,
    );
    const confirmation = () => (
      routeMocks.capturedProps?.recordWorkflow as {
        confirmation: {
          submitting: boolean;
          onReview: () => Promise<void>;
          onDecisionChange: (decision: "SEND" | "SKIP") => void;
          onConfirm: () => Promise<void>;
        };
      }
    ).confirmation;

    await act(async () => confirmation().onReview());
    act(() => confirmation().onDecisionChange("SKIP"));
    let confirmationPromise!: Promise<void>;
    act(() => {
      confirmationPromise = confirmation().onConfirm();
    });
    await waitFor(() => expect(confirmation().submitting).toBe(true));
    resolveReplacement({ ...firstPreview, previewId: "preview-2", targetCount: 2 });
    await act(async () => confirmationPromise);
    expect(confirmation().submitting).toBe(false);
  });
});
