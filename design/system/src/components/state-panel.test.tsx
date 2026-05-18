import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";
import { EmptyState, LockedState } from "./state-panel";

describe("EmptyState", () => {
  it("exposes title, description, and action under a status role", () => {
    render(
      <EmptyState
        title="아직 공개된 읽기가 없습니다"
        description="공개 예정 세션이 생기면 이 자리에 표시됩니다."
        action={<Button variant="secondary">초안 보기</Button>}
      />,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("아직 공개된 읽기가 없습니다")).toBeInTheDocument();
    expect(screen.getByText("공개 예정 세션이 생기면 이 자리에 표시됩니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "초안 보기" })).toBeInTheDocument();
  });
});

describe("LockedState", () => {
  it("surfaces a textual reason badge so pending access does not rely on color alone", () => {
    render(
      <LockedState
        title="승인 대기 중입니다"
        description="호스트가 멤버 접근을 승인하면 읽기 책상이 열립니다."
        reason="pending"
      />,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("승인 대기")).toBeInTheDocument();
    expect(screen.getByText("호스트가 멤버 접근을 승인하면 읽기 책상이 열립니다.")).toBeInTheDocument();
  });
});
