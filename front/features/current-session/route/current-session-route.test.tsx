import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentSessionContractFixture } from "@/tests/unit/api-contract-fixtures";
import { ReadmatesApiError } from "@/shared/api/errors";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

vi.mock("@/features/current-session/api/current-session-api", () => ({
  getCurrentSession: vi.fn(),
  markCurrentScheduleSeen: vi.fn(),
  saveCurrentSessionCheckin: vi.fn(),
  saveCurrentSessionLongReview: vi.fn(),
  saveCurrentSessionOneLineReview: vi.fn(),
  saveCurrentSessionQuestions: vi.fn(),
  updateCurrentSessionRsvp: vi.fn(),
}));

import {
  getCurrentSession,
  markCurrentScheduleSeen,
} from "@/features/current-session/api/current-session-api";
import { currentSessionKeys, currentSessionQuery } from "@/features/current-session/queries/current-session-queries";
import { CurrentSessionRoute } from "./current-session-route";

const context = { clubSlug: "reading-sai" };
const auth = {
  authenticated: true,
  userId: "user-active-member",
  membershipId: "member-guest",
  clubId: "club-id",
  email: "member@example.com",
  displayName: "멤버",
  accountName: "멤버",
  role: "MEMBER",
  membershipStatus: "ACTIVE",
  approvalState: "ACTIVE",
} as const satisfies AuthMeResponse;

function sessionAtRevision(scheduleRevision: number, sessionId?: string) {
  const currentSession = currentSessionContractFixture.currentSession;
  if (!currentSession) throw new Error("fixture must include a current session");

  return {
    currentSession: {
      ...currentSession,
      sessionId: sessionId ?? currentSession.sessionId,
      scheduleRevision,
      mySeenScheduleRevision: scheduleRevision - 1,
      myScheduleSeenAt: null,
    },
  };
}

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

function renderRoute(
  client: QueryClient,
  current = sessionAtRevision(7),
  routeAuth: AuthMeResponse = auth,
) {
  client.setQueryData(currentSessionKeys.current(context), current);
  const router = createMemoryRouter(
    [{
      path: "/clubs/:clubSlug/app/session/current",
      element: <CurrentSessionRoute />,
      loader: () => ({ auth: routeAuth, current }),
      hydrateFallbackElement: <div>모임을 불러오는 중</div>,
    }],
    { initialEntries: ["/clubs/reading-sai/app/session/current"] },
  );

  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(getCurrentSession).mockReset();
  vi.mocked(markCurrentScheduleSeen).mockReset();
});

afterEach(cleanup);

describe("current schedule rendered acknowledgement", () => {
  it("keeps loader and prefetch reads side-effect free", async () => {
    const client = createClient();
    vi.mocked(getCurrentSession).mockResolvedValue(sessionAtRevision(7));

    await client.fetchQuery(currentSessionQuery(context));

    expect(getCurrentSession).toHaveBeenCalledTimes(1);
    expect(markCurrentScheduleSeen).not.toHaveBeenCalled();
  });

  it("marks the exact rendered revision once and skips the same cached remount", async () => {
    const client = createClient();
    vi.mocked(markCurrentScheduleSeen).mockResolvedValue({
      scheduleRevision: 7,
      seenAt: "2026-08-29T00:00:00Z",
    });

    const first = renderRoute(client);
    expect((await screen.findAllByRole("heading", { name: "테스트 책" })).length).toBeGreaterThan(0);
    await waitFor(() => expect(markCurrentScheduleSeen).toHaveBeenCalledTimes(1));
    expect(markCurrentScheduleSeen).toHaveBeenCalledWith(7, context);
    first.unmount();

    renderRoute(client, client.getQueryData(currentSessionKeys.current(context)) ?? sessionAtRevision(7));
    await waitFor(() => expect(screen.getAllByRole("heading", { name: "테스트 책" }).length).toBeGreaterThan(0));
    expect(markCurrentScheduleSeen).toHaveBeenCalledTimes(1);
  });

  it("acknowledges the same revision again when the rendered session changes", async () => {
    const client = createClient();
    vi.mocked(markCurrentScheduleSeen)
      .mockResolvedValueOnce({ scheduleRevision: 7, seenAt: "2026-08-29T00:00:00Z" })
      .mockResolvedValueOnce({ scheduleRevision: 7, seenAt: "2026-08-29T00:01:00Z" });

    const first = renderRoute(client, sessionAtRevision(7, "session-first"));
    await waitFor(() => expect(markCurrentScheduleSeen).toHaveBeenCalledTimes(1));
    first.unmount();

    renderRoute(client, sessionAtRevision(7, "session-next"));

    await waitFor(() => expect(markCurrentScheduleSeen).toHaveBeenCalledTimes(2));
    expect(markCurrentScheduleSeen).toHaveBeenNthCalledWith(2, 7, context);
  });

  it.each([
    ["VIEWER", { ...auth, membershipStatus: "VIEWER", approvalState: "VIEWER" }],
    ["SUSPENDED", { ...auth, membershipStatus: "SUSPENDED", approvalState: "SUSPENDED" }],
  ] satisfies Array<[string, AuthMeResponse]>) (
    "does not acknowledge or offer an impossible retry to a %s membership",
    async (_status, routeAuth) => {
      const client = createClient();
      vi.mocked(markCurrentScheduleSeen).mockRejectedValue(new TypeError("offline"));

      renderRoute(client, sessionAtRevision(7), routeAuth);
      expect((await screen.findAllByRole("heading", { name: "테스트 책" })).length).toBeGreaterThan(0);
      await act(async () => Promise.resolve());

      expect(markCurrentScheduleSeen).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "일정 확인 다시 기록" })).not.toBeInTheDocument();
    },
  );

  it("does not acknowledge or offer an impossible retry when the member is excluded from the session", async () => {
    const client = createClient();
    const current = sessionAtRevision(7);
    const excludedCurrent = {
      currentSession: {
        ...current.currentSession,
        attendees: current.currentSession.attendees.map((attendee) => (
          attendee.membershipId === auth.membershipId
            ? { ...attendee, participationStatus: "REMOVED" as const }
            : attendee
        )),
      },
    };
    vi.mocked(markCurrentScheduleSeen).mockRejectedValue(new TypeError("offline"));

    renderRoute(client, excludedCurrent);
    expect((await screen.findAllByRole("heading", { name: "테스트 책" })).length).toBeGreaterThan(0);
    await act(async () => Promise.resolve());

    expect(markCurrentScheduleSeen).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "일정 확인 다시 기록" })).not.toBeInTheDocument();
  });

  it("invalidates a conflicted revision and acknowledges only the newly rendered revision", async () => {
    const client = createClient();
    vi.mocked(getCurrentSession).mockResolvedValue(sessionAtRevision(8));
    vi.mocked(markCurrentScheduleSeen)
      .mockRejectedValueOnce(new ReadmatesApiError(
        { code: "SCHEDULE_REVISION_CONFLICT", message: "revision changed", status: 409, fallback: false },
        new Response(null, { status: 409 }),
      ))
      .mockResolvedValueOnce({ scheduleRevision: 8, seenAt: "2026-08-29T00:01:00Z" });

    renderRoute(client);

    await waitFor(() => {
      expect(markCurrentScheduleSeen).toHaveBeenCalledTimes(2);
    });
    expect(vi.mocked(markCurrentScheduleSeen).mock.calls.map(([revision]) => revision)).toEqual([7, 8]);
    expect(getCurrentSession).toHaveBeenCalledTimes(1);
  });

  it("offers an inline keyboard retry without blocking RSVP or questions after a network error", async () => {
    const user = userEvent.setup();
    const client = createClient();
    vi.mocked(markCurrentScheduleSeen)
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce({ scheduleRevision: 7, seenAt: "2026-08-29T00:02:00Z" });

    renderRoute(client);

    const retry = await screen.findByRole("button", { name: "일정 확인 다시 기록" });
    expect(screen.getAllByRole("button", { name: "참석" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("textbox", { name: "질문 1 내용" }).length).toBeGreaterThan(0);

    retry.focus();
    expect(retry).toHaveFocus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(markCurrentScheduleSeen).toHaveBeenCalledTimes(2));
  });

  it("releases a non-conflict acknowledgement that rejects after unmount", async () => {
    const client = createClient();
    const pendingWrite = deferred<{ scheduleRevision: number; seenAt: string }>();
    vi.mocked(markCurrentScheduleSeen)
      .mockReturnValueOnce(pendingWrite.promise)
      .mockResolvedValueOnce({ scheduleRevision: 7, seenAt: "2026-08-29T00:03:00Z" });

    const first = renderRoute(client);
    await waitFor(() => expect(markCurrentScheduleSeen).toHaveBeenCalledTimes(1));
    first.unmount();

    await act(async () => {
      pendingWrite.reject(new TypeError("offline after unmount"));
      await Promise.resolve();
    });

    renderRoute(client);

    await waitFor(() => expect(markCurrentScheduleSeen).toHaveBeenCalledTimes(2));
    expect(markCurrentScheduleSeen).toHaveBeenLastCalledWith(7, context);
  });
});
