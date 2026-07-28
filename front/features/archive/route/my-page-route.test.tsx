import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { MyPageRouteData } from "./my-page-data";
import { MyPageRoute } from "./my-page-route";

const route = vi.hoisted(() => ({ loaderData: null as unknown }));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useLoaderData: () => route.loaderData,
}));

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

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={["/clubs/reading-sai/app/me"]}>
      <MyPageRoute logoutControl={<button type="button">주입된 계정 작업</button>} />
    </MemoryRouter>,
  );
}

describe("MyPageRoute", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 6, 29));
    route.loaderData = data;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("builds the participation journey and renders its injected account action", () => {
    renderRoute();

    expect(screen.getByText("함께한 모임 9회")).toBeVisible();
    expect(screen.getByRole("button", { name: "주입된 계정 작업" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "최근 책별 기록" })).toBeNull();
  });
});
