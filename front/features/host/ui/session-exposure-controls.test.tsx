import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionExposureControls } from "./session-exposure-controls";

describe("SessionExposureControls", () => {
  it("does not offer public-record placement for draft sessions", () => {
    render(
      <SessionExposureControls
        state="DRAFT"
        accessScope="GUEST_READABLE"
        siteVisibility="HIDDEN"
        onAccessScopeChange={vi.fn()}
        onSiteVisibilityChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("radio", { name: "게스트와 멤버에게 보이기" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "호스트만 보기" })).not.toBeChecked();
    expect(screen.getByText("초대된 클럽의 게스트와 로그인 멤버가 읽을 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByText("게스트와 멤버 화면에는 표시하지 않습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "게스트 공개" })).not.toBeInTheDocument();
    expect(screen.queryByText("멤버에게 보이기")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "공개 기록에 게시" })).not.toBeInTheDocument();
  });

  it("offers public-record placement only after a session closes", () => {
    render(
      <SessionExposureControls
        state="CLOSED"
        accessScope="GUEST_READABLE"
        siteVisibility="PUBLIC_RECORD"
        onAccessScopeChange={vi.fn()}
        onSiteVisibilityChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "공개 기록에 게시" })).toBeChecked();
  });
});
