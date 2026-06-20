import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SessionClosingBoardView } from "@/features/host/model/session-closing-model";
import { SessionClosingBoard } from "./session-closing-board";

const view: SessionClosingBoardView = {
  title: "No.07 · E2E Book",
  subtitle: "2026-06-18 · Public",
  statusLabel: "Ready",
  statusTone: "accent",
  primaryAction: { label: "멤버 알림 상태 확인", href: "/app/host/notifications" },
  checklist: [
    { id: "SESSION_CLOSED", label: "Session closed", detail: "Closed", state: "DONE", tone: "ok", href: "/app/host/sessions/s1/edit" },
    { id: "MEMBER_NOTIFICATION_SENT", label: "Member notification", detail: "Pending", state: "ACTION_REQUIRED", tone: "warn", href: "/app/host/notifications" },
  ],
  surfaces: [
    { id: "HOST", title: "Host", detail: "Operations checklist", tone: "accent", href: "/app/host/sessions/s1/edit" },
    { id: "MEMBER", title: "Member", detail: "Member reflection entry", tone: "ok", href: "/clubs/club-a/app/sessions/s1" },
    { id: "PUBLIC", title: "Public", detail: "Public record", tone: "ok", href: "/clubs/club-a/sessions/s1" },
  ],
  evidence: [
    { label: "Public summary", value: "Saved" },
    { label: "Highlights", value: "2" },
  ],
};

describe("SessionClosingBoard", () => {
  it("renders primary action checklist surfaces and evidence", () => {
    render(<SessionClosingBoard view={view} />);

    expect(screen.getByRole("heading", { name: "No.07 · E2E Book" })).toBeVisible();
    expect(screen.getByRole("link", { name: "멤버 알림 상태 확인" })).toHaveAttribute("href", "/app/host/notifications");
    expect(screen.getByText("Session closed")).toBeVisible();
    expect(screen.getByText("Host")).toBeVisible();
    expect(screen.getByText("Member")).toBeVisible();
    expect(screen.getByText("Public")).toBeVisible();
    expect(screen.getByText("Highlights")).toBeVisible();
  });

  it("does not render private sentinels", () => {
    render(<SessionClosingBoard view={view} />);

    expect(screen.queryByText("member1@example.com")).toBeNull();
    expect(screen.queryByText("ADMIN_ROUTE")).toBeNull();
    expect(screen.queryByText("{\"")).toBeNull();
  });
});
