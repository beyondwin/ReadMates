import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditHostSessionRoute, NewHostSessionRoute } from "@/features/host/route/host-session-editor-route";
import { hostNotificationKeys } from "@/features/host/queries/host-notification-queries";
import {
  hostSessionRecordEditorQuery,
  hostSessionRecordHistoryQuery,
} from "@/features/host/queries/host-session-record-queries";
import {
  hostSessionDetailQuery,
  hostSessionManualDispatchesQuery,
} from "@/features/host/queries/host-session-queries";
import { hostSessionDetailContractFixture } from "./api-contract-fixtures";

const routeUnitMocks = vi.hoisted(() => ({
  capturedProps: null as Record<string, unknown> | null,
  fetchRecordEditor: vi.fn(),
  useRealEditor: false,
}));

vi.mock("@/features/host/api/host-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/host/api/host-api")>();
  return {
    ...actual,
    closeHostSession: vi.fn(),
    commitHostSessionImport: vi.fn(),
    createHostSession: vi.fn(),
    fetchHostSessionScheduleDefaults: vi.fn(),
    openHostSession: vi.fn(),
    publishHostSession: vi.fn(),
    reopenHostSession: vi.fn(),
    returnHostSessionToDraft: vi.fn(),
    unpublishHostSession: vi.fn(),
  };
});

vi.mock("@/features/host/api/host-session-record-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/host/api/host-session-record-api")>();
  return {
    ...actual,
    fetchHostSessionRecordEditor: routeUnitMocks.fetchRecordEditor,
  };
});

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useBlocker: () => ({ state: "unblocked" }),
    useLoaderData: () => ({ sessionId: "session-7" }),
    useParams: () => ({ clubSlug: "reading-sai", sessionId: "session-7" }),
  };
});

vi.mock("@/features/host/ui/host-session-editor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/host/ui/host-session-editor")>();
  return {
    default: (props: {
      actions: {
        commitSessionImport: (sessionId: string, request: never) => Promise<unknown>;
        openSession: (sessionId: string) => Promise<unknown>;
        closeSession: (sessionId: string) => Promise<unknown>;
        publishSession: (sessionId: string) => Promise<unknown>;
        reopenSession: (sessionId: string, request: { reasonCode: string }) => Promise<unknown>;
        unpublishSession: (sessionId: string, request: { reasonCode: string }) => Promise<unknown>;
        returnSessionToDraft: (sessionId: string, request: { reasonCode: string }) => Promise<unknown>;
      };
    }) => {
      routeUnitMocks.capturedProps = props;
      if (routeUnitMocks.useRealEditor) {
        return <actual.default {...props} />;
      }
      return (
        <>
          <button
            type="button"
            onClick={() =>
              props.actions.commitSessionImport("session-7", {
                format: "readmates-session-import:v1",
                session: { number: 7, bookTitle: "테스트 책", meetingDate: "2026-05-20" },
                publication: { summary: "세션 요약" },
                highlights: [],
                oneLineReviews: [],
                feedbackDocument: { fileName: "session-7.md", markdown: "# 세션 기록" },
                recordVisibility: "MEMBER",
              } as never)
            }
          >
            commit import
          </button>
          <button type="button" onClick={() => void props.actions.openSession("session-7")}>
            open session
          </button>
          <button type="button" onClick={() => void props.actions.closeSession("session-7")}>
            close session
          </button>
          <button type="button" onClick={() => void props.actions.publishSession("session-7")}>
            publish session
          </button>
          <button
            type="button"
            onClick={() => void props.actions.reopenSession("session-7", { reasonCode: "ACCIDENTAL_TRANSITION" })}
          >
            reopen session
          </button>
          <button
            type="button"
            onClick={() => void props.actions.unpublishSession("session-7", { reasonCode: "ACCIDENTAL_TRANSITION" })}
          >
            unpublish session
          </button>
          <button
            type="button"
            onClick={() =>
              void props.actions.returnSessionToDraft("session-7", { reasonCode: "ACCIDENTAL_TRANSITION" })
            }
          >
            return session to draft
          </button>
        </>
      );
    },
  };
});

import {
  closeHostSession,
  commitHostSessionImport,
  createHostSession,
  fetchHostSessionScheduleDefaults,
  openHostSession,
  publishHostSession,
  reopenHostSession,
  returnHostSessionToDraft,
  unpublishHostSession,
} from "@/features/host/api/host-api";
import { ReadmatesApiError } from "@/shared/api/errors";
import type { HostSessionScheduleDefaults } from "@/features/host/model/host-schedule-defaults-model";

const recordEditorResponse = {
  sessionId: "session-7",
  liveRevision: 0,
  liveSessionUpdatedAt: "2026-06-01T00:00:00Z",
  liveSnapshot: {
    schema: "readmates-session-record:v1" as const,
    visibility: "HOST_ONLY" as const,
    publicationSummary: "",
    highlights: [],
    oneLineReviews: [],
    feedbackDocument: { fileName: "feedback.md", title: "", markdown: "" },
  },
  draft: null,
  draftLiveBaseStale: false,
  validationSummary: { valid: true, issues: [] },
};

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function seedEditRouteQueries(client: QueryClient, options?: { recordEditor?: boolean }) {
  client.setQueryData(
    hostSessionDetailQuery("session-7", { clubSlug: "reading-sai" }).queryKey,
    hostSessionDetailContractFixture,
  );
  client.setQueryData(
    hostSessionManualDispatchesQuery(
      { sessionId: "session-7", page: { limit: 20 } },
      { clubSlug: "reading-sai" },
    ).queryKey,
    { items: [], nextCursor: null },
  );
  if (options?.recordEditor !== false) {
    client.setQueryData(
      hostSessionRecordEditorQuery("session-7", { clubSlug: "reading-sai" }).queryKey,
      recordEditorResponse,
    );
  }
  client.setQueryData(
    hostSessionRecordHistoryQuery(
      "session-7",
      { limit: 30 },
      { clubSlug: "reading-sai" },
    ).queryKey,
    { items: [], nextCursor: null },
  );
}

function renderEditRoute(client: QueryClient, onSessionRecordsChanged = vi.fn()) {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/clubs/reading-sai/app/host/sessions/session-7/edit"]}>
        <EditHostSessionRoute onSessionRecordsChanged={onSessionRecordsChanged} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("EditHostSessionRoute query actions", () => {
  beforeEach(() => {
    routeUnitMocks.capturedProps = null;
    routeUnitMocks.useRealEditor = false;
    routeUnitMocks.fetchRecordEditor.mockReset();
    vi.mocked(commitHostSessionImport).mockReset();
    vi.mocked(commitHostSessionImport).mockResolvedValue({
      sessionId: "session-7",
      draftRevision: 5,
      baseLiveRevision: 0,
      liveApplied: false,
    });
    for (const apiFn of [
      openHostSession,
      closeHostSession,
      publishHostSession,
      reopenHostSession,
      unpublishHostSession,
      returnHostSessionToDraft,
    ]) {
      vi.mocked(apiFn).mockReset();
      vi.mocked(apiFn).mockResolvedValue(
        new Response(JSON.stringify(hostSessionDetailContractFixture), { status: 200 }) as never,
      );
    }
  });

  it("keeps editor rendering from query seeded data and leaves notifications untouched after import commit", async () => {
    const user = userEvent.setup();
    const onSessionRecordsChanged = vi.fn().mockResolvedValue(undefined);
    const client = createClient();
    seedEditRouteQueries(client);
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    renderEditRoute(client, onSessionRecordsChanged);

    await user.click(screen.getByRole("button", { name: "commit import" }));

    expect(commitHostSessionImport).toHaveBeenCalledWith("session-7", expect.objectContaining({
      format: "readmates-session-import:v1",
    }));
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: hostNotificationKeys.scope({ clubSlug: "reading-sai" }),
    });
    expect(onSessionRecordsChanged).toHaveBeenCalledWith({
      sessionId: "session-7",
      clubSlug: "reading-sai",
    });
  });

  it.each([
    ["open", "open session", openHostSession],
    ["close", "close session", closeHostSession],
    ["publish", "publish session", publishHostSession],
    ["reopen", "reopen session", reopenHostSession],
    ["unpublish", "unpublish session", unpublishHostSession],
    ["return-to-draft", "return session to draft", returnHostSessionToDraft],
  ] as const)("notifies app composition after successful %s", async (_name, label, apiFn) => {
    const user = userEvent.setup();
    const onSessionRecordsChanged = vi.fn().mockResolvedValue(undefined);
    const client = createClient();
    seedEditRouteQueries(client);

    renderEditRoute(client, onSessionRecordsChanged);
    await user.click(screen.getByRole("button", { name: label }));

    if (_name === "reopen" || _name === "unpublish" || _name === "return-to-draft") {
      expect(apiFn).toHaveBeenCalledWith("session-7", { reasonCode: "ACCIDENTAL_TRANSITION" });
    } else {
      expect(apiFn).toHaveBeenCalledWith("session-7");
    }
    expect(onSessionRecordsChanged).toHaveBeenCalledWith({
      sessionId: "session-7",
      clubSlug: "reading-sai",
    });
  });

  it("does not notify app composition when reopen is rejected", async () => {
    const user = userEvent.setup();
    const onSessionRecordsChanged = vi.fn().mockResolvedValue(undefined);
    const client = createClient();
    seedEditRouteQueries(client);
    vi.mocked(reopenHostSession).mockResolvedValue(
      new Response(JSON.stringify({
        code: "SESSION_OPEN_ALREADY_EXISTS",
        message: "이미 진행 중인 모임이 있습니다. 그 모임을 마치거나 작성 중으로 되돌린 뒤 다시 시도하세요.",
        status: 409,
        openSessionId: "00000000-0000-0000-0000-000000000307",
      }), { status: 409 }) as never,
    );

    renderEditRoute(client, onSessionRecordsChanged);
    await user.click(screen.getByRole("button", { name: "reopen session" }));

    expect(reopenHostSession).toHaveBeenCalledWith("session-7", { reasonCode: "ACCIDENTAL_TRANSITION" });
    expect(onSessionRecordsChanged).not.toHaveBeenCalled();
  });

  it("keeps the editor page hierarchy visible while route queries have no data yet", () => {
    const client = createClient();
    routeUnitMocks.fetchRecordEditor.mockImplementation(() => new Promise(() => undefined));

    renderEditRoute(client);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("세션 기록 편집 정보를 불러오는 중입니다.");
    expect(status.closest("main")).toHaveClass("rm-host-session-editor");
    expect(screen.queryByRole("heading", { name: "세션 문서 편집" })).not.toBeInTheDocument();
    expect(routeUnitMocks.capturedProps).toBeNull();
  });

  it("offers a focused record editor retry after its query fails", async () => {
    const user = userEvent.setup();
    const client = createClient();
    seedEditRouteQueries(client, { recordEditor: false });
    routeUnitMocks.fetchRecordEditor
      .mockRejectedValueOnce(new Error("record editor unavailable"))
      .mockResolvedValueOnce(recordEditorResponse);

    renderEditRoute(client);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "세션 기록 편집 정보를 불러오지 못했습니다.",
    );
    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByRole("button", { name: "commit import" })).toBeInTheDocument();
    expect(routeUnitMocks.fetchRecordEditor).toHaveBeenCalledTimes(2);
  });
});

const clubScheduleDefaults: HostSessionScheduleDefaults = {
  automatic: {
    startTime: "19:30",
    endTime: "21:30",
    locationLabel: "온라인",
    accessScope: "GUEST_READABLE",
    suggestedDate: "2026-06-11",
    questionDeadlineOffsetDays: 1,
  },
  previousOnlineMeeting: {
    meetingUrl: "https://meeting.invalid/club",
    meetingPasscode: "room-code-2048",
  },
  hints: ["이전 모임과 같은 시간으로 넣었습니다."],
};

function scheduleDefaultsApiError(status: number) {
  return new ReadmatesApiError(
    { code: "TEST_ERROR", message: "test", status, fallback: false },
    new Response(JSON.stringify({ code: "TEST_ERROR", message: "test", status }), { status }),
  );
}

function deferredScheduleDefaults() {
  let resolve!: (value: HostSessionScheduleDefaults) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<HostSessionScheduleDefaults>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderNewSessionRoute() {
  const client = createClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/clubs/reading-sai/app/host/sessions/new?section=basic"]}>
        <NewHostSessionRoute />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

describe("NewHostSessionRoute schedule defaults", () => {
  beforeEach(() => {
    routeUnitMocks.useRealEditor = true;
    routeUnitMocks.capturedProps = null;
    vi.mocked(fetchHostSessionScheduleDefaults).mockReset();
    vi.mocked(createHostSession).mockReset();
    vi.mocked(createHostSession).mockResolvedValue(
      new Response(JSON.stringify({ sessionId: "created-session-8" }), { status: 201 }) as never,
    );
    vi.stubGlobal("location", { href: "" });
  });

  afterEach(() => {
    routeUnitMocks.useRealEditor = false;
    vi.unstubAllGlobals();
  });

  it("renders the editor with builtins while schedule defaults are pending", () => {
    vi.mocked(fetchHostSessionScheduleDefaults).mockReturnValue(new Promise(() => undefined));

    renderNewSessionRoute();

    expect(screen.getByRole("heading", { name: "세션 문서 만들기" })).toBeVisible();
    expect(screen.queryByText("세션 기록 편집 정보를 불러오는 중입니다.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("시작 시간")).toHaveValue("20:00");
    expect(screen.getByLabelText("장소")).toHaveValue("온라인");
    expect(screen.getByRole("status")).toHaveTextContent("기본 일정을 불러오는 중입니다.");
  });

  it("does not warn on a typed 404 and keeps builtins", async () => {
    vi.mocked(fetchHostSessionScheduleDefaults).mockRejectedValue(scheduleDefaultsApiError(404));

    renderNewSessionRoute();

    await waitFor(() => {
      expect(screen.queryByText("기본 일정을 불러오는 중입니다.")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("기본 일정을 불러오지 못해 기본값을 사용합니다")).not.toBeInTheDocument();
    expect(screen.getByLabelText("시작 시간")).toHaveValue("20:00");
    expect(screen.getAllByRole("button", { name: "세션 문서 저장" })[0]).toBeEnabled();
  });

  it.each([401, 403, 500])("shows a retryable warning for %s without blocking the editor", async (status) => {
    vi.mocked(fetchHostSessionScheduleDefaults).mockRejectedValue(scheduleDefaultsApiError(status));

    renderNewSessionRoute();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("기본 일정을 불러오지 못해 기본값을 사용합니다");
    expect(within(alert).getByRole("button", { name: "다시 시도" })).toBeVisible();
    expect(alert.closest("section")).toHaveAttribute("id", "host-editor-panel-basic-schedule");
    expect(screen.getByLabelText("세션 제목")).toBeEnabled();
    expect(screen.getAllByRole("button", { name: "세션 문서 저장" })[0]).toBeEnabled();
  });

  it("does not overwrite a cleared field when late defaults arrive", async () => {
    const user = userEvent.setup();
    const pending = deferredScheduleDefaults();
    vi.mocked(fetchHostSessionScheduleDefaults).mockReturnValue(pending.promise);

    renderNewSessionRoute();

    await user.clear(screen.getByLabelText("시작 시간"));
    await act(async () => {
      pending.resolve(clubScheduleDefaults);
    });

    await waitFor(() => {
      expect(screen.getByLabelText("모임 날짜")).toHaveValue("2026-06-11");
    });
    expect(screen.getByLabelText("시작 시간")).toHaveValue("");
    expect(screen.getByLabelText("미팅 URL")).toHaveValue("");
    expect(screen.getByLabelText("Passcode · 선택")).toHaveValue("");
  });

  it("submits empty meeting secrets until the host adopts previous online meeting info", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchHostSessionScheduleDefaults).mockResolvedValue(clubScheduleDefaults);

    renderNewSessionRoute();

    expect(await screen.findByRole("button", { name: "이전 온라인 모임 정보 사용" })).toBeVisible();
    expect(screen.queryByText("room-code-2048")).not.toBeInTheDocument();
    expect(screen.getByLabelText("미팅 URL")).toHaveValue("");

    await user.type(screen.getByLabelText("세션 제목"), "7회차 모임 · 새 책");
    await user.type(screen.getByLabelText("책 제목"), "새 책");
    await user.type(screen.getByLabelText("저자"), "새 저자");
    await user.click(screen.getAllByRole("button", { name: "세션 문서 저장" })[0]!);

    await waitFor(() => expect(createHostSession).toHaveBeenCalledTimes(1));
    expect(createHostSession).toHaveBeenCalledWith(expect.objectContaining({
      meetingUrl: "",
      meetingPasscode: "",
      startTime: "19:30",
      locationLabel: "온라인",
    }));
  });

  it("submits adopted meeting secrets and keeps them clearable", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchHostSessionScheduleDefaults).mockResolvedValue(clubScheduleDefaults);

    renderNewSessionRoute();

    await user.click(await screen.findByRole("button", { name: "이전 온라인 모임 정보 사용" }));
    expect(screen.queryByText("room-code-2048")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "현재 모임에 적용" }));
    expect(screen.getByLabelText("미팅 URL")).toHaveValue("https://meeting.invalid/club");
    expect(screen.getByLabelText("Passcode · 선택")).toHaveValue("room-code-2048");

    await user.clear(screen.getByLabelText("미팅 URL"));
    await user.clear(screen.getByLabelText("Passcode · 선택"));
    await user.type(screen.getByLabelText("세션 제목"), "7회차 모임 · 새 책");
    await user.type(screen.getByLabelText("책 제목"), "새 책");
    await user.type(screen.getByLabelText("저자"), "새 저자");
    await user.click(screen.getAllByRole("button", { name: "세션 문서 저장" })[0]!);

    await waitFor(() => expect(createHostSession).toHaveBeenCalledTimes(1));
    expect(createHostSession).toHaveBeenCalledWith(expect.objectContaining({
      meetingUrl: "",
      meetingPasscode: "",
    }));
  });

  it("retries a visible schedule-defaults failure without leaving the editor", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchHostSessionScheduleDefaults)
      .mockRejectedValueOnce(scheduleDefaultsApiError(500))
      .mockResolvedValueOnce(clubScheduleDefaults);

    renderNewSessionRoute();

    const alert = await screen.findByRole("alert");
    await user.click(within(alert).getByRole("button", { name: "다시 시도" }));

    await waitFor(() => {
      expect(screen.queryByText("기본 일정을 불러오지 못해 기본값을 사용합니다")).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("시작 시간")).toHaveValue("19:30");
    expect(screen.getByRole("heading", { name: "세션 문서 만들기" })).toBeVisible();
  });
});
