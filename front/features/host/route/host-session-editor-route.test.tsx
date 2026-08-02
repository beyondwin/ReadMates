import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, vi, describe, expect, it } from "vitest";
import { createMemoryRouter, MemoryRouter, Router } from "react-router";
import { RouterProvider } from "react-router/dom";
import { StrictMode, useState } from "react";

const routeMocks = vi.hoisted(() => ({
  apply: vi.fn(),
  rebase: vi.fn(),
  restore: vi.fn(),
  commitImport: vi.fn(),
  invalidateHostNotifications: vi.fn(),
  invalidateRecordSurfaces: vi.fn(),
  preview: vi.fn(),
  randomUUID: vi.fn(),
  reload: vi.fn(),
  adoptDraftRevision: vi.fn(),
  adoptEditor: vi.fn(),
  updateSnapshot: vi.fn(),
  snapshotRevisionAfterUpdate: null as number | null,
  expectedDraftRevision: 4 as number | null,
  saveState: "idle" as "idle" | "dirty" | "saving" | "saved" | "error" | "stale",
  shouldBlockNavigation: false,
  blockerPredicate: false as boolean | ((args: {
    currentLocation: { pathname: string };
    nextLocation: { pathname: string };
  }) => boolean),
  blocker: {
    state: "unblocked",
    proceed: vi.fn(),
    reset: vi.fn(),
  },
  capturedProps: null as Record<string, unknown> | null,
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useBlocker: (predicate: typeof routeMocks.blockerPredicate) => {
    routeMocks.blockerPredicate = predicate;
    return routeMocks.blocker;
  },
  useParams: () => ({ clubSlug: "club-a" }),
}));

vi.mock("@/features/host/ui/host-session-editor", () => ({
  default: (props: Record<string, unknown>) => {
    routeMocks.capturedProps = props;
    return <div>record workflow route ready</div>;
  },
}));

vi.mock("@/features/host/hooks/use-session-record-draft-controller", () => ({
  useSessionRecordDraftController: () => {
    const [expectedDraftRevision, setExpectedDraftRevision] = useState(
      routeMocks.expectedDraftRevision,
    );
    return {
      snapshot: recordEditor.liveSnapshot,
      saveState: routeMocks.saveState,
      expectedDraftRevision,
      getExpectedDraftRevision: () => expectedDraftRevision,
      shouldBlockNavigation: routeMocks.shouldBlockNavigation,
      updateSnapshot: (nextSnapshot: typeof recordEditor.liveSnapshot) => {
        routeMocks.updateSnapshot(nextSnapshot);
        if (routeMocks.snapshotRevisionAfterUpdate !== null) {
          setExpectedDraftRevision(routeMocks.snapshotRevisionAfterUpdate);
        }
      },
      reloadDraft: async () => {
        const latest = await routeMocks.reload();
        const revision = latest?.draft?.draftRevision;
        if (revision !== undefined) {
          setExpectedDraftRevision(revision);
        }
      },
      adoptDraftRevision: (revision: number) => {
        routeMocks.adoptDraftRevision(revision);
        setExpectedDraftRevision(revision);
      },
      copyInput: vi.fn(),
      adoptEditor: (nextEditor: HostSessionRecordEditor) => {
        routeMocks.adoptEditor(nextEditor);
        setExpectedDraftRevision(nextEditor.draft?.draftRevision ?? null);
      },
    };
  },
}));

vi.mock("@/features/host/queries/host-session-record-queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/host/queries/host-session-record-queries")>()),
  useSaveHostSessionRecordDraftMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRebaseHostSessionRecordDraftMutation: () => ({
    mutateAsync: routeMocks.rebase,
    isPending: false,
  }),
  useRestoreHostSessionRevisionToDraftMutation: () => ({
    mutateAsync: routeMocks.restore,
    isPending: false,
  }),
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
  useUpdateHostSessionAttendanceMutation: () => ({ mutateAsync: vi.fn() }),
  useUpdateHostSessionMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/features/host/route/host-notification-composer-controller", () => ({
  HostNotificationComposerController: ({
    request,
    onClose,
    onConfirmed,
  }: {
    request: {
      sessionId: string;
      eventType: string;
      contentRevision: string;
      origin: string;
    } | null;
    onClose: () => void;
    onConfirmed?: (result: {
      manualDispatchId: string;
      eventId: string;
      status: "PUBLISHED";
      createdAt: string;
      summary: {
        targetCount: number;
        requestedChannels: "IN_APP";
        expectedInAppCount: number;
        expectedEmailCount: number;
      };
    }) => void;
  }) => request ? (
    <div role="dialog" aria-label="멤버에게 알림을 보낼까요?">
      <span>{`${request.sessionId}:${request.eventType}:${request.contentRevision}:${request.origin}`}</span>
      <button
        type="button"
        onClick={() => {
          onConfirmed?.({
            manualDispatchId: "dispatch-1",
            eventId: "event-1",
            status: "PUBLISHED",
            createdAt: "2026-07-24T00:00:00Z",
            summary: {
              targetCount: 1,
              requestedChannels: "IN_APP",
              expectedInAppCount: 1,
              expectedEmailCount: 0,
            },
          });
          onClose();
        }}
      >
        발송 확인
      </button>
      <button type="button" onClick={onClose}>이번에는 보내지 않기</button>
    </div>
  ) : null,
}));

import {
  EditHostSessionRecordWorkflow,
  NewHostSessionRoute,
} from "./host-session-editor-route";
import { hostNotificationKeys } from "@/features/host/queries/host-notification-queries";
import { hostSessionRecordKeys } from "@/features/host/queries/host-session-record-queries";
import { hostSessionKeys } from "@/features/host/queries/host-session-queries";
import type {
  HostSessionHistoryItem,
  HostSessionRecordEditor,
} from "@/features/host/api/host-session-record-contracts";
import type {
  HostSessionEditorLocation,
} from "@/features/host/model/host-session-editor-navigation";
import { appendUniqueSessionHistory } from "@/features/host/ui/session-editor/session-history-model";

const snapshot = {
  schema: "readmates-session-record:v1" as const,
  visibility: "HOST_ONLY" as const,
  publicationSummary: "",
  highlights: [],
  oneLineReviews: [],
  feedbackDocument: { fileName: "", title: "", markdown: "" },
};

const recordEditor: HostSessionRecordEditor = {
  sessionId: "session-1",
  liveRevision: 0,
  liveSessionUpdatedAt: "2026-07-25T00:00:00Z",
  liveSnapshot: snapshot,
  draft: null,
  draftLiveBaseStale: false,
  validationSummary: { valid: true, issues: [] },
};

function renderWorkflow(
  editor: HostSessionRecordEditor = recordEditor,
  reloadRecordEditor: () => Promise<HostSessionRecordEditor | undefined> = vi.fn(),
  navigation: {
    location: HostSessionEditorLocation;
    onChange: (next: HostSessionEditorLocation) => void;
  } = {
    location: { section: "overview", source: "manual" } as const,
    onChange: vi.fn(),
  },
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const rendered = render(
    <QueryClientProvider client={client}>
      <EditHostSessionRecordWorkflow
        session={{ sessionId: "session-1" } as never}
        recordEditor={editor}
        historyPage={{ items: [], nextCursor: null }}
        loadHistoryPage={vi.fn()}
        notificationDispatches={[]}
        context={{ clubSlug: "club-a" }}
        actions={{} as never}
        reloadRecordEditor={reloadRecordEditor}
        onSessionRecordsChanged={vi.fn()}
        navigation={navigation}
      />
    </QueryClientProvider>,
  );
  return { ...rendered, client, navigation };
}

function workflow() {
  return routeMocks.capturedProps?.recordWorkflow as {
    onDraftCommitted: (result: {
      draftRevision: number;
      baseLiveRevision: number | null;
      liveApplied: boolean;
    }) => Promise<void>;
    onReloadDraft: () => Promise<void>;
    onRebaseDraft: () => Promise<void>;
    onSnapshotChange: (nextSnapshot: typeof snapshot) => void;
    onRestore: (request: {
      revisionId: string;
      expectedDraftRevision: number | null;
    }) => Promise<void>;
    onRestoreCompleted: () => void;
    rebaseError: string | null;
    confirmation: {
      open: boolean;
      message: { text: string } | null;
      onReview: () => Promise<void>;
      onCancel: () => void;
      onConfirm: () => Promise<void>;
    };
  };
}

function capturedNavigation() {
  return routeMocks.capturedProps?.navigation as {
    location: {
      section: "overview" | "basic" | "attendance" | "records" | "history";
      source: "manual" | "ai" | "json";
    };
    onChange: (next: {
      section: "overview" | "basic" | "attendance" | "records" | "history";
      source: "manual" | "ai" | "json";
    }) => void;
  };
}

function renderNewRouteAt(initialEntry: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter([
    {
      path: "*",
      element: <NewHostSessionRoute onSessionRecordsChanged={vi.fn()} />,
    },
  ], { initialEntries: [initialEntry] });

  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { client, router };
}

function historyTransportItem(): HostSessionHistoryItem {
  return {
    id: "history-1",
    type: "RECORD_REVISION_APPLIED",
    createdAt: "2026-07-27T10:00:00+09:00",
    actorMembershipId: "membership-host",
    changedFields: ["publicationSummary"],
    attendanceTransitions: [],
    revisionId: "revision-2",
    revisionVersion: 2,
    revisionSource: "MANUAL",
    restoredFromRevisionId: null,
    notificationEventId: null,
  };
}

describe("EditHostSessionRecordWorkflow", () => {
  beforeEach(() => {
    routeMocks.apply.mockReset();
    routeMocks.rebase.mockReset();
    routeMocks.restore.mockReset();
    routeMocks.commitImport.mockReset();
    routeMocks.invalidateHostNotifications.mockReset();
    routeMocks.invalidateRecordSurfaces.mockReset();
    routeMocks.preview.mockReset();
    routeMocks.randomUUID.mockReset();
    routeMocks.reload.mockReset();
    routeMocks.adoptDraftRevision.mockReset();
    routeMocks.adoptEditor.mockReset();
    routeMocks.updateSnapshot.mockReset();
    routeMocks.snapshotRevisionAfterUpdate = null;
    routeMocks.expectedDraftRevision = 4;
    routeMocks.saveState = "idle";
    routeMocks.shouldBlockNavigation = false;
    routeMocks.blockerPredicate = false;
    routeMocks.blocker.state = "unblocked";
    routeMocks.blocker.proceed.mockReset();
    routeMocks.blocker.reset.mockReset();
    routeMocks.capturedProps = null;
    routeMocks.commitImport.mockResolvedValue({
      sessionId: "session-1",
      draftRevision: 5,
      baseLiveRevision: 0,
      liveApplied: false,
    });
    routeMocks.invalidateHostNotifications.mockResolvedValue(undefined);
    routeMocks.invalidateRecordSurfaces.mockResolvedValue(undefined);
    routeMocks.reload.mockResolvedValue(recordEditor);
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

  it("describes unsaved route work as a working draft", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    routeMocks.saveState = "error";
    routeMocks.shouldBlockNavigation = true;
    routeMocks.blocker.state = "blocked";

    renderWorkflow();

    await waitFor(() => {
      expect(confirm).toHaveBeenCalledWith(
        "저장되지 않은 작업 초안이 있습니다. 이 화면을 떠날까요?",
      );
    });
    expect(routeMocks.blocker.reset).toHaveBeenCalledTimes(1);
    expect(routeMocks.blocker.proceed).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("blocks an actual route leave but not an internal editor section replacement", () => {
    routeMocks.saveState = "error";
    routeMocks.shouldBlockNavigation = true;
    renderWorkflow();

    expect(routeMocks.blockerPredicate).toBeTypeOf("function");
    const shouldBlock = routeMocks.blockerPredicate as Exclude<
      typeof routeMocks.blockerPredicate,
      boolean
    >;
    expect(shouldBlock({
      currentLocation: { pathname: "/app/host/sessions/session-1/edit" },
      nextLocation: { pathname: "/app/host/sessions/session-1/edit" },
    })).toBe(false);
    expect(shouldBlock({
      currentLocation: { pathname: "/app/host/sessions/session-1/edit" },
      nextLocation: { pathname: "/app/host/sessions" },
    })).toBe(true);
  });

  it("asks for a saved working draft before rebase or apply review", async () => {
    routeMocks.expectedDraftRevision = null;
    renderWorkflow();

    await act(async () => workflow().onRebaseDraft());
    expect(workflow().rebaseError).toBe("먼저 작업 초안을 저장해 주세요.");

    await act(async () => workflow().confirmation.onReview());
    expect(workflow().confirmation.message?.text).toBe("먼저 작업 초안을 저장해 주세요.");
  });

  it("keeps API history transport items mutable while appending unique pages", () => {
    const current: HostSessionHistoryItem[] = [historyTransportItem()];
    const next: HostSessionHistoryItem[] = [
      historyTransportItem(),
      { ...historyTransportItem(), id: "history-2" },
    ];
    const appended: HostSessionHistoryItem[] = appendUniqueSessionHistory(current, next);

    appended[0]?.changedFields.push("visibility");

    expect(appended.map((item) => item.id)).toEqual(["history-1", "history-2"]);
    expect(appended[0]?.changedFields).toEqual(["publicationSummary", "visibility"]);
  });

  it("rebases the draft against the exact live metadata version rendered to the host", async () => {
    const staleEditor = {
      ...recordEditor,
      draft: {
        sessionId: "session-1",
        baseLiveRevision: 0,
        draftRevision: 4,
        source: "MANUAL" as const,
        restoredFromRevisionId: null,
        snapshot,
        updatedAt: "2026-07-25T00:01:00Z",
      },
      draftLiveBaseStale: true,
      validationSummary: { valid: false, issues: ["LIVE_REVISION_STALE"] },
    };
    routeMocks.rebase.mockResolvedValue({
      ...staleEditor.draft,
      draftRevision: 5,
    });
    renderWorkflow(staleEditor);

    await act(async () => workflow().onRebaseDraft());

    expect(routeMocks.rebase).toHaveBeenCalledWith({
      sessionId: "session-1",
      request: {
        expectedDraftRevision: 4,
        expectedLiveRevision: 0,
        expectedSessionUpdatedAt: "2026-07-25T00:00:00Z",
      },
    });
    expect(routeMocks.adoptDraftRevision).toHaveBeenCalledWith(5);
  });

  it("uses the rebased draft revision for the next apply preview when reload returns an older editor", async () => {
    const staleEditor = {
      ...recordEditor,
      draft: {
        sessionId: "session-1",
        baseLiveRevision: 0,
        draftRevision: 4,
        source: "MANUAL" as const,
        restoredFromRevisionId: null,
        snapshot,
        updatedAt: "2026-07-25T00:01:00Z",
      },
      draftLiveBaseStale: true,
      validationSummary: { valid: false, issues: ["LIVE_REVISION_STALE"] },
    };
    const rebasedDraft = { ...staleEditor.draft, draftRevision: 5 };
    routeMocks.rebase.mockResolvedValue(rebasedDraft);
    routeMocks.preview.mockResolvedValue({
      eventType: "SESSION_RECORD_PUBLISHED",
      expectedDraftHash: "draft-hash",
    });
    const reloadRecordEditor = vi.fn().mockResolvedValue(staleEditor);
    renderWorkflow(staleEditor, reloadRecordEditor);

    await act(async () => workflow().onRebaseDraft());
    await act(async () => workflow().confirmation.onReview());

    expect(routeMocks.preview).toHaveBeenCalledWith({
      sessionId: "session-1",
      request: {
        expectedDraftRevision: 5,
        expectedLiveRevision: 0,
      },
    });
  });

  it("uses a newer editor revision returned after rebase for the next apply preview", async () => {
    const staleEditor = {
      ...recordEditor,
      draft: {
        sessionId: "session-1",
        baseLiveRevision: 0,
        draftRevision: 4,
        source: "MANUAL" as const,
        restoredFromRevisionId: null,
        snapshot,
        updatedAt: "2026-07-25T00:01:00Z",
      },
      draftLiveBaseStale: true,
      validationSummary: { valid: false, issues: ["LIVE_REVISION_STALE"] },
    };
    const rebasedDraft = { ...staleEditor.draft, draftRevision: 5 };
    const newerEditor = { ...staleEditor, draft: { ...rebasedDraft, draftRevision: 6 } };
    routeMocks.rebase.mockResolvedValue(rebasedDraft);
    routeMocks.preview.mockResolvedValue({
      eventType: "SESSION_RECORD_PUBLISHED",
      expectedDraftHash: "draft-hash",
    });
    renderWorkflow(staleEditor, vi.fn().mockResolvedValue(newerEditor));

    await act(async () => workflow().onRebaseDraft());
    await act(async () => workflow().confirmation.onReview());

    expect(routeMocks.preview).toHaveBeenCalledWith({
      sessionId: "session-1",
      request: {
        expectedDraftRevision: 6,
        expectedLiveRevision: 0,
      },
    });
  });

  it("invalidates a rebased revision after fresh apply is required before retrying preview", async () => {
    const staleEditor = {
      ...recordEditor,
      draft: {
        sessionId: "session-1",
        baseLiveRevision: 0,
        draftRevision: 4,
        source: "MANUAL" as const,
        restoredFromRevisionId: null,
        snapshot,
        updatedAt: "2026-07-25T00:01:00Z",
      },
      draftLiveBaseStale: true,
      validationSummary: { valid: false, issues: ["LIVE_REVISION_STALE"] },
    };
    const rebasedDraft = { ...staleEditor.draft, draftRevision: 5 };
    const latestEditor = { ...staleEditor, draft: { ...rebasedDraft, draftRevision: 6 } };
    routeMocks.rebase.mockResolvedValue(rebasedDraft);
    routeMocks.preview.mockResolvedValue({
      eventType: "SESSION_RECORD_PUBLISHED",
      expectedDraftHash: "draft-hash",
    });
    routeMocks.apply.mockRejectedValue({ code: "SESSION_RECORD_DRAFT_STALE" });
    renderWorkflow(staleEditor, vi.fn().mockResolvedValue(latestEditor));

    await act(async () => workflow().onRebaseDraft());
    await act(async () => workflow().confirmation.onReview());
    await act(async () => workflow().confirmation.onConfirm());
    await act(async () => workflow().confirmation.onReview());

    expect(routeMocks.preview.mock.calls[1]).toEqual([
      {
        sessionId: "session-1",
        request: {
          expectedDraftRevision: 6,
          expectedLiveRevision: 0,
        },
      },
    ]);
  });

  it("uses a manually reloaded draft revision after a successful rebase", async () => {
    const staleEditor = {
      ...recordEditor,
      draft: {
        sessionId: "session-1",
        baseLiveRevision: 0,
        draftRevision: 4,
        source: "MANUAL" as const,
        restoredFromRevisionId: null,
        snapshot,
        updatedAt: "2026-07-25T00:01:00Z",
      },
      draftLiveBaseStale: true,
      validationSummary: { valid: false, issues: ["LIVE_REVISION_STALE"] },
    };
    const rebasedDraft = { ...staleEditor.draft, draftRevision: 5 };
    const latestEditor = {
      ...staleEditor,
      draft: { ...rebasedDraft, draftRevision: 6 },
    };
    routeMocks.rebase.mockResolvedValue(rebasedDraft);
    routeMocks.reload.mockResolvedValue(latestEditor);
    routeMocks.preview.mockResolvedValue({
      eventType: "SESSION_RECORD_PUBLISHED",
      expectedDraftHash: "draft-hash",
    });
    renderWorkflow(staleEditor, vi.fn().mockResolvedValue(staleEditor));

    await act(async () => workflow().onRebaseDraft());
    await act(async () => workflow().onReloadDraft());
    await act(async () => workflow().confirmation.onReview());

    expect(routeMocks.preview).toHaveBeenCalledWith({
      sessionId: "session-1",
      request: {
        expectedDraftRevision: 6,
        expectedLiveRevision: 0,
      },
    });
  });

  it("uses the saved snapshot revision after editing a successfully rebased draft", async () => {
    const staleEditor = {
      ...recordEditor,
      draft: {
        sessionId: "session-1",
        baseLiveRevision: 0,
        draftRevision: 4,
        source: "MANUAL" as const,
        restoredFromRevisionId: null,
        snapshot,
        updatedAt: "2026-07-25T00:01:00Z",
      },
      draftLiveBaseStale: true,
      validationSummary: { valid: false, issues: ["LIVE_REVISION_STALE"] },
    };
    routeMocks.rebase.mockResolvedValue({ ...staleEditor.draft, draftRevision: 5 });
    routeMocks.snapshotRevisionAfterUpdate = 6;
    routeMocks.preview.mockResolvedValue({
      eventType: "SESSION_RECORD_PUBLISHED",
      expectedDraftHash: "draft-hash",
    });
    renderWorkflow(staleEditor, vi.fn().mockResolvedValue(staleEditor));

    await act(async () => workflow().onRebaseDraft());
    act(() => workflow().onSnapshotChange({
      ...snapshot,
      publicationSummary: "재확인 뒤 수정한 초안",
    }));
    await act(async () => workflow().confirmation.onReview());

    expect(routeMocks.updateSnapshot).toHaveBeenCalledOnce();
    expect(routeMocks.preview).toHaveBeenCalledWith({
      sessionId: "session-1",
      request: {
        expectedDraftRevision: 6,
        expectedLiveRevision: 0,
      },
    });
  });

  it("uses the authoritative reload revision after committing a rebased draft", async () => {
    const staleEditor = {
      ...recordEditor,
      draft: {
        sessionId: "session-1",
        baseLiveRevision: 0,
        draftRevision: 4,
        source: "MANUAL" as const,
        restoredFromRevisionId: null,
        snapshot,
        updatedAt: "2026-07-25T00:01:00Z",
      },
      draftLiveBaseStale: true,
      validationSummary: { valid: false, issues: ["LIVE_REVISION_STALE"] },
    };
    routeMocks.rebase.mockResolvedValue({ ...staleEditor.draft, draftRevision: 5 });
    routeMocks.reload.mockResolvedValue({
      ...staleEditor,
      draft: { ...staleEditor.draft, draftRevision: 8 },
    });
    routeMocks.preview.mockResolvedValue({
      eventType: "SESSION_RECORD_PUBLISHED",
      expectedDraftHash: "draft-hash",
    });
    renderWorkflow(staleEditor, vi.fn().mockResolvedValue(staleEditor));

    await act(async () => workflow().onRebaseDraft());
    await act(async () => workflow().onDraftCommitted({
      draftRevision: 7,
      baseLiveRevision: 0,
      liveApplied: false,
    }));
    await act(async () => workflow().confirmation.onReview());

    expect(routeMocks.preview).toHaveBeenCalledWith({
      sessionId: "session-1",
      request: {
        expectedDraftRevision: 8,
        expectedLiveRevision: 0,
      },
    });
  });

  it("uses the restored revision instead of a prior successful rebase revision", async () => {
    const staleEditor = {
      ...recordEditor,
      draft: {
        sessionId: "session-1",
        baseLiveRevision: 0,
        draftRevision: 4,
        source: "MANUAL" as const,
        restoredFromRevisionId: null,
        snapshot,
        updatedAt: "2026-07-25T00:01:00Z",
      },
      draftLiveBaseStale: true,
      validationSummary: { valid: false, issues: ["LIVE_REVISION_STALE"] },
    };
    routeMocks.rebase.mockResolvedValue({ ...staleEditor.draft, draftRevision: 5 });
    routeMocks.restore.mockResolvedValue({
      ...staleEditor.draft,
      draftRevision: 7,
      source: "RESTORED" as const,
      restoredFromRevisionId: "revision-2",
    });
    routeMocks.preview.mockResolvedValue({
      eventType: "SESSION_RECORD_PUBLISHED",
      expectedDraftHash: "draft-hash",
    });
    renderWorkflow(staleEditor, vi.fn().mockResolvedValue(staleEditor));

    await act(async () => workflow().onRebaseDraft());
    await act(async () => workflow().onRestore({
      revisionId: "revision-2",
      expectedDraftRevision: 5,
    }));
    await act(async () => workflow().confirmation.onReview());

    expect(routeMocks.preview).toHaveBeenCalledWith({
      sessionId: "session-1",
      request: {
        expectedDraftRevision: 7,
        expectedLiveRevision: 0,
      },
    });
  });

  it("reloads authoritative state and keeps rebase retryable when live metadata changes again", async () => {
    const latestEditor = {
      ...recordEditor,
      liveSessionUpdatedAt: "2026-07-25T00:02:00Z",
      draftLiveBaseStale: true,
      validationSummary: { valid: false, issues: ["LIVE_REVISION_STALE"] },
    };
    routeMocks.rebase.mockRejectedValue({ code: "SESSION_RECORD_LIVE_STALE" });
    const reloadRecordEditor = vi.fn().mockResolvedValue(latestEditor);
    renderWorkflow(recordEditor, reloadRecordEditor);

    await act(async () => workflow().onRebaseDraft());

    expect(reloadRecordEditor).toHaveBeenCalledTimes(1);
    expect(routeMocks.adoptEditor).toHaveBeenCalledWith(latestEditor);
    expect(workflow().rebaseError).toContain("다시 변경");
  });

  it.each([
    ["AI", "ai"],
    ["JSON", "json"],
  ] as const)(
    "waits for the authoritative record editor after a %s commit before replacing the URL with records/manual",
    async (_label, source) => {
      const navigation = {
        location: { section: "records", source } as const,
        onChange: vi.fn(),
      };
      const order: string[] = [];
      routeMocks.adoptDraftRevision.mockImplementation(() => {
        order.push("adopt");
      });
      routeMocks.reload.mockImplementation(async () => {
        order.push("reload");
        return recordEditor;
      });
      navigation.onChange.mockImplementation(() => {
        order.push("navigate");
      });
      renderWorkflow(recordEditor, routeMocks.reload, navigation);

      await act(async () => workflow().onDraftCommitted({
        draftRevision: 5,
        baseLiveRevision: 0,
        liveApplied: false,
      }));

      expect(order).toEqual(["adopt", "reload", "navigate"]);
      expect(navigation.onChange).toHaveBeenCalledWith({
        section: "records",
        source: "manual",
      });
    },
  );

  it("keeps the applied revision unchanged when restore succeeds, then returns to records/manual", async () => {
    const restoredDraft = {
      sessionId: "session-1",
      baseLiveRevision: 0,
      draftRevision: 6,
      source: "RESTORED" as const,
      restoredFromRevisionId: "revision-2",
      snapshot: { ...snapshot, publicationSummary: "복원한 작업 초안" },
      updatedAt: "2026-07-27T11:00:00+09:00",
    };
    routeMocks.restore.mockResolvedValue(restoredDraft);
    const navigation = {
      location: { section: "history", source: "manual" } as const,
      onChange: vi.fn(),
    };
    renderWorkflow(recordEditor, routeMocks.reload, navigation);

    await act(async () => workflow().onRestore({
      revisionId: "revision-2",
      expectedDraftRevision: 4,
    }));
    act(() => workflow().onRestoreCompleted());

    expect(routeMocks.adoptEditor).toHaveBeenCalledWith(expect.objectContaining({
      liveRevision: recordEditor.liveRevision,
      liveSnapshot: recordEditor.liveSnapshot,
      draft: restoredDraft,
    }));
    expect(navigation.onChange).toHaveBeenCalledWith({
      section: "records",
      source: "manual",
    });
    expect(routeMocks.apply).not.toHaveBeenCalled();
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
        <MemoryRouter>
          <NewHostSessionRoute onSessionRecordsChanged={vi.fn()} />
        </MemoryRouter>
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
    const navigation = {
      location: { section: "records", source: "manual" } as const,
      onChange: vi.fn(),
    };
    const { client } = renderWorkflow(recordEditor, routeMocks.reload, navigation);
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
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
        expectedDraftRevision: 5,
        expectedLiveRevision: 0,
        expectedDraftHash: "a".repeat(64),
      },
    });
    expect(client.getQueryData(manualOptionsKey)).toBeUndefined();
    expect(routeMocks.reload).toHaveBeenCalledTimes(2);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: hostSessionRecordKeys.historyRoot("session-1", { clubSlug: "club-a" }),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: hostSessionKeys.detail("session-1", { clubSlug: "club-a" }),
    });
    expect(navigation.onChange).toHaveBeenCalledWith({
      section: "overview",
      source: "manual",
    });
    expect(await screen.findByRole("dialog", {
      name: "멤버에게 알림을 보낼까요?",
    })).toHaveTextContent(
      `session-1:FEEDBACK_DOCUMENT_PUBLISHED:${"b".repeat(64)}:CONTENT_UPDATE`,
    );

    const editorDispatchesKey = hostSessionKeys.manualDispatches(
      { sessionId: "session-1", page: { limit: 10 } },
      { clubSlug: "club-a" },
    );
    client.setQueryData(editorDispatchesKey, { items: [], nextCursor: null });
    expect(client.getQueryState(editorDispatchesKey)?.isInvalidated).toBe(false);

    screen.getByRole("button", { name: "발송 확인" }).click();

    await waitFor(() => {
      expect(client.getQueryState(editorDispatchesKey)?.isInvalidated).toBe(true);
    });
  });

  it("does not apply or open the composer when review is cancelled or navigation changes", async () => {
    routeMocks.preview.mockResolvedValue({
      eventType: "SESSION_RECORD_UPDATED",
      expectedDraftHash: "a".repeat(64),
    });
    const navigation = {
      location: { section: "records", source: "manual" } as const,
      onChange: vi.fn(),
    };
    renderWorkflow(recordEditor, routeMocks.reload, navigation);

    await act(async () => workflow().confirmation.onReview());
    act(() => workflow().confirmation.onCancel());
    act(() => capturedNavigation().onChange({ section: "history", source: "manual" }));

    expect(routeMocks.apply).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", {
      name: "멤버에게 알림을 보낼까요?",
    })).not.toBeInTheDocument();
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
    expect(workflow().confirmation.message?.text).toBe(
      "변경사항을 반영하지 못했습니다. 현재 적용본은 바뀌지 않았습니다.",
    );
    expect(workflow().confirmation.message?.text).not.toContain("live");
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

describe("host session editor route navigation", () => {
  beforeEach(() => {
    routeMocks.capturedProps = null;
  });

  it.each([
    [
      "an absent query",
      "/app/host/sessions/new",
      { section: "overview", source: "manual" },
      "",
      "POP",
    ],
    [
      "canonical AI records",
      "/app/host/sessions/new?section=records&source=ai",
      { section: "records", source: "ai" },
      "?section=records&source=ai",
      "POP",
    ],
    [
      "canonical JSON records",
      "/app/host/sessions/new?section=records&source=json",
      { section: "records", source: "json" },
      "?section=records&source=json",
      "POP",
    ],
    [
      "legacy AI records",
      "/app/host/sessions/new?returnTo=%2Fapp%2Fhost&aigen=1#audit",
      { section: "records", source: "ai" },
      "?returnTo=%2Fapp%2Fhost&section=records&source=ai",
      "REPLACE",
    ],
    [
      "legacy JSON records",
      "/app/host/sessions/new?from=dashboard&records=json#audit",
      { section: "records", source: "json" },
      "?from=dashboard&section=records&source=json",
      "REPLACE",
    ],
  ] as const)(
    "projects %s into controlled navigation and canonicalizes only when needed",
    async (_label, initialEntry, expectedLocation, expectedSearch, expectedHistoryAction) => {
      const { router } = renderNewRouteAt(initialEntry);

      await waitFor(() => {
        expect(capturedNavigation().location).toEqual(expectedLocation);
        expect(router.state.location.search).toBe(expectedSearch);
      });
      expect(router.state.location.hash).toBe(initialEntry.includes("#audit") ? "#audit" : "");
      expect(router.state.historyAction).toBe(expectedHistoryAction);
    },
  );

  it("replaces editor sections without push state, a full reload, or unrelated URL loss", async () => {
    const pushState = vi.spyOn(window.history, "pushState");
    const { router } = renderNewRouteAt(
      "/app/host/sessions/new?returnTo=%2Fapp%2Fhost&from=dashboard&section=records&source=ai#audit",
    );

    act(() => capturedNavigation().onChange({ section: "history", source: "manual" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/app/host/sessions/new");
      expect(router.state.location.search).toBe(
        "?returnTo=%2Fapp%2Fhost&from=dashboard&section=history",
      );
      expect(router.state.location.hash).toBe("#audit");
    });
    expect(router.state.historyAction).toBe("REPLACE");
    expect(pushState).not.toHaveBeenCalled();
    expect(screen.getByText("record workflow route ready")).toBeInTheDocument();
    pushState.mockRestore();
  });

  it("canonicalizes each legacy source URL once under StrictMode without duplicate revalidation", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const routeState = { returnTo: "/app/host/sessions" };
    const replace = vi.fn();
    const navigator = {
      createHref: (to: string | {
        pathname?: string;
        search?: string;
        hash?: string;
      }) => typeof to === "string"
        ? to
        : `${to.pathname ?? ""}${to.search ?? ""}${to.hash ?? ""}`,
      go: vi.fn(),
      push: vi.fn(),
      replace,
    };
    const renderAt = (location: {
      pathname: string;
      search: string;
      hash: string;
      state: Record<string, string>;
      key: string;
    }) => (
      <StrictMode>
        <QueryClientProvider client={client}>
          <Router location={location} navigator={navigator}>
            <NewHostSessionRoute onSessionRecordsChanged={vi.fn()} />
          </Router>
        </QueryClientProvider>
      </StrictMode>
    );
    const rendered = render(renderAt({
      pathname: "/app/host/sessions/new",
      search: "?returnTo=%2Fapp%2Fhost&aigen=1",
      hash: "#audit",
      state: routeState,
      key: "legacy-ai",
    }));

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0]?.[0]).toEqual({
      pathname: "/app/host/sessions/new",
      search: "?returnTo=%2Fapp%2Fhost&section=records&source=ai",
      hash: "#audit",
    });
    expect(replace.mock.calls[0]?.[1]).toBe(routeState);

    const laterRouteState = { returnTo: "/app/host/sessions/session-1" };
    rendered.rerender(renderAt({
      pathname: "/app/host/sessions/new",
      search: "?from=dashboard&records=json",
      hash: "#history",
      state: laterRouteState,
      key: "legacy-json",
    }));

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(2));
    expect(replace.mock.calls[1]?.[0]).toEqual({
      pathname: "/app/host/sessions/new",
      search: "?from=dashboard&section=records&source=json",
      hash: "#history",
    });
    expect(replace.mock.calls[1]?.[1]).toBe(laterRouteState);
  });
});
