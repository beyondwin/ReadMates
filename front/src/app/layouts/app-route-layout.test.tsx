import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  useCloseHostSessionMutation,
  useDeleteHostSessionMutation,
  useOpenHostSessionMutation,
} from "@/features/host/queries/host-session-queries";
import {
  AuthActionsContext,
  AuthContext,
} from "@/src/app/auth-state";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { AppRouteLayout } from "./app-route-layout";

const hostAuth: AuthMeResponse = {
  authenticated: true,
  userId: "host-1",
  membershipId: "membership-host",
  clubId: "club-1",
  email: "host@example.com",
  displayName: "김호스트",
  accountName: "호스트",
  role: "HOST",
  membershipStatus: "ACTIVE",
  approvalState: "ACTIVE",
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type SessionMutationOperation = "open" | "close" | "delete";

function SessionMutationHarness({ operation }: { operation: SessionMutationOperation }) {
  const openMutation = useOpenHostSessionMutation();
  const closeMutation = useCloseHostSessionMutation();
  const deleteMutation = useDeleteHostSessionMutation();

  const mutate = {
    open: openMutation.mutateAsync,
    close: closeMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
  }[operation];

  return (
    <main>
      <button type="button" onClick={() => void mutate("session-7")}>
        {operation}
      </button>
    </main>
  );
}

function renderHostLayout({
  queryClient,
  child,
}: {
  queryClient: QueryClient;
  child: React.ReactNode;
}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthActionsContext.Provider value={{ markLoggedOut: vi.fn(), refreshAuth: vi.fn() }}>
        <AuthContext.Provider value={{ status: "ready", auth: hostAuth }}>
          <MemoryRouter initialEntries={["/app/host"]}>
            <Routes>
              <Route path="/app/host" element={<AppRouteLayout />}>
                <Route index element={child} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </AuthActionsContext.Provider>
    </QueryClientProvider>,
  );
}

function expectSessionLinks(href: string) {
  const links = screen.getAllByRole("link", { name: "세션" });
  expect(links).toHaveLength(2);
  for (const link of links) {
    expect(link).toHaveAttribute("href", href);
  }
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AppRouteLayout host session navigation", () => {
  it.each([
    {
      operation: "open" as const,
      initialSessionId: null,
      nextSessionId: "session-7",
      initialHref: "/app/host/sessions/new",
      nextHref: "/app/host/sessions/session-7/edit",
      mutationPath: "/api/bff/api/host/sessions/session-7/open",
      mutationMethod: "POST",
    },
    {
      operation: "close" as const,
      initialSessionId: "session-7",
      nextSessionId: null,
      initialHref: "/app/host/sessions/session-7/edit",
      nextHref: "/app/host/sessions/new",
      mutationPath: "/api/bff/api/host/sessions/session-7/close",
      mutationMethod: "POST",
    },
    {
      operation: "delete" as const,
      initialSessionId: "session-7",
      nextSessionId: null,
      initialHref: "/app/host/sessions/session-7/edit",
      nextHref: "/app/host/sessions/new",
      mutationPath: "/api/bff/api/host/sessions/session-7",
      mutationMethod: "DELETE",
    },
  ])(
    "refreshes the session destination after a successful $operation mutation",
    async ({
      operation,
      initialSessionId,
      nextSessionId,
      initialHref,
      nextHref,
      mutationPath,
      mutationMethod,
    }) => {
      let currentSessionId = initialSessionId;
      const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const path = input.toString();
        if (path === "/api/bff/api/sessions/current") {
          return Promise.resolve(
            jsonResponse({
              currentSession: currentSessionId === null ? null : { sessionId: currentSessionId },
            }),
          );
        }
        if (path === mutationPath && init?.method === mutationMethod) {
          currentSessionId = nextSessionId;
          return Promise.resolve(jsonResponse({}));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${path}`));
      });
      vi.stubGlobal("fetch", fetchMock);
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: 0, gcTime: 0 },
          mutations: { retry: false },
        },
      });
      const user = userEvent.setup();

      renderHostLayout({
        queryClient,
        child: <SessionMutationHarness operation={operation} />,
      });

      await waitFor(() => expectSessionLinks(initialHref));
      await user.click(screen.getByRole("button", { name: operation }));
      await waitFor(() => expectSessionLinks(nextHref));

      expect(
        fetchMock.mock.calls.filter(([input]) => input.toString() === "/api/bff/api/sessions/current"),
      ).toHaveLength(2);
    },
  );

  it("distinguishes loading from failure and recovers a transient current-session lookup", async () => {
    const initialRequest = deferred<Response>();
    const retryRequest = deferred<Response>();
    let currentRequest = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = input.toString();
      if (path === "/api/bff/api/sessions/current") {
        currentRequest += 1;
        return currentRequest === 1 ? initialRequest.promise : retryRequest.promise;
      }
      return Promise.reject(new Error(`Unexpected fetch: ${path}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 0, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    const user = userEvent.setup();

    renderHostLayout({
      queryClient,
      child: <main>host child</main>,
    });

    expect(screen.getAllByLabelText("세션 불러오는 중")).toHaveLength(2);

    await act(async () => {
      initialRequest.resolve(jsonResponse({ title: "Unavailable" }, 503));
      await initialRequest.promise;
    });

    const retryButtons = await screen.findAllByRole("button", { name: "세션 다시 확인" });
    expect(retryButtons).toHaveLength(2);
    expect(screen.queryByLabelText("세션 불러오는 중")).not.toBeInTheDocument();

    await user.click(retryButtons[0]);

    expect(await screen.findAllByRole("button", { name: "세션 다시 확인 중" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "세션 다시 확인 중" })[0]).toBeDisabled();

    await act(async () => {
      retryRequest.resolve(jsonResponse({ currentSession: { sessionId: "session-9" } }));
      await retryRequest.promise;
    });

    await waitFor(() => expectSessionLinks("/app/host/sessions/session-9/edit"));
    expect(currentRequest).toBe(2);
  });
});
