import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HostMeetingWorkspaceRoute } from "./host-meeting-workspace-route";
import { hostMeetingWorkspaceLoaderFactory } from "./host-meeting-workspace-data";
import {
  hostPublicConvergenceQuery,
  hostSessionDetailQuery,
} from "@/features/host/queries/host-session-queries";
import { hostSensitiveStorage } from "@/features/host/storage/host-sensitive-storage";
import type { HostMeetingRecordReadiness } from "@/features/host/model/host-meeting-record-readiness";
import { formatDateTimeLabel } from "@/shared/ui/readmates-display";

const routeMocks = vi.hoisted(() => ({
  panelStates: {} as Record<string, unknown>,
  panelQueryInput: null as null | {
    task: string;
    sessionId: string;
    context: unknown;
    recordPrerequisite?: boolean;
  },
  restoreRevision: vi.fn(),
  fetchRestorePreview: vi.fn(),
  restoreChange: vi.fn(),
  reopenSession: vi.fn(),
  unpublishSession: vi.fn(),
  returnSessionToDraft: vi.fn(),
}));
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const OBSERVED_AT = "2026-08-25T01:02:03.000Z";

vi.mock("./host-loader-auth", () => ({ requireHostLoaderAuth: vi.fn() }));

vi.mock("@/features/host/queries/host-meeting-panel-queries", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/host/queries/host-meeting-panel-queries")>(),
  useHostMeetingPanelQueries: (input: typeof routeMocks.panelQueryInput) => {
    routeMocks.panelQueryInput = input;
    return routeMocks.panelStates;
  },
}));

vi.mock("@/features/host/queries/host-session-record-queries", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/host/queries/host-session-record-queries")>(),
  useRestoreHostSessionRevisionToDraftMutation: () => ({
    isPending: false,
    mutateAsync: routeMocks.restoreRevision,
  }),
}));

vi.mock("@/features/host/queries/host-session-recovery-queries", () => ({
  hostSessionRestorePreviewQuery: (_sessionId: string, changeId: string) => ({
    queryKey: ["restore-preview", changeId],
    queryFn: () => routeMocks.fetchRestorePreview(changeId),
  }),
  useRestoreHostSessionChangeMutation: () => ({
    isPending: false,
    mutateAsync: routeMocks.restoreChange,
  }),
}));

vi.mock("./host-meeting-workspace-actions", () => ({
  useHostMeetingWorkspaceActions: () => ({
    reopenSession: routeMocks.reopenSession,
    unpublishSession: routeMocks.unpublishSession,
    returnSessionToDraft: routeMocks.returnSessionToDraft,
  }),
}));

vi.mock("@/features/host/ui/host-session-editor", () => ({
  default: ({ returnTarget }: { returnTarget?: { href: string } }) => (
    <>
      <button type="button">기본 정보 편집</button>
      <output aria-label="return target">{returnTarget?.href ?? "purged"}</output>
    </>
  ),
}));

function loaderArgs(search = "") {
  return {
    params: { clubSlug: "reading-sai", sessionId: SESSION_ID },
    request: new Request(`https://readmates.test/clubs/reading-sai/app/host/sessions/${SESSION_ID}${search}`),
  };
}

function renderRoute(search: string, extras: {
  convergence?: {
    status: "PENDING" | "SUCCEEDED" | "FAILED";
    retryable: boolean;
  };
  session?: {
    state?: "DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED";
    title?: string;
  };
} = {}) {
  const { convergence, session } = extras;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
  client.setQueryData(
    hostSessionDetailQuery(SESSION_ID, { clubSlug: "reading-sai" }).queryKey,
    {
      sessionId: SESSION_ID,
      title: session?.title ?? "모임",
      bookTitle: "책",
      date: "2026-08-25",
      state: session?.state ?? "OPEN",
      visibility: "HOST_ONLY",
      versions: {
        sessionRevision: 7,
        exposureRevision: 2,
        participantSetRevision: 3,
        recordDraftRevision: 4,
        liveRecordRevision: 2,
        publicationRevision: 1,
      },
      attendees: [],
      feedbackDocument: { uploaded: false },
    },
  );
  if (convergence) {
    client.setQueryData(
      hostPublicConvergenceQuery(SESSION_ID, { clubSlug: "reading-sai" }).queryKey,
      {
        convergenceId: "10000000-0000-4000-8000-000000000001",
        originResult: "APPLIED",
        committedGeneration: 7,
        status: convergence.status,
        lastAttemptAt: "2026-08-26T04:30:00Z",
        retryable: convergence.retryable,
      },
    );
  }
  const router = createMemoryRouter([
    {
      path: "/clubs/:clubSlug/app/host/sessions/:sessionId",
      loader: () => ({ sessionId: SESSION_ID, mode: "active" }),
      element: <HostMeetingWorkspaceRoute returnTarget={{ href: "/private-return", label: "돌아가기" }} />,
    },
  ], { initialEntries: [`/clubs/reading-sai/app/host/sessions/${SESSION_ID}${search}`] });
  const rendered = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, client, ...rendered };
}

describe("host meeting workspace route", () => {
  beforeEach(() => {
    routeMocks.panelQueryInput = null;
    routeMocks.panelStates = {
      record: { kind: "loading" },
      history: { kind: "loading" },
      historyAuthority: { kind: "loading" },
      notifications: { kind: "loading" },
      recordReadiness: { status: "not-required" },
    };
    routeMocks.restoreRevision.mockReset().mockResolvedValue({ draftRevision: 5 });
    routeMocks.fetchRestorePreview.mockReset();
    routeMocks.restoreChange.mockReset().mockResolvedValue({ undoAvailable: false });
    routeMocks.reopenSession.mockReset().mockResolvedValue({ ok: true });
    routeMocks.unpublishSession.mockReset().mockResolvedValue({ ok: true });
    routeMocks.returnSessionToDraft.mockReset().mockResolvedValue({ ok: true });
  });

  it("shows origin commit and pending public convergence as separate route-owned facts", async () => {
    renderRoute("?task=overview", { convergence: { status: "PENDING", retryable: false } });

    expect(await screen.findByText("origin 반영 완료")).toBeInTheDocument();
    expect(screen.getByText("회수 진행 중")).toBeInTheDocument();
  });

  it("keeps the base loader limited to auth, scope, and base detail", async () => {
    const fetchQuery = vi.fn().mockResolvedValue({ sessionId: SESSION_ID, title: "모임" });

    await expect(hostMeetingWorkspaceLoaderFactory({ fetchQuery } as never)(loaderArgs() as never))
      .resolves.toEqual({ sessionId: SESSION_ID, mode: "active" });

    expect(fetchQuery).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(fetchQuery.mock.calls)).not.toMatch(/history|manual-dispatch|record-editor/);
  });

  it("falls back from an invalid section without mutating the URL", async () => {
    const { router } = renderRoute("?section=unknown&keep=1");

    expect(await screen.findByRole("button", { name: "기본 정보 편집" })).toBeEnabled();
    expect(router.state.location.search).toBe("?section=unknown&keep=1");
  });

  it("does not let an unavailable record panel block attendance work", async () => {
    renderRoute("?section=attendance");

    expect(await screen.findByRole("button", { name: "기본 정보 편집" })).toBeEnabled();
  });

  it("uses the authoritative draft revision when restoring history to a draft", async () => {
    const user = userEvent.setup();
    routeMocks.panelStates = {
      record: { kind: "loading" },
      history: { kind: "ready", data: historyPage(recordRevisionItem()) },
      historyAuthority: { kind: "ready", data: { draft: { draftRevision: 4 } } },
      notifications: { kind: "loading" },
    };
    renderRoute("?section=history");

    await user.click(await screen.findByRole("button", { name: "이 버전으로 초안 만들기" }));
    await user.click(screen.getByRole("button", { name: "작업 초안 만들기" }));

    expect(routeMocks.restoreRevision).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      revisionId: "revision-2",
      request: { expectedDraftRevision: 4 },
    });
  });

  it("preserves change-restore and lifecycle-reverse adapters in standalone history", async () => {
    const user = userEvent.setup();
    routeMocks.fetchRestorePreview.mockResolvedValue({
      sessionId: SESSION_ID,
      changeId: "change-1",
      kind: "BASIC_INFO",
      items: [{ field: "title", currentValue: "현재", targetValue: "이전", sensitive: false }],
      expectedCurrentHash: "current-hash",
      canRestore: true,
      blockedReason: null,
    });
    routeMocks.panelStates = {
      record: { kind: "loading" },
      history: { kind: "ready", data: historyPage(changeRestoreItem(), reverseLifecycleItem()) },
      historyAuthority: { kind: "ready", data: { draft: null } },
      notifications: { kind: "loading" },
    };
    renderRoute("?section=history");

    await user.click(await screen.findByRole("button", { name: "이 변경 되돌리기" }));
    const restoreDialog = await screen.findByRole("dialog", { name: "이 변경을 되돌릴까요?" });
    await user.click(within(restoreDialog).getByRole("button", { name: "되돌리기" }));
    await waitFor(() => expect(routeMocks.restoreChange).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      changeId: "change-1",
      request: { expectedCurrentHash: "current-hash" },
    }));

    await user.click(screen.getByRole("button", { name: "이 상태 되돌리기" }));
    const lifecycleDialog = await screen.findByRole("dialog", { name: "작성 중으로 되돌리기" });
    await user.selectOptions(within(lifecycleDialog).getByLabelText("변경 사유"), "ACCIDENTAL_TRANSITION");
    await user.click(within(lifecycleDialog).getByRole("button", { name: "작성 중으로 되돌리기" }));
    await waitFor(() => expect(routeMocks.returnSessionToDraft).toHaveBeenCalledWith(
      SESSION_ID,
      { reasonCode: "ACCIDENTAL_TRANSITION" },
    ));
  });

  it("keeps stale history readable while disabling only restore and reverse actions", async () => {
    routeMocks.panelStates = {
      record: { kind: "loading" },
      history: {
        kind: "stale-cached",
        data: historyPage(recordRevisionItem(), reverseLifecycleItem(), "cursor-2"),
        observedAt: "2026-08-25T01:02:03.000Z",
        retry: vi.fn(),
      },
      historyAuthority: { kind: "ready", data: { draft: { draftRevision: 4 } } },
      notifications: { kind: "loading" },
    };
    renderRoute("?section=history");

    expect(await screen.findByRole("button", { name: "이 버전으로 초안 만들기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "이 상태 되돌리기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "변경 기록 더 보기" })).toBeEnabled();
  });

  it("renders first-send notification actions for a known-empty dispatch ledger", async () => {
    routeMocks.panelStates = {
      record: { kind: "loading" },
      history: { kind: "loading" },
      historyAuthority: { kind: "loading" },
      notifications: { kind: "known-empty", data: { items: [], nextCursor: null } },
    };
    renderRoute("?section=notifications");

    expect(await screen.findByText("아직 발송한 알림이 없습니다")).toBeVisible();
    expect(screen.getByRole("link", { name: "모임 전날 리마인더" })).toHaveAttribute(
      "href",
      `/clubs/reading-sai/app/host/notifications?sessionId=${SESSION_ID}&eventType=SESSION_REMINDER_DUE`,
    );
    expect(screen.getByRole("button", { name: /다음 책 공개:/ })).toBeDisabled();
  });

  it("clears exact-club history dialogs and host-return state before replacement", async () => {
    const user = userEvent.setup();
    routeMocks.panelStates = {
      record: { kind: "loading" },
      history: { kind: "ready", data: historyPage(recordRevisionItem()) },
      historyAuthority: { kind: "ready", data: { draft: { draftRevision: 4 } } },
      notifications: { kind: "loading" },
    };
    const { router, unmount } = renderRoute("?section=history");
    await user.click(await screen.findByRole("button", { name: "이 버전으로 초안 만들기" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await act(() => hostSensitiveStorage.clearClub("other-club"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await act(() => hostSensitiveStorage.clearClub("reading-sai"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(() => router.navigate("?section=overview"));
    expect(await screen.findByLabelText("return target")).toHaveTextContent("purged");

    unmount();
    await expect(hostSensitiveStorage.clearClub("reading-sai")).resolves.toBeUndefined();
  });

  it("keeps CLOSED overview pending and disabled until record readiness is ready", async () => {
    setRecordPanel("pending");
    renderRoute("?task=overview", { session: { state: "CLOSED" } });

    const pending = await screen.findAllByRole("button", { name: "다음 할 일 확인 중" });
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((button) => button.hasAttribute("disabled"))).toBe(true);
    expectNoRecordMutationActions();
    expect(routeMocks.panelQueryInput?.recordPrerequisite).toBe(true);
  });

  it("keeps the meeting header and unrelated links when CLOSED record readiness is unavailable", async () => {
    const retry = vi.fn();
    setRecordPanel("unavailable", { retry });
    renderRoute("?task=overview", { session: { state: "CLOSED", title: "마친 모임" } });

    expect(await screen.findByRole("heading", { name: "마친 모임" })).toBeInTheDocument();
    expect(screen.getByText("기록 정리 중")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "기본 정보 편집" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "참석 응답" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "실제 출석" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "알림" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "변경 내역" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "다음 할 일 확인 중" }).every((button) => button.hasAttribute("disabled"))).toBe(true);
    expectNoRecordMutationActions();

    await userEvent.setup().click(screen.getByRole("button", { name: "모임 기록 다시 시도" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(routeMocks.reopenSession).not.toHaveBeenCalled();
    expect(routeMocks.unpublishSession).not.toHaveBeenCalled();
    expect(routeMocks.returnSessionToDraft).not.toHaveBeenCalled();
  });

  it("shows observed time and retry after a cached CLOSED record refetch fails", async () => {
    const retry = vi.fn();
    setRecordPanel("stale", {
      retry,
      facts: {
        hasDraft: false,
        draftLiveBaseStale: false,
        validationIssueCount: 0,
        hasAppliedRecord: true,
        publicationReady: true,
      },
    });
    renderRoute("?task=overview", { session: { state: "CLOSED" } });

    expect(await screen.findByText(new RegExp(formatDateTimeLabel(OBSERVED_AT)))).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "다음 할 일 확인 중" }).every((button) => button.hasAttribute("disabled"))).toBe(true);
    expectNoRecordMutationActions();

    await userEvent.setup().click(screen.getByRole("button", { name: "최신 내용 확인" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("chooses the exact CLOSED action once record readiness is ready", async () => {
    setRecordPanel("ready", {
      facts: {
        hasDraft: false,
        draftLiveBaseStale: false,
        validationIssueCount: 0,
        hasAppliedRecord: false,
        publicationReady: false,
      },
    });
    renderRoute("?task=overview", { session: { state: "CLOSED" } });

    const upload = await screen.findAllByRole("button", { name: "정리본 올리기" });
    expect(upload.length).toBeGreaterThan(0);
    expect(upload.every((button) => !button.hasAttribute("disabled"))).toBe(true);
    expect(screen.queryByRole("button", { name: "다음 할 일 확인 중" })).not.toBeInTheDocument();
  });

  it("publishes a ready applied CLOSED record instead of uploading", async () => {
    setRecordPanel("ready", {
      facts: {
        hasDraft: false,
        draftLiveBaseStale: false,
        validationIssueCount: 0,
        hasAppliedRecord: true,
        publicationReady: true,
      },
    });
    renderRoute("?task=overview", { session: { state: "CLOSED" } });

    expect(await screen.findAllByRole("button", { name: "게스트·멤버 노트에 기록 게시" })).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: "정리본 올리기" })).not.toBeInTheDocument();
  });

  it.each([
    ["pending", "pending"],
    ["ready without an applied record", "ready"],
  ] as const)("never shows upload or publish on PUBLISHED overview when record readiness is %s", async (_name, status) => {
    setRecordPanel(status);
    renderRoute("?task=overview", { session: { state: "PUBLISHED" } });

    expect(await screen.findAllByRole("link", { name: "공개 기록 보기" })).not.toHaveLength(0);
    expectNoRecordMutationActions();
    expect(routeMocks.panelQueryInput?.recordPrerequisite).toBe(true);
  });

  it("keeps HOST_ONLY audience and does not treat ready publication as public placement", async () => {
    setRecordPanel("ready", {
      facts: {
        hasDraft: true,
        draftLiveBaseStale: false,
        validationIssueCount: 0,
        hasAppliedRecord: true,
        publicationReady: true,
      },
    });
    renderRoute("?task=overview", { session: { state: "CLOSED" } });

    expect(await screen.findByText("호스트만 확인")).toBeVisible();
    expect(screen.getByText("공개 기록에 게시 안 됨")).toBeVisible();
    expect(screen.queryByText("공개 기록에 게시")).not.toBeInTheDocument();
  });

  it("opens 모임 정보 through the route-owned panel instead of an empty inert sheet", async () => {
    const { router } = renderRoute("?task=overview");
    await userEvent.setup().click(await screen.findByRole("button", { name: "모임 정보" }));

    expect(router.state.location.search).toMatch(/section=basic/);
    expect(screen.queryByRole("dialog", { name: "모임 정보" })).not.toBeInTheDocument();
    expect(document.querySelector(".rm-host-session-workspace__cta--desktop")?.closest("[inert]")).toBeNull();
  });

  it("does not enable the record prerequisite on OPEN overview", async () => {
    renderRoute("?task=overview");

    expect(await screen.findByRole("button", { name: "기본 정보 편집" })).toBeEnabled();
    expect(routeMocks.panelQueryInput?.recordPrerequisite).toBe(false);
  });
});

function expectNoRecordMutationActions() {
  expect(screen.queryByRole("button", { name: "정리본 올리기" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "게스트·멤버 노트에 기록 게시" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "반영 전 확인" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "기록에 반영" })).not.toBeInTheDocument();
}

function emptyRecordFacts() {
  return {
    hasDraft: false,
    draftLiveBaseStale: false,
    validationIssueCount: 0,
    hasAppliedRecord: false,
    publicationReady: false,
  };
}

function setRecordPanel(
  status: "pending" | "ready" | "stale" | "unavailable",
  options: {
    retry?: () => void;
    facts?: {
      hasDraft: boolean;
      draftLiveBaseStale: boolean;
      validationIssueCount: number;
      hasAppliedRecord: boolean;
      publicationReady: boolean;
    };
  } = {},
) {
  const facts = options.facts ?? emptyRecordFacts();
  const retry = options.retry ?? vi.fn();
  const recordReadiness: HostMeetingRecordReadiness = status === "pending"
    ? { status: "pending" }
    : status === "unavailable"
      ? { status: "unavailable", observedAt: null, retryable: true }
      : status === "stale"
        ? { status: "stale", facts, observedAt: OBSERVED_AT, retryable: true }
        : { status: "ready", facts, observedAt: OBSERVED_AT };
  routeMocks.panelStates = {
    record: status === "pending"
      ? { kind: "loading" }
      : status === "unavailable"
        ? { kind: "unavailable", retry }
        : status === "stale"
          ? {
            kind: "stale-cached",
            data: { draft: null, draftLiveBaseStale: facts.draftLiveBaseStale, liveRevision: facts.hasAppliedRecord ? 1 : 0, validationSummary: { valid: facts.publicationReady, issues: [] } },
            observedAt: OBSERVED_AT,
            retry,
          }
          : {
            kind: "ready",
            data: { draft: facts.hasDraft ? {} : null, draftLiveBaseStale: facts.draftLiveBaseStale, liveRevision: facts.hasAppliedRecord ? 1 : 0, validationSummary: { valid: facts.publicationReady, issues: [] } },
          },
    history: { kind: "loading" },
    historyAuthority: { kind: "loading" },
    notifications: { kind: "loading" },
    recordReadiness,
  };
}

function historyPage(...input: unknown[]) {
  const nextCursor = typeof input.at(-1) === "string" ? input.pop() as string : null;
  return { items: input, nextCursor };
}

function recordRevisionItem() {
  return {
    id: "history-1",
    type: "RECORD_REVISION_APPLIED",
    createdAt: "2026-08-25T10:00:00+09:00",
    actorMembershipId: "membership-host",
    changedFields: ["publicationSummary"],
    attendanceTransitions: [],
    revisionId: "revision-2",
    revisionVersion: 2,
    revisionSource: "MANUAL",
    restoredFromRevisionId: null,
    notificationEventId: null,
    recovery: { action: "RESTORE_RECORD_DRAFT", availability: "AVAILABLE" },
  };
}

function changeRestoreItem() {
  return {
    ...recordRevisionItem(),
    id: "change-1",
    type: "BASIC_INFO_UPDATED",
    revisionId: null,
    revisionVersion: null,
    revisionSource: null,
    recovery: { action: "RESTORE_CHANGE", availability: "AVAILABLE" },
  };
}

function reverseLifecycleItem() {
  return {
    ...recordRevisionItem(),
    id: "history-opened",
    type: "SESSION_OPENED",
    revisionId: null,
    revisionVersion: null,
    revisionSource: null,
    fromState: "DRAFT",
    toState: "OPEN",
    recovery: { action: "REVERSE_LIFECYCLE", availability: "AVAILABLE" },
  };
}
