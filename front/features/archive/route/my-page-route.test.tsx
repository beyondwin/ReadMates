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
    avatarKey: "book-tote",
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
    items: [{
      sessionId: "session / 9",
      sessionNumber: 9,
      bookTitle: "최근 함께 읽은 책",
      bookAuthor: "테스트 저자",
      bookImageUrl: null,
      date: "2026-07-20",
      readingProgress: 100,
      questionCount: 2,
      reviewCount: 1,
      feedbackDocument: {
        available: true,
        readable: true,
        lockedReason: null,
      },
    }],
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

function renderRoute(initialEntry = "/clubs/reading-sai/app/me") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
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
    expect(document.querySelector(".rm-member-profile__avatar .rm-avatar-chip img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/book-tote.webp",
    );
    expect(screen.getByText("9번의 모임에서 7권을 끝까지 읽었어요.")).toBeVisible();
    expect(screen.queryByRole("link", { name: "계정 관리" })).toBeNull();
    expect(screen.getByRole("link", {
      name: "전체 보기",
    })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/archive?view=sessions",
    );
    expect(screen.getByRole("link", {
      name: "최근 함께 읽은 책 회차 기록",
    })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/sessions/session%20%2F%209",
    );
    expect(screen.queryByRole("list", { name: "최근 참여 대상 회차" })).toBeNull();
    expect(screen.queryByRole("link", { name: "이번 세션 보기" })).toBeNull();
    expect(screen.queryByRole("button", { name: "로그아웃" })).toBeNull();
  });

  it.each([
    ["scoped", "/clubs/reading-sai/app/me", "/clubs/reading-sai/app"],
    ["unscoped", "/app/me", "/app"],
  ])("assembles utility links from the %s My Space route", (_, initialEntry, appBasePath) => {
    renderRoute(initialEntry);

    expect(screen.getByRole("link", { name: /알림.*받은 알림과 수신 설정/ })).toHaveAttribute(
      "href",
      `${appBasePath}/notifications`,
    );
    expect(screen.getByRole("link", { name: /계정 설정.*프로필과 멤버십 정보/ })).toHaveAttribute(
      "href",
      `${appBasePath}/me/settings`,
    );
  });
});
