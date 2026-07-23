import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
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

vi.mock("@/features/host/api/host-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/host/api/host-api")>();
  return {
    ...actual,
    commitHostSessionImport: vi.fn(),
  };
});

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useBlocker: () => ({ state: "unblocked" }),
    useLoaderData: () => ({ sessionId: "session-7" }),
    useParams: () => ({ clubSlug: "reading-sai", sessionId: "session-7" }),
  };
});

vi.mock("@/features/host/ui/host-session-editor", () => ({
  default: ({ actions }: { actions: { commitSessionImport: (sessionId: string, request: never) => Promise<unknown> } }) => (
    <button
      type="button"
      onClick={() =>
        actions.commitSessionImport("session-7", {
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
  ),
}));

import { commitHostSessionImport } from "@/features/host/api/host-api";

describe("EditHostSessionRoute query actions", () => {
  beforeEach(() => {
    vi.mocked(commitHostSessionImport).mockReset();
    vi.mocked(commitHostSessionImport).mockResolvedValue({
      sessionId: "session-7",
      publication: { summary: "세션 요약" },
      highlights: [],
      oneLineReviews: [],
      feedbackDocument: {
        uploaded: true,
        fileName: "session-7.md",
        title: "세션 기록",
        uploadedAt: "2026-05-18T00:00:00Z",
      },
    });
  });

  it("keeps editor rendering from query seeded data and invalidates notifications after import commit", async () => {
    const user = userEvent.setup();
    const onSessionRecordsChanged = vi.fn().mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
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
    client.setQueryData(
      hostSessionRecordEditorQuery("session-7", { clubSlug: "reading-sai" }).queryKey,
      {
        sessionId: "session-7",
        liveRevision: 0,
        liveSnapshot: {
          schema: "readmates-session-record:v1",
          visibility: "HOST_ONLY",
          publicationSummary: "",
          highlights: [],
          oneLineReviews: [],
          feedbackDocument: { fileName: "feedback.md", title: "", markdown: "" },
        },
        draft: null,
        draftLiveBaseStale: false,
        validationSummary: { valid: true, issues: [] },
      },
    );
    client.setQueryData(
      hostSessionRecordHistoryQuery(
        "session-7",
        { limit: 30 },
        { clubSlug: "reading-sai" },
      ).queryKey,
      { items: [], nextCursor: null },
    );
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <EditHostSessionRoute onSessionRecordsChanged={onSessionRecordsChanged} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "commit import" }));

    expect(commitHostSessionImport).toHaveBeenCalledWith("session-7", expect.objectContaining({
      format: "readmates-session-import:v1",
    }));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: hostNotificationKeys.scope({ clubSlug: "reading-sai" }),
    });
    expect(onSessionRecordsChanged).toHaveBeenCalledWith({
      sessionId: "session-7",
      clubSlug: "reading-sai",
    });
  });
});
