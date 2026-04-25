import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionIdentity, SessionTimingIdentity } from "@/shared/ui/session-identity";

afterEach(() => {
  vi.useRealTimers();
});

describe("SessionIdentity", () => {
  it("renders compact session timing with number and pending d-day chips only", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 22, 0, 0, 0));

    render(<SessionTimingIdentity sessionNumber={7} date="2026-05-13" />);

    expect(screen.getByLabelText("No.07 · D-21")).toBeVisible();
    expect(screen.getByText("No.07")).toHaveClass(
      "rm-session-identity__number",
      "rm-session-identity__chip",
      "rm-state",
      "rm-state--pending",
    );
    expect(screen.getByText("D-21")).toHaveClass("rm-session-identity__chip", "rm-state", "rm-state--pending");
    expect(screen.queryByText("이번 세션")).not.toBeInTheDocument();
  });

  it("can append a compact current-session phase chip after d-day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 22, 0, 0, 0));

    render(<SessionTimingIdentity sessionNumber={7} date="2026-05-13" phaseLabel="이번 세션" />);

    expect(screen.getByLabelText("No.07 · D-21 · 이번 세션")).toBeVisible();
    expect(screen.getByText("No.07")).toHaveClass(
      "rm-session-identity__chip",
      "rm-state",
      "rm-state--pending",
    );
    expect(screen.getByText("D-21")).toHaveClass("rm-session-identity__chip", "rm-state", "rm-state--pending");
    expect(screen.getByText("이번 세션")).toHaveClass("rm-session-identity__chip");
  });

  it("can render compact session timing in muted tone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 22, 0, 0, 0));

    render(<SessionTimingIdentity sessionNumber={8} date="2026-05-13" tone="muted" />);

    expect(screen.getByLabelText("No.08 · D-21")).toBeVisible();
    expect(screen.getByLabelText("No.08 · D-21")).toHaveClass("rm-session-identity--muted");
    expect(screen.getByText("No.08")).toHaveClass("rm-session-identity__chip");
    expect(screen.getByText("No.08")).not.toHaveClass("rm-session-identity__number", "rm-state", "rm-state--pending");
    expect(screen.getByText("D-21")).toHaveClass("rm-session-identity__chip");
    expect(screen.getByText("D-21")).not.toHaveClass("rm-state", "rm-state--pending");
  });

  it("labels the open current session with d-day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 22, 0, 0, 0));

    render(
      <SessionIdentity
        sessionNumber={7}
        state="OPEN"
        date="2026-05-13"
        published={false}
        feedbackDocumentAvailable={false}
      />,
    );

    expect(screen.getByLabelText("No.07 · 이번 세션 · 준비 중 · D-21")).toBeVisible();
    expect(screen.getByText("No.07")).toBeVisible();
    expect(screen.getByText("이번 세션")).toBeVisible();
    expect(screen.getByText("준비 중")).toBeVisible();
    expect(screen.getByText("D-21")).toBeVisible();
  });

  it("labels a published past session with public and feedback states", () => {
    render(
      <SessionIdentity
        sessionNumber={6}
        state="PUBLISHED"
        date="2026-04-15"
        published={true}
        feedbackDocumentAvailable={true}
      />,
    );

    expect(screen.getByLabelText("No.06 · 지난 회차 · 공개됨 · 문서 있음")).toBeVisible();
    expect(screen.getByText("No.06")).toBeVisible();
    expect(screen.getByText("지난 회차")).toBeVisible();
    expect(screen.getByText("공개됨")).toBeVisible();
    expect(screen.getByText("문서 있음")).toBeVisible();
  });

  it("labels a draft new session as upcoming", () => {
    render(
      <SessionIdentity
        sessionNumber={8}
        state="DRAFT"
        date="2026-06-10"
        published={false}
        feedbackDocumentAvailable={false}
      />,
    );

    expect(screen.getByLabelText("No.08 · 예정 세션 · 예정")).toBeVisible();
    expect(screen.getByText("No.08")).toBeVisible();
    expect(screen.getByText("예정 세션")).toBeVisible();
    expect(screen.getByText("예정")).toBeVisible();
  });
});
