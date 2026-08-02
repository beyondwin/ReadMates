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
  it("opens the existing feedback lock without navigating", async () => {
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

    await userEvent.setup().click(screen.getByRole("button", { name: "피드백 보기" }));

    expect(screen.getByRole("dialog", { name: "정식 멤버에게 열립니다" })).toBeVisible();
    expect(screen.getByLabelText("current location")).toHaveTextContent("/clubs/reading-sai/app/sessions/closed-1");
  });
});
