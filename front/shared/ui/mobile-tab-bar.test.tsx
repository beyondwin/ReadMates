import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { MobileTabBar, TabIcon } from "./mobile-tab-bar";

describe("TabIcon", () => {
  it("wraps ReadmatesIcon and maps legacy member tab names", () => {
    const { container, rerender } = render(<TabIcon name="home" />);
    expect(container.querySelector('[data-icon="home"]')).toBeTruthy();

    rerender(<TabIcon name="session" />);
    expect(container.querySelector('[data-icon="calendar"]')).toBeTruthy();
    rerender(<TabIcon name="approve" />);
    expect(container.querySelector('[data-icon="people"]')).toBeTruthy();
  });
});

describe("MobileTabBar host icons", () => {
  it("uses home, calendar, people, and document icons for host tabs", () => {
    render(
      <MemoryRouter initialEntries={["/app/host"]}>
        <MobileTabBar variant="host" />
      </MemoryRouter>,
    );

    const nav = screen.getByRole("navigation");
    expect(nav).toHaveClass("rm-mobile-tab-bar");
    expect(nav.querySelector('[data-icon="home"]')).toBeTruthy();
    expect(nav.querySelector('[data-icon="calendar"]')).toBeTruthy();
    expect(nav.querySelector('[data-icon="people"]')).toBeTruthy();
    expect(nav.querySelector('[data-icon="document"]')).toBeTruthy();
  });
});
