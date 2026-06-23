import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { MemberArchiveSessionDetailResponse } from "@/features/archive/model/archive-model";
import MemberSessionDetailPage, { MemberSessionDetailUnavailablePage } from "@/features/archive/ui/member-session-detail-page";

const session: MemberArchiveSessionDetailResponse = {
  sessionId: "session-1",
  sessionNumber: 1,
  title: "1회차 모임 · 테스트 책",
  bookTitle: "테스트 책",
  bookAuthor: "테스트 저자",
  bookImageUrl: null,
  date: "2026-06-18",
  state: "CLOSED",
  locationLabel: "온라인",
  attendance: 2,
  total: 2,
  myAttendanceStatus: "ATTENDED",
  isHost: false,
  publicSummary: "공개 가능한 요약입니다.",
  publicHighlights: [],
  clubQuestions: [],
  clubOneLiners: [],
  publicOneLiners: [],
  myQuestions: [],
  myCheckin: { readingProgress: 100 },
  myOneLineReview: null,
  myLongReview: null,
  feedbackDocument: {
    available: true,
    readable: true,
    lockedReason: null,
    title: "독서모임 1차 피드백",
    uploadedAt: "2026-06-18T10:00:00Z",
  },
};

function ReturnStateProbe() {
  const location = useLocation();
  const state = location.state as { readmatesReturnTo?: string; readmatesReturnLabel?: string } | null;

  return (
    <div>
      <div data-testid="return-to">{state?.readmatesReturnTo}</div>
      <div data-testid="return-label">{state?.readmatesReturnLabel}</div>
    </div>
  );
}

describe("MemberSessionDetailUnavailablePage return context", () => {
  it("keeps unavailable copy generic for reflection return targets", () => {
    render(
      <MemberSessionDetailUnavailablePage
        returnTarget={{
          href: "/app",
          label: "지난 모임 회고",
        }}
      />,
    );

    expect(screen.getAllByText("세션 없음").length).toBeGreaterThan(0);
    expect(screen.getAllByText("지난 세션을 찾을 수 없습니다.").length).toBeGreaterThan(0);
  });

  it("opens feedback with the reflection return target directly", async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: "/app/sessions/session-1",
          element: (
            <MemberSessionDetailPage
              session={session}
              returnTarget={{
                href: "/app/notifications",
                label: "지난 모임 회고",
              }}
            />
          ),
        },
        {
          path: "/app/feedback/session-1",
          element: <ReturnStateProbe />,
        },
      ],
      { initialEntries: ["/app/sessions/session-1"] },
    );

    render(<RouterProvider router={router} />);

    await user.click(screen.getAllByRole("link", { name: "피드백 보기" })[0]);

    expect(screen.getByTestId("return-to")).toHaveTextContent("/app/notifications");
    expect(screen.getByTestId("return-label")).toHaveTextContent("지난 모임 회고");
  });
});
