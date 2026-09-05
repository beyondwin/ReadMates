import { render, screen } from "@testing-library/react";
import { useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { MobileHeader } from "./mobile-header";

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return { ...actual, useLocation: vi.fn() };
});

describe("MobileHeader cyclic return state", () => {
  it("renders safely and falls back to the meeting owner", () => {
    const cyclic: Record<string, unknown> = {
      readmatesReturnTo: "/app/host/sessions/session-6",
      readmatesReturnLabel: "뒤로",
    };
    cyclic.readmatesReturnState = cyclic;
    vi.mocked(useLocation).mockReturnValue({
      pathname: "/app/host/sessions/session-6",
      search: "",
      hash: "",
      state: cyclic,
      key: "cycle",
    });

    render(<MobileHeader variant="host" />);

    expect(screen.getByText("모임")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveAttribute(
      "href",
      "/app/host/sessions",
    );
  });

  it("bounds the generic feedback return parser during an actual render", () => {
    const cyclic: Record<string, unknown> = {
      readmatesReturnTo: "/app/archive?view=report",
      readmatesReturnLabel: "아카이브로",
    };
    cyclic.readmatesReturnState = cyclic;
    vi.mocked(useLocation).mockReturnValue({
      pathname: "/app/feedback/session-6",
      search: "",
      hash: "",
      state: cyclic,
      key: "feedback-cycle",
    });

    render(<MobileHeader variant="member" />);

    expect(screen.getByText("피드백 문서")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveAttribute(
      "href",
      "/app/archive?view=report",
    );
  });
});

describe("MobileHeader host chrome", () => {
  it("host mobile header shows space trigger, bell, and avatar without an ellipsis menu", () => {
    render(
      <MobileHeader
        variant="host"
        presentation={{ title: "운영실", brandHref: "/app/host" }}
        accountControl={<span className="rm-avatar-chip" />}
        spaceControl={<button className="rm-mobile-header__space">읽는사이 · 호스트 운영실</button>}
        utilityControl={<a href="/n" aria-label="알림"><svg data-icon="bell" /></a>}
      />,
    );
    expect(screen.getByRole("button", { name: "읽는사이 · 호스트 운영실" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "알림" })).toBeTruthy();
    expect(screen.queryByText("…")).toBeNull();
  });

  it("renders host back with an arrow-left icon and keeps the space trigger", () => {
    render(
      <MobileHeader
        variant="host"
        presentation={{ title: "사람", brandHref: "/app/host", backTarget: { href: "/app/host/people", label: "사람" } }}
        accountControl={<span className="rm-avatar-chip" />}
        spaceControl={<button className="rm-mobile-header__space">읽는사이 · 호스트 운영실</button>}
        utilityControl={<a href="/n" aria-label="알림"><svg data-icon="bell" /></a>}
      />,
    );

    const header = document.querySelector("header.rm-mobile-header");
    expect(header).toHaveAttribute("data-variant", "host");
    const back = screen.getByRole("link", { name: "뒤로" });
    expect(back).toHaveClass("rm-mobile-header__back");
    expect(back.querySelector('[data-icon="arrow-left"]')).toBeTruthy();
    expect(back).toHaveTextContent("사람");
    expect(header?.querySelector(".rm-mobile-header__utility [data-icon=\"bell\"]")).toBeTruthy();
  });
});
