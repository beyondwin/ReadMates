import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, vi, describe, expect, it } from "vitest";

const routeMocks = vi.hoisted(() => ({
  apply: vi.fn(),
  commitImport: vi.fn(),
  invalidateHostNotifications: vi.fn(),
  invalidateRecordSurfaces: vi.fn(),
  preview: vi.fn(),
  randomUUID: vi.fn(),
  reload: vi.fn(),
  capturedProps: null as Record<string, unknown> | null,
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useBlocker: () => ({ state: "unblocked" }),
  useParams: () => ({ clubSlug: "club-a" }),
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

vi.mock("@/features/host/queries/host-notification-queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/host/queries/host-notification-queries")>()),
  invalidateHostNotifications: routeMocks.invalidateHostNotifications,
}));

vi.mock("@/features/host/queries/host-session-queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/host/queries/host-session-queries")>()),
  invalidateHostSessionRecordSurfaces: routeMocks.invalidateRecordSurfaces,
  useCloseHostSessionMutation: () => ({ mutateAsync: vi.fn() }),
  useCommitHostSessionImportMutation: () => ({ mutateAsync: routeMocks.commitImport }),
  useCreateHostSessionMutation: () => ({ mutateAsync: vi.fn() }),
  useDeleteHostSessionMutation: () => ({ mutateAsync: vi.fn() }),
  usePublishHostSessionMutation: () => ({ mutateAsync: vi.fn() }),
  useSaveHostSessionPublicationMutation: () => ({ mutateAsync: vi.fn() }),
  useUpdateHostSessionAttendanceMutation: () => ({ mutateAsync: vi.fn() }),
  useUpdateHostSessionMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/features/host/route/host-notification-composer-controller", () => ({
  HostNotificationComposerController: ({
    request,
    onClose,
  }: {
    request: {
      sessionId: string;
      eventType: string;
      origin: string;
    } | null;
    onClose: () => void;
  }) => request ? (
    <div role="dialog" aria-label="멤버에게 알림을 보낼까요?">
      <span>{`${request.sessionId}:${request.eventType}:${request.origin}`}</span>
      <button type="button" onClick={onClose}>이번에는 보내지 않기</button>
    </div>
  ) : null,
}));

import {
  EditHostSessionRecordWorkflow,
  NewHostSessionRoute,
} from "./host-session-editor-route";
import { hostNotificationKeys } from "@/features/host/queries/host-notification-queries";

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

function renderWorkflow() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const rendered = render(
    <QueryClientProvider client={client}>
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
      />
    </QueryClientProvider>,
  );
  return { ...rendered, client };
}

function workflow() {
  return routeMocks.capturedProps?.recordWorkflow as {
    onDraftCommitted: (result: {
      draftRevision: number;
      baseLiveRevision: number | null;
      liveApplied: boolean;
    }) => Promise<void>;
    confirmation: {
      open: boolean;
      message: { text: string } | null;
      onReview: () => Promise<void>;
      onCancel: () => void;
      onConfirm: () => Promise<void>;
    };
  };
}

describe("EditHostSessionRecordWorkflow", () => {
  beforeEach(() => {
    routeMocks.apply.mockReset();
    routeMocks.commitImport.mockReset();
    routeMocks.invalidateHostNotifications.mockReset();
    routeMocks.invalidateRecordSurfaces.mockReset();
    routeMocks.preview.mockReset();
    routeMocks.randomUUID.mockReset();
    routeMocks.reload.mockReset();
    routeMocks.capturedProps = null;
    routeMocks.commitImport.mockResolvedValue({
      sessionId: "session-1",
      draftRevision: 5,
      baseLiveRevision: 0,
      liveApplied: false,
    });
    routeMocks.invalidateHostNotifications.mockResolvedValue(undefined);
    routeMocks.invalidateRecordSurfaces.mockResolvedValue(undefined);
    routeMocks.randomUUID
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000002")
      .mockReturnValue("00000000-0000-4000-8000-000000000003");
    vi.stubGlobal("crypto", { randomUUID: routeMocks.randomUUID });
  });

  it("renders the stateful route workflow without a missing React hook runtime", () => {
    renderWorkflow();

    expect(screen.getByText("record workflow route ready")).toBeInTheDocument();
  });

  it("keeps JSON import invalidation on record surfaces without opening or invalidating notifications", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const manualOptionsKey = hostNotificationKeys.manualOptions(
      { sessionId: "session-1", page: { limit: 50 } },
      { clubSlug: "club-a" },
    );
    client.setQueryData(manualOptionsKey, { contentRevision: "cached-before-import" });
    render(
      <QueryClientProvider client={client}>
        <NewHostSessionRoute onSessionRecordsChanged={vi.fn()} />
      </QueryClientProvider>,
    );
    const actions = routeMocks.capturedProps?.actions as {
      commitSessionImport: (sessionId: string, request: object) => Promise<unknown>;
    };

    await act(async () => actions.commitSessionImport("session-1", { format: "fixture" }));

    expect(routeMocks.commitImport).toHaveBeenCalledTimes(1);
    expect(routeMocks.invalidateRecordSurfaces).toHaveBeenCalledWith(
      client,
      "session-1",
      { clubSlug: "club-a" },
    );
    expect(routeMocks.invalidateHostNotifications).not.toHaveBeenCalled();
    expect(client.getQueryData(manualOptionsKey)).toEqual({
      contentRevision: "cached-before-import",
    });
    expect(screen.queryByRole("dialog", {
      name: "멤버에게 알림을 보낼까요?",
    })).not.toBeInTheDocument();
  });

  it("opens the composer only after a successful final apply", async () => {
    routeMocks.preview.mockResolvedValue({
      eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
      expectedDraftHash: "a".repeat(64),
    });
    routeMocks.apply.mockResolvedValue({
      revisionId: "revision-5",
      liveRevision: 5,
      composer: {
        sessionId: "session-1",
        eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
        contentRevision: "b".repeat(64),
      },
    });
    const { client } = renderWorkflow();
    const manualOptionsKey = hostNotificationKeys.manualOptions(
      { sessionId: "session-1", page: { limit: 50 } },
      { clubSlug: "club-a" },
    );
    client.setQueryData(manualOptionsKey, { contentRevision: "stale-before-apply" });

    await act(async () => workflow().onDraftCommitted({
      draftRevision: 5,
      baseLiveRevision: 0,
      liveApplied: false,
    }));
    expect(screen.queryByRole("dialog", {
      name: "멤버에게 알림을 보낼까요?",
    })).not.toBeInTheDocument();

    await act(async () => workflow().confirmation.onReview());
    await act(async () => workflow().confirmation.onConfirm());

    expect(routeMocks.apply).toHaveBeenCalledWith({
      sessionId: "session-1",
      request: {
        applyRequestId: "00000000-0000-4000-8000-000000000001",
        expectedDraftRevision: 4,
        expectedLiveRevision: 0,
        expectedDraftHash: "a".repeat(64),
      },
    });
    expect(client.getQueryData(manualOptionsKey)).toBeUndefined();
    expect(await screen.findByRole("dialog", {
      name: "멤버에게 알림을 보낼까요?",
    })).toHaveTextContent(
      "session-1:FEEDBACK_DOCUMENT_PUBLISHED:CONTENT_UPDATE",
    );
  });

  it("does not open the composer when final apply fails", async () => {
    routeMocks.preview.mockResolvedValue({
      eventType: "SESSION_RECORD_UPDATED",
      expectedDraftHash: "a".repeat(64),
    });
    routeMocks.apply.mockRejectedValue({ code: "SESSION_RECORD_INVALID" });
    renderWorkflow();

    await act(async () => workflow().confirmation.onReview());
    await act(async () => workflow().confirmation.onConfirm());

    expect(screen.queryByRole("dialog", {
      name: "멤버에게 알림을 보낼까요?",
    })).not.toBeInTheDocument();
  });

  it("keeps an ambiguous record apply retryable with the same apply request id", async () => {
    routeMocks.preview.mockResolvedValue({
      eventType: "SESSION_RECORD_UPDATED",
      expectedDraftHash: "a".repeat(64),
    });
    routeMocks.apply
      .mockRejectedValueOnce(new TypeError("network response lost"))
      .mockResolvedValueOnce({
        revisionId: "revision-5",
        liveRevision: 5,
        composer: {
          sessionId: "session-1",
          eventType: "SESSION_RECORD_UPDATED",
          contentRevision: "b".repeat(64),
        },
      });
    renderWorkflow();

    await act(async () => workflow().confirmation.onReview());
    await act(async () => workflow().confirmation.onConfirm());

    expect(workflow().confirmation.open).toBe(true);
    expect(workflow().confirmation.message?.text).toContain("처리 결과를 확인하지 못했습니다");
    expect(workflow().confirmation.message?.text).not.toContain("변경되지 않았습니다");
    await act(async () => workflow().confirmation.onConfirm());

    expect(routeMocks.apply).toHaveBeenCalledTimes(2);
    expect(routeMocks.apply.mock.calls[0]).toEqual(routeMocks.apply.mock.calls[1]);
    expect(workflow().confirmation.open).toBe(false);
    expect(routeMocks.reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", {
      name: "멤버에게 알림을 보낼까요?",
    })).toBeInTheDocument();
  });

  it("uses a new apply request id after stale failure and after a completed apply", async () => {
    const firstPreview = {
      eventType: "SESSION_RECORD_UPDATED",
      expectedDraftHash: "a".repeat(64),
    };
    routeMocks.preview.mockResolvedValue(firstPreview);
    routeMocks.apply
      .mockRejectedValueOnce({ code: "SESSION_RECORD_LIVE_STALE" })
      .mockResolvedValue({
        revisionId: "revision-5",
        liveRevision: 5,
        composer: {
          sessionId: "session-1",
          eventType: "SESSION_RECORD_UPDATED",
          contentRevision: "b".repeat(64),
        },
      });
    renderWorkflow();

    await act(async () => workflow().confirmation.onReview());
    await act(async () => workflow().confirmation.onConfirm());
    expect(workflow().confirmation.open).toBe(false);
    expect(screen.queryByRole("dialog", {
      name: "멤버에게 알림을 보낼까요?",
    })).not.toBeInTheDocument();

    await act(async () => workflow().confirmation.onReview());
    await act(async () => workflow().confirmation.onConfirm());
    await act(async () => workflow().confirmation.onReview());

    expect(routeMocks.apply.mock.calls[0]?.[0].request.applyRequestId).toBe(
      "00000000-0000-4000-8000-000000000001",
    );
    expect(routeMocks.apply.mock.calls[1]?.[0].request.applyRequestId).toBe(
      "00000000-0000-4000-8000-000000000002",
    );
    expect(routeMocks.randomUUID).toHaveBeenCalledTimes(3);
  });
});
