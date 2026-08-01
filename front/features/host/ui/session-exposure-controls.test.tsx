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

    expect(screen.getByRole("radio", { name: "게스트 공개" })).toBeChecked();
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
