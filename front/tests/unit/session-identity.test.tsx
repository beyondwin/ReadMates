import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionIdentity } from "@/shared/ui/session-identity";

afterEach(() => {
  vi.useRealTimers();
});

describe("SessionIdentity", () => {
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

  it("labels a draft new session", () => {
    render(
      <SessionIdentity
        sessionNumber={8}
        state="DRAFT"
        date="2026-06-10"
        published={false}
        feedbackDocumentAvailable={false}
      />,
    );

    expect(screen.getByLabelText("No.08 · 새 세션 초안 · 비공개")).toBeVisible();
    expect(screen.getByText("No.08")).toBeVisible();
    expect(screen.getByText("새 세션 초안")).toBeVisible();
    expect(screen.getByText("비공개")).toBeVisible();
  });
});
