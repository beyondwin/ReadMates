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
