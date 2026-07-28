import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from "react-router-dom";
import type { MyJourneyItem, MyJourneyPage } from "@/features/archive/model/my-reading-shelf-model";
import { MyRecordsRoute } from "./my-records-route";

const route = vi.hoisted(() => ({ loaderData: null as unknown }));
const api = vi.hoisted(() => ({ fetchMyJourney: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useLoaderData: () => route.loaderData,
}));
vi.mock("@/features/archive/api/archive-api", () => api);

afterEach(cleanup);

function item(overrides: Partial<MyJourneyItem> = {}): MyJourneyItem {
  return {
    sessionId: "session-9",
    sessionNumber: 9,
    bookTitle: "보이지 않는 도시들",
    bookAuthor: "이탈로 칼비노",
    bookImageUrl: null,
    date: "2026-07-22",
    readingProgress: 100,
    questionCount: 2,
    reviewCount: 1,
    feedbackDocument: { available: true, readable: true, lockedReason: null },
    ...overrides,
  };
}

const journey: MyJourneyPage = {
  items: [item()],
  nextCursor: "cursor-2",
  summary: {
    attendedSessionCount: 2,
    completedReadingCount: 1,
    questionCount: 2,
    reviewCount: 1,
    readableFeedbackDocumentCount: 1,
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={["/clubs/reading-sai/app/me/records"]}>
      <Routes>
        <Route path="/clubs/:clubSlug/app/me/records" element={<MyRecordsRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderNavigableRoute() {
  const router = createMemoryRouter([
    {
      path: "/clubs/:clubSlug/app/me/records",
      element: <MyRecordsRoute />,
    },
  ], { initialEntries: ["/clubs/reading-sai/app/me/records"] });

  return { ...render(<RouterProvider router={router} />), router };
}

describe("MyRecordsRoute", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    route.loaderData = journey;
  });

  it("appends only unseen continuation rows and removes the control on the last page", async () => {
    const user = userEvent.setup();
    const nextPage = deferred<MyJourneyPage>();
    const secondItem = item({ sessionId: "session-8", sessionNumber: 8, bookTitle: "두 번째 책" });
    let continuationRequests = 0;
    api.fetchMyJourney.mockImplementation(() => {
      continuationRequests += 1;
      return nextPage.promise;
    });
    renderRoute();

    await user.click(await screen.findByRole("button", { name: "기록 더 보기" }));
    expect(continuationRequests).toBe(1);

    await act(async () => {
      nextPage.resolve({ ...journey, items: [journey.items[0], secondItem], nextCursor: null });
      await nextPage.promise;
    });

    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "기록 더 보기" })).toBeNull();
    expect(api.fetchMyJourney).toHaveBeenCalledWith(
      { clubSlug: "reading-sai" },
      { limit: 12, cursor: "cursor-2" },
    );
  });

  it("keeps the first page and retries the failed cursor", async () => {
    const user = userEvent.setup();
    const failedPage = deferred<MyJourneyPage>();
    const retryPage = deferred<MyJourneyPage>();
    api.fetchMyJourney
      .mockReturnValueOnce(failedPage.promise)
      .mockReturnValueOnce(retryPage.promise);
    renderRoute();

    await user.click(await screen.findByRole("button", { name: "기록 더 보기" }));
    await act(async () => {
      failedPage.reject(new Error("continuation failed"));
      await failedPage.promise.catch(() => undefined);
    });

    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(await screen.findByRole("button", { name: "다시 시도" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(api.fetchMyJourney).toHaveBeenCalledTimes(2));
    expect(api.fetchMyJourney).toHaveBeenLastCalledWith(
      { clubSlug: "reading-sai" },
      { limit: 12, cursor: "cursor-2" },
    );
    await act(async () => {
      retryPage.resolve({ ...journey, nextCursor: null });
      await retryPage.promise;
    });
  });

  it("ignores a stale club continuation failure before loading the new club cursor", async () => {
    const user = userEvent.setup();
    const stalePage = deferred<MyJourneyPage>();
    const secondClubJourney: MyJourneyPage = {
      ...journey,
      items: [item({ sessionId: "club-b-session", bookTitle: "두 번째 모임의 책" })],
      nextCursor: "club-b-cursor",
    };
    api.fetchMyJourney
      .mockReturnValueOnce(stalePage.promise)
      .mockResolvedValueOnce({ ...secondClubJourney, nextCursor: null });
    const { router } = renderNavigableRoute();

    await user.click(await screen.findByRole("button", { name: "기록 더 보기" }));

    route.loaderData = secondClubJourney;
    await act(async () => {
      await router.navigate("/clubs/reading-gathering/app/me/records");
    });
    expect(await screen.findByRole("article", { name: "9차 두 번째 모임의 책" })).toBeVisible();

    await act(async () => {
      stalePage.reject(new Error("club A continuation failed"));
      await stalePage.promise.catch(() => undefined);
    });

    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "기록 더 보기" }));
    await waitFor(() => expect(api.fetchMyJourney).toHaveBeenCalledTimes(2));
    expect(api.fetchMyJourney).toHaveBeenLastCalledWith(
      { clubSlug: "reading-gathering" },
      { limit: 12, cursor: "club-b-cursor" },
    );
  });
});
