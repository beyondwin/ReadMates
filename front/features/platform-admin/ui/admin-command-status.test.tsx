import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminCommandStatus } from "./admin-command-status";

describe("AdminCommandStatus", () => {
  it("compresses healthy source freshness and open work into one status line", () => {
    const { container } = render(
      <AdminCommandStatus
        state="ready"
        sourceStatusLabel="전체 신호 정상"
        openCount={8}
        generatedAtLabel="19:05"
      />,
    );

    expect(container.querySelector(".admin-command-status")).toHaveTextContent(
      "전체 신호 정상 · 8건 열림 · 19:05 기준",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("announces partial source availability without relying on color", () => {
    render(
      <AdminCommandStatus
        state="ready"
        sourceStatusLabel="일부 신호 확인 불가"
        openCount={3}
        generatedAtLabel="19:05"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "일부 신호 확인 불가 · 3건 열림 · 19:05 기준",
    );
  });

  it("keeps loading and unavailable states compact", () => {
    const { rerender } = render(<AdminCommandStatus state="loading" />);
    expect(screen.getByRole("status")).toHaveTextContent("운영 신호 확인 중");

    rerender(<AdminCommandStatus state="unavailable" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "운영 신호 확인 불가 · 잠시 후 다시 확인",
    );
  });
});
