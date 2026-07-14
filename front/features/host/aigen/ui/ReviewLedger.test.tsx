import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReviewSection } from "../api/aigen-contracts";
import type { SectionReviewState } from "../model/aigen-review-state";
import { ReviewLedger } from "./ReviewLedger";

const states: Record<ReviewSection, SectionReviewState> = {
  SUMMARY: "AI_GROUNDED_REVIEWED",
  HIGHLIGHTS: "USER_EDITED_REVIEW_REQUIRED",
  ONE_LINE_REVIEWS: "USER_EDITED_CONFIRMED",
  FEEDBACK_DOCUMENT: "PENDING",
};

describe("ReviewLedger", () => {
  it("announces current section, review states, count, and keyboard navigation", () => {
    const onNavigate = vi.fn();
    render(
      <ReviewLedger states={states} currentSection="HIGHLIGHTS" onNavigate={onNavigate} />,
    );

    expect(screen.getByRole("heading", { name: "검토 원장" })).toBeInTheDocument();
    expect(screen.getByText("2/4 검토 완료")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /하이라이트.*수정 후 재검토 필요/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: /피드백 문서.*검토 대기/ }));
    expect(onNavigate).toHaveBeenCalledWith("FEEDBACK_DOCUMENT");
  });
});
