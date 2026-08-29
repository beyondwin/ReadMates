import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HostPrimaryNavigation } from "./host-primary-navigation";

const destinations = [
  { id: "operating-room" as const, href: "/app/host", current: true },
  { id: "meetings" as const, href: "/app/host/sessions", current: false },
  { id: "people" as const, href: "/app/host/people", current: false },
  { id: "records" as const, href: "/app/host/records", current: false },
];

describe("HostPrimaryNavigation", () => {
  it("renders the approved desktop destinations in order and marks only the current page", () => {
    render(<HostPrimaryNavigation destinations={destinations} mode="desktop" />);

    const navigation = screen.getByRole("navigation", { name: "호스트 주 메뉴" });
    expect(within(navigation).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "운영실",
      "일정과 모임",
      "사람",
      "기록",
    ]);
    expect(within(navigation).getByRole("link", { name: "운영실" })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("link", { name: "일정과 모임" })).not.toHaveAttribute("aria-current");
  });

  it("uses the approved compact mobile label without changing the destination", () => {
    render(<HostPrimaryNavigation destinations={destinations} mode="mobile" />);

    const navigation = screen.getByRole("navigation", { name: "호스트 주 메뉴 모바일" });
    expect(within(navigation).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "운영실",
      "모임",
      "사람",
      "기록",
    ]);
    expect(within(navigation).getByRole("link", { name: "모임" })).toHaveAttribute("href", "/app/host/sessions");
  });

  it("keeps a denied destination discoverable with a reason instead of making it a link", () => {
    render(
      <HostPrimaryNavigation
        destinations={destinations.map((destination) => destination.id === "records"
          ? { ...destination, disabledReason: "기록 열람 권한을 확인하고 있습니다." }
          : destination)}
        mode="desktop"
      />,
    );

    const denied = screen.getByText("기록").closest("span");
    expect(denied).toHaveAttribute("aria-disabled", "true");
    expect(denied).toHaveAccessibleDescription("기록 열람 권한을 확인하고 있습니다.");
    expect(screen.queryByRole("link", { name: "기록" })).not.toBeInTheDocument();
  });
});
