import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { MyPageRouteData } from "./my-page-data";
import { MyPageRoute } from "./my-page-route";

const route = vi.hoisted(() => ({
  loaderData: null as unknown,
  revalidate: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useLoaderData: () => route.loaderData,
  useRevalidator: () => ({ revalidate: route.revalidate }),
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
      <MyPageRoute canEditProfile onProfileUpdated={vi.fn().mockResolvedValue(undefined)} />
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

  it("renders the profile before cumulative achievements without participation-only controls", () => {
    renderRoute();

    expect(screen.getByRole("heading", { level: 1, name: "샘플 멤버" })).toBeVisible();
    expect(screen.getByText("9번의 모임에서 7권을 끝까지 읽었어요.")).toBeVisible();
    expect(screen.getByRole("link", { name: "계정 관리" })).toBeVisible();
    expect(screen.queryByRole("list", { name: "최근 참여 대상 회차" })).toBeNull();
    expect(screen.queryByRole("link", { name: "이번 세션 보기" })).toBeNull();
    expect(screen.queryByRole("link", { name: "내 책별 기록 전체 보기" })).toBeNull();
    expect(screen.queryByRole("button", { name: "로그아웃" })).toBeNull();
  });
});
