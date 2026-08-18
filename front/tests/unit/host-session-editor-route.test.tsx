import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditHostSessionRoute } from "@/features/host/route/host-session-editor-route";
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
}));

vi.mock("@/features/host/api/host-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/host/api/host-api")>();
  return {
    ...actual,
    closeHostSession: vi.fn(),
    commitHostSessionImport: vi.fn(),
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

vi.mock("@/features/host/ui/host-session-editor", () => ({
  default: (props: {
    actions: {
      commitSessionImport: (sessionId: string, request: never) => Promise<unknown>;
      closeSession: (sessionId: string) => Promise<unknown>;
      publishSession: (sessionId: string) => Promise<unknown>;
      reopenSession: (sessionId: string) => Promise<unknown>;
      unpublishSession: (sessionId: string) => Promise<unknown>;
      returnSessionToDraft: (sessionId: string) => Promise<unknown>;
    };
  }) => {
    routeUnitMocks.capturedProps = props;
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
        <button type="button" onClick={() => void props.actions.closeSession("session-7")}>
          close session
        </button>
        <button type="button" onClick={() => void props.actions.publishSession("session-7")}>
          publish session
        </button>
        <button type="button" onClick={() => void props.actions.reopenSession("session-7")}>
          reopen session
        </button>
        <button type="button" onClick={() => void props.actions.unpublishSession("session-7")}>
          unpublish session
        </button>
        <button type="button" onClick={() => void props.actions.returnSessionToDraft("session-7")}>
          return session to draft
        </button>
      </>
    );
  },
}));

import {
  closeHostSession,
  commitHostSessionImport,
  publishHostSession,
  reopenHostSession,
  returnHostSessionToDraft,
  unpublishHostSession,
} from "@/features/host/api/host-api";

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
    routeUnitMocks.fetchRecordEditor.mockReset();
    vi.mocked(commitHostSessionImport).mockReset();
    vi.mocked(commitHostSessionImport).mockResolvedValue({
      sessionId: "session-7",
      draftRevision: 5,
      baseLiveRevision: 0,
      liveApplied: false,
    });
    for (const apiFn of [
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

    expect(apiFn).toHaveBeenCalledWith("session-7");
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
        message: "이미 진행 중인 세션이 있습니다. 그 세션을 마감하거나 예정으로 되돌린 뒤 다시 시도하세요.",
        status: 409,
        openSessionId: "00000000-0000-0000-0000-000000000307",
      }), { status: 409 }) as never,
    );

    renderEditRoute(client, onSessionRecordsChanged);
    await user.click(screen.getByRole("button", { name: "reopen session" }));

    expect(reopenHostSession).toHaveBeenCalledWith("session-7");
    expect(onSessionRecordsChanged).not.toHaveBeenCalled();
  });

  it("keeps the editor page hierarchy visible while route queries have no data yet", () => {
    const client = createClient();
    routeUnitMocks.fetchRecordEditor.mockImplementation(() => new Promise(() => undefined));

    renderEditRoute(client);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("세션 기록 편집 정보를 불러오는 중입니다.");
    expect(status.closest("main")).toHaveClass("rm-host-session-editor");
    expect(screen.getByRole("heading", { name: "세션 문서 편집" })).toBeInTheDocument();
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
