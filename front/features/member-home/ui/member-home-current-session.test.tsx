import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemberHomeNextActionPace } from "@/features/member-home/ui/member-home-current-session";
import type { ReadingPace } from "@/shared/model/reading-pace";

const urgentPace: ReadingPace = {
  tier: "URGENT",
  daysRemaining: 1,
  label: "서둘러요",
  message: "모임이 곧이라 속도를 올려야 해요.",
};

describe("MemberHomeNextActionPace", () => {
  it("renders the pace label and message when pace tier is URGENT", () => {
    render(<MemberHomeNextActionPace pace={urgentPace} />);

    expect(screen.getByText("서둘러요")).toBeInTheDocument();
    expect(screen.getByText(/속도를 올려야/)).toBeInTheDocument();
  });

  it("renders nothing when pace is null", () => {
    const { container } = render(<MemberHomeNextActionPace pace={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
