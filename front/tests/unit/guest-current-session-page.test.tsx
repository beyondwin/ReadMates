import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { GuestScopedAppRoute } from "@/features/guest-browse/route/guest-scoped-app-route";
import { GuestCurrentSessionContent } from "@/src/pages/guest-current-session";

const LinkComponent = ({ to, children, ...props }: { to: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) => <a {...props} href={to}>{children}</a>;

const guestCurrentSession = {
  currentSession: {
    sessionId: "session-open",
    sessionNumber: 12,
    title: "여름의 독서",
    bookTitle: "파도",
    bookAuthor: "작가",
    bookLink: null,
    bookImageUrl: null,
    date: "2026-08-09",
    startTime: "19:00",
    endTime: "21:00",
    questionDeadlineAt: "2026-08-08T23:59:00",
    attendees: [{ displayName: "읽는이", avatarKey: "book", rsvpStatus: "GOING", attendanceStatus: "UNKNOWN" }],
    board: {
      questions: [{ priority: 1, text: "다가오는 질문", draftThought: "초안 생각", authorName: "읽는이", authorShortName: "읽는", avatarKey: "book" }],
      longReviews: [{ title: "서평", content: "공개 서평", authorName: "읽는이", authorShortName: "읽는", avatarKey: "book" }],
    },
  },
} as const;

describe("guest current session page", () => {
  it("renders the regular current-session page with guest controls disabled", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const router = createMemoryRouter([{
      path: "/clubs/:clubSlug/app/session/current",
      loader: () => ({ guestRoute: true, guestData: guestCurrentSession }),
      element: <GuestScopedAppRoute LinkComponent={LinkComponent} GuestCurrentSessionContent={GuestCurrentSessionContent} />,
    }], { initialEntries: ["/clubs/alpha/app/session/current"] });

    const { container } = render(<RouterProvider router={router} />);
    const desktopElement = await waitFor(() => {
      const element = container.querySelector(".rm-current-session-desktop");
      if (!(element instanceof HTMLElement)) throw new Error("Desktop current session board not found");
      return element;
    });
    const desktop = within(desktopElement);

    expect(desktop.getByRole("heading", { name: "파도" })).toBeVisible();
    expect(desktop.getByText("다가오는 질문")).toBeVisible();
    for (const label of ["참석", "아직 미정", "불참", "진행률 저장", "질문 저장", "서평 저장"]) {
      expect(desktop.getByRole("button", { name: label })).toBeDisabled();
    }
    expect(desktop.getByRole("textbox", { name: "한줄평 내용" })).toHaveValue("");
    expect(desktop.getByRole("textbox", { name: "한줄평 내용" })).toBeDisabled();
    expect(desktop.getByRole("button", { name: "한줄평 저장" })).toBeDisabled();
    expect(desktop.getByRole("slider", { name: "읽기 진행률" })).toBeDisabled();
    expect(screen.queryByText(/Passcode|모임 링크 열기/)).not.toBeInTheDocument();
    expect(container.querySelector(".rm-current-session-desktop")).toBeInTheDocument();
    expect(screen.getByTestId("current-session-mobile")).toBeInTheDocument();

    const mobile = within(screen.getByTestId("current-session-mobile"));
    await user.click(mobile.getByRole("button", { name: "내 기록" }));
    expect(mobile.getByRole("textbox", { name: "한줄평 내용" })).toHaveValue("");
    expect(mobile.getByRole("textbox", { name: "한줄평 내용" })).toBeDisabled();
    expect(mobile.getByRole("button", { name: "한줄평 저장" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
