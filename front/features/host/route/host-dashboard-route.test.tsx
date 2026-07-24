import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  visibilityMutation: {
    mutateAsync: vi.fn(),
  },
  openMutation: {
    mutateAsync: vi.fn(),
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (query: { testData?: unknown }) => ({
    data: query.testData,
    isError: false,
  }),
  useQueryClient: () => ({
    fetchQuery: vi.fn(),
  }),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useLoaderData: () => ({
      current: { currentSession: null },
      data: {
        rsvpPending: 0,
        checkinMissing: 0,
        publishPending: 0,
        feedbackPending: 0,
      },
      hostSessions: { items: [], nextCursor: null },
      notifications: {
        pending: 0,
        failed: 0,
        dead: 0,
        sentLast24h: 0,
        latestFailures: [],
      },
      clubOperations: null,
    }),
    useParams: () => ({ clubSlug: "reading-sai" }),
  };
});

vi.mock("@/features/host/queries/host-session-queries", () => ({
  DEFAULT_HOST_SESSION_LIST_LIMIT: 50,
  hostCurrentSessionQuery: () => ({ testData: { currentSession: null } }),
  hostDashboardQuery: () => ({
    testData: {
      rsvpPending: 0,
      checkinMissing: 0,
      publishPending: 0,
      feedbackPending: 0,
    },
  }),
  hostSessionListQuery: () => ({ testData: { items: [], nextCursor: null } }),
  useOpenHostSessionMutation: () => routeMocks.openMutation,
  useSaveHostSessionVisibilityMutation: () => routeMocks.visibilityMutation,
}));

vi.mock("@/features/host/queries/host-notification-queries", () => ({
  hostNotificationSummaryQuery: () => ({
    testData: {
      pending: 0,
      failed: 0,
      dead: 0,
      sentLast24h: 0,
      latestFailures: [],
    },
  }),
}));

vi.mock("@/features/host/queries/host-club-operations-queries", () => ({
  hostClubOperationsQuery: () => ({ testData: null }),
}));

vi.mock("@/features/host/queries/host-session-record-queries", () => ({
  hostSessionRecordLedgerQuery: () => ({
    testData: {
      items: [],
      nextCursor: null,
      summary: {
        needsAttentionCount: 0,
        incompletePublishedCount: 0,
        draftCount: 0,
      },
    },
  }),
}));

vi.mock("@/features/host/route/host-dashboard-data", () => ({
  hostDashboardActions: {
    updateCurrentSessionParticipation: vi.fn(),
  },
}));

vi.mock("@/features/host/ui/host-dashboard", () => ({
  default: ({
    actions,
  }: {
    actions: {
      updateSessionVisibility: (
        sessionId: string,
        request: { visibility: "MEMBER" },
      ) => Promise<void>;
    };
  }) => (
    <button
      type="button"
      onClick={() => {
        void actions.updateSessionVisibility("session-next", { visibility: "MEMBER" })
          .catch(() => undefined);
      }}
    >
      멤버에게 공개
    </button>
  ),
}));

vi.mock("@/features/host/route/host-notification-composer-controller", () => ({
  HostNotificationComposerController: ({
    request,
    onClose,
  }: {
    request: null | {
      sessionId: string;
      eventType: string;
      contentRevision: string;
      origin: string;
    };
    onClose: () => void;
  }) => request ? (
    <div role="dialog" aria-label="멤버에게 알림을 보낼까요?">
      <span>{`${request.sessionId}:${request.eventType}:${request.contentRevision}:${request.origin}`}</span>
      <button type="button" onClick={onClose}>이번에는 보내지 않기</button>
    </div>
  ) : null,
}));

vi.mock("@/features/host/club/ui/ClubAiDefaultsSection", () => ({
  ClubAiDefaultsSection: () => null,
}));

import { HostDashboardRoute } from "./host-dashboard-route";

const publishedSession = {
  sessionId: "session-next",
  visibility: "MEMBER" as const,
};

function renderRoute() {
  return render(<HostDashboardRoute />);
}

beforeEach(() => {
  routeMocks.visibilityMutation.mutateAsync.mockReset();
  routeMocks.openMutation.mutateAsync.mockReset();
});

describe("HostDashboardRoute next-book composer", () => {
  it("opens only after the first successful publication and ignores a later null composer", async () => {
    routeMocks.visibilityMutation.mutateAsync
      .mockResolvedValueOnce({
        session: publishedSession,
        composer: {
          sessionId: "session-next",
          eventType: "NEXT_BOOK_PUBLISHED",
          contentRevision: "a".repeat(64),
        },
      })
      .mockResolvedValueOnce({
        session: publishedSession,
        composer: null,
      });
    renderRoute();

    await userEvent.click(screen.getByRole("button", { name: "멤버에게 공개" }));

    expect(await screen.findByRole("dialog", {
      name: "멤버에게 알림을 보낼까요?",
    })).toHaveTextContent(
      `session-next:NEXT_BOOK_PUBLISHED:${"a".repeat(64)}:FIRST_PUBLICATION`,
    );

    await userEvent.click(screen.getByRole("button", {
      name: "이번에는 보내지 않기",
    }));
    await userEvent.click(screen.getByRole("button", { name: "멤버에게 공개" }));

    expect(screen.queryByRole("dialog", {
      name: "멤버에게 알림을 보낼까요?",
    })).not.toBeInTheDocument();
  });

  it("does not open when the visibility save fails", async () => {
    routeMocks.visibilityMutation.mutateAsync.mockRejectedValue(
      new Error("visibility save failed"),
    );
    renderRoute();

    await userEvent.click(screen.getByRole("button", { name: "멤버에게 공개" }));

    expect(screen.queryByRole("dialog", {
      name: "멤버에게 알림을 보낼까요?",
    })).not.toBeInTheDocument();
  });
});
