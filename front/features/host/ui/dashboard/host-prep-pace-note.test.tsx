import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HostPrepPaceNote } from "./host-prep-pace-note";

describe("HostPrepPaceNote", () => {
  it("renders the tier label and message with an accessible label", () => {
    render(
      <HostPrepPaceNote
        pace={{
          tier: "URGENT",
          daysRemaining: 1,
          label: "임박",
          message: "RSVP 미응답 2명 — 이미 준비 마감창(D-3)을 넘겼어요. 지금 처리하세요.",
          mostUrgentItem: { id: "rsvp", daysRemaining: 1, threshold: 3, slack: -2 },
        }}
      />,
    );

    expect(screen.getByText("임박")).toBeInTheDocument();
    expect(screen.getByLabelText("준비 페이스: 임박")).toBeInTheDocument();
    expect(screen.getByText(/RSVP 미응답 2명/)).toBeInTheDocument();
  });
});
