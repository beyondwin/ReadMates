import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { GuestNavigationLink, GuestNavigationProvider } from "./guest-navigation-dialog";

const AnchorLink = ({ to, children, ...props }: { to: string; children: React.ReactNode; className?: string }) => (
  <a {...props} href={to}>{children}</a>
);

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="current location">{location.pathname}</output>;
}

describe("guest feedback lock action", () => {
  it("opens a clear feedback lock dialog without navigating and restores focus on close", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/clubs/reading-sai/app/sessions/closed-1"]}>
        <GuestNavigationProvider LinkComponent={AnchorLink}>
          <LocationProbe />
          <GuestNavigationLink to="/clubs/reading-sai/app/feedback/closed-1">
            피드백 보기
          </GuestNavigationLink>
        </GuestNavigationProvider>
      </MemoryRouter>,
    );

    const trigger = screen.getByRole("button", { name: "피드백 보기" });
    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: "정식 멤버에게 열립니다" })).toBeVisible();
    expect(screen.getByText("멤버십 안내")).toBeVisible();
    expect(screen.getByRole("button", { name: "닫기" })).toHaveFocus();
    expect(screen.getByRole("link", { name: "멤버로 시작" })).toHaveAttribute(
      "href",
      "/login?returnTo=%2Fclubs%2Freading-sai%2Fapp%2Ffeedback%2Fclosed-1",
    );
    expect(screen.getByLabelText("current location")).toHaveTextContent("/clubs/reading-sai/app/sessions/closed-1");

    await user.click(screen.getByRole("button", { name: "닫기" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
