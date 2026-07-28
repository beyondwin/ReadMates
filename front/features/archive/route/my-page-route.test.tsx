import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { MyPageRouteData } from "./my-page-data";
import { MyPageRoute } from "./my-page-route";

const route = vi.hoisted(() => ({ loaderData: null as unknown }));
const authApi = vi.hoisted(() => ({ logout: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useLoaderData: () => route.loaderData,
}));
vi.mock("@/features/auth/api/auth-api", () => authApi);

const data: MyPageRouteData = {
  profile: {
    displayName: "샘플 멤버",
    accountName: "sample-member",
    email: "member@example.com",
    role: "MEMBER",
    membershipStatus: "ACTIVE",
    clubName: "샘플 독서모임",
    joinedAt: "2024-11",
    sessionCount: 9,
    totalSessionCount: 9,
    completedReadingCount: 7,
    currentSessionId: "session-current",
    recentAttendances: [
      { sessionNumber: 4, attended: true, attendanceStatus: "ATTENDED", readingProgress: 100 },
      { sessionNumber: 5, attended: true, attendanceStatus: "ATTENDED", readingProgress: 80 },
      { sessionNumber: 6, attended: false, attendanceStatus: "ABSENT", readingProgress: 0 },
      { sessionNumber: 7, attended: true, attendanceStatus: "ATTENDED", readingProgress: 100 },
      { sessionNumber: 8, attended: true, attendanceStatus: "ATTENDED", readingProgress: 70 },
      { sessionNumber: 9, attended: true, attendanceStatus: "ATTENDED", readingProgress: 100 },
    ],
  },
  journey: {
    items: [],
    nextCursor: null,
    summary: {
      attendedSessionCount: 9,
      completedReadingCount: 7,
      questionCount: 28,
      reviewCount: 3,
      readableFeedbackDocumentCount: 2,
    },
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={["/clubs/reading-sai/app/me"]}>
      <MyPageRoute />
    </MemoryRouter>,
  );
}

describe("MyPageRoute", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 6, 29));
    route.loaderData = data;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("builds the participation journey and injects member-space logout", () => {
    renderRoute();

    expect(screen.getByText("함께한 모임 9회")).toBeVisible();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "최근 책별 기록" })).toBeNull();
  });

  it.each([204, 401])("redirects member-space logout to public home for %s", async (status) => {
    authApi.logout.mockResolvedValue(new Response(null, { status }));
    const location = { href: "" };
    vi.stubGlobal("location", location);
    const user = userEvent.setup();
    renderRoute();

    await user.click(screen.getByRole("button", { name: "로그아웃" }));

    await waitFor(() => expect(location.href).toBe("/"));
  });

  it("keeps the current page and shows inline feedback when logout fails", async () => {
    authApi.logout.mockResolvedValue(new Response(null, { status: 500 }));
    const location = { href: "/clubs/reading-sai/app/me" };
    vi.stubGlobal("location", location);
    const user = userEvent.setup();
    renderRoute();

    await user.click(screen.getByRole("button", { name: "로그아웃" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "로그아웃에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    );
    expect(location.href).toBe("/clubs/reading-sai/app/me");
  });

  it("deduplicates member-space logout while the first request is pending", async () => {
    const pendingLogout = deferred<Response>();
    authApi.logout.mockReturnValue(pendingLogout.promise);
    const user = userEvent.setup();
    renderRoute();
    const button = screen.getByRole("button", { name: "로그아웃" });

    await user.dblClick(button);

    expect(authApi.logout).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "로그아웃 중" })).toBeDisabled();

    pendingLogout.resolve(new Response(null, { status: 500 }));
    expect(await screen.findByRole("alert")).toBeVisible();
  });
});
