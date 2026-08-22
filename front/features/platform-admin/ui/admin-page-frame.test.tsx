import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminPageFrame } from "./admin-page-frame";

describe("AdminPageFrame", () => {
  it("renders heading, description, and action slots without nesting extra headings", () => {
    render(
      <AdminPageFrame
        heading="오늘"
        description="플랫폼에서 지금 손봐야 할 작업을 우선 확인합니다."
        action={<button type="button">필터 초기화</button>}
      >
        <p>작업 본문</p>
      </AdminPageFrame>,
    );

    const heading = screen.getByRole("heading", { level: 1, name: "오늘" });
    expect(heading.tagName).toBe("H1");
    expect(screen.getByText("플랫폼에서 지금 손봐야 할 작업을 우선 확인합니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "필터 초기화" })).toBeInTheDocument();
    expect(screen.getByText("작업 본문")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("keeps the action slot optional and labels the page from the heading", () => {
    render(
      <AdminPageFrame heading="검토" description="권한과 이력을 읽기 전용으로 확인합니다.">
        <p>검토 본문</p>
      </AdminPageFrame>,
    );

    expect(screen.getByRole("region", { name: "검토" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
