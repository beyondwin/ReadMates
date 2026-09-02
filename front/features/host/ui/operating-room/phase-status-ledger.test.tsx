import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PhaseStatusLedger } from "./phase-status-ledger";

describe("PhaseStatusLedger", () => {
  it("renders the approved live composition with source-derived facts and actions", () => {
    render(
      <PhaseStatusLedger
        title="현장 현황"
        rows={[
          {
            label: "실제 출석",
            value: "8 / 12",
            detail: "참석 8 · 알린 불참 1 · 확인 필요 3",
            href: "/clubs/reading-sai/app/host/sessions/public-safe-session-27?section=attendance",
            action: "출석 보기",
          },
          {
            label: "참석 응답",
            value: "9 / 12",
            detail: "참석 7 · 불참 2 · 미응답 3",
            href: "/clubs/reading-sai/app/host/sessions/public-safe-session-27?section=responses",
            action: "응답 보기",
          },
        ]}
      />,
    );

    const region = screen.getByRole("region", { name: "현장 현황" });
    expect(within(region).getByRole("heading", { name: "현장 현황" })).toBeVisible();
    expect(within(region).getByText("실제 출석")).toBeVisible();
    expect(within(region).getByText("참석 8 · 알린 불참 1 · 확인 필요 3")).toBeVisible();
    expect(within(region).getByRole("link", { name: "실제 출석 자세히 보기" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/sessions/public-safe-session-27?section=attendance",
    );
    expect(within(region).getByRole("link", { name: "실제 출석 자세히 보기" })).toHaveTextContent("출석 보기");
  });
});
