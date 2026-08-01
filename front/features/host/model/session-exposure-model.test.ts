// @vitest-environment jsdom
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  buildSessionAccessScopeRequest,
  buildSessionPublicationRequest,
  sessionExposureCopy,
} from "./session-exposure-model";
import { SessionExposureControls } from "../ui/session-exposure-controls";

describe("session exposure model", () => {
  it("separates guest access from public-record placement", () => {
    expect(sessionExposureCopy("GUEST_READABLE", "HIDDEN")).toEqual({
      accessLabel: "게스트 공개",
      siteLabel: "공개 기록에 게시 안 함",
    });
    expect(sessionExposureCopy("GUEST_READABLE", "PUBLIC_RECORD").siteLabel).toBe("공개 기록에 게시");
  });

  it("builds canonical host requests without compatibility visibility", () => {
    expect(buildSessionAccessScopeRequest("GUEST_READABLE")).toEqual({ accessScope: "GUEST_READABLE" });
    expect(buildSessionPublicationRequest("공개 요약", "PUBLIC_RECORD")).toEqual({
      publicSummary: "공개 요약",
      siteVisibility: "PUBLIC_RECORD",
    });
  });

  it("does not offer public-record placement for draft sessions", () => {
    render(createElement(SessionExposureControls, {
      state: "DRAFT",
      accessScope: "GUEST_READABLE",
      siteVisibility: "HIDDEN",
      onAccessScopeChange: vi.fn(),
      onSiteVisibilityChange: vi.fn(),
    }));

    expect((screen.getByRole("radio", { name: "게스트 공개" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole("checkbox", { name: "공개 기록에 게시" })).toBeNull();
  });

  it("offers public-record placement only after a session closes", () => {
    render(createElement(SessionExposureControls, {
      state: "CLOSED",
      accessScope: "GUEST_READABLE",
      siteVisibility: "PUBLIC_RECORD",
      onAccessScopeChange: vi.fn(),
      onSiteVisibilityChange: vi.fn(),
    }));

    expect((screen.getByRole("checkbox", { name: "공개 기록에 게시" }) as HTMLInputElement).checked).toBe(true);
  });
});
