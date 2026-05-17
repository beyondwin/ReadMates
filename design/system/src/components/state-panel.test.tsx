import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";
import { EmptyState, LockedState } from "./state-panel";

describe("EmptyState", () => {
  it("renders title, description, compact class, and action", () => {
    render(
      <EmptyState
        title="아직 공개된 읽기가 없습니다"
        description="공개 예정 세션이 생기면 이 자리에 표시됩니다."
        compact
        action={<Button variant="secondary">초안 보기</Button>}
      />,
    );

    const state = screen.getByRole("status");
    expect(state).toHaveClass("rm-empty-state", "rm-state-panel", "rm-state-panel--compact");
    expect(screen.getByText("아직 공개된 읽기가 없습니다")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "초안 보기" })).toHaveClass("btn-secondary");
  });
});

describe("LockedState", () => {
  it("renders a pending access state without relying on color alone", () => {
    render(
      <LockedState
        title="승인 대기 중입니다"
        description="호스트가 멤버 접근을 승인하면 읽기 책상이 열립니다."
        reason="pending"
      />,
    );

    const state = screen.getByRole("status");
    expect(state).toHaveClass("rm-locked-state", "rm-state-panel", "rm-state", "rm-state--pending");
    expect(screen.getByText("승인 대기")).toHaveClass("badge");
    expect(screen.getByText("호스트가 멤버 접근을 승인하면 읽기 책상이 열립니다.")).toBeInTheDocument();
  });
});
