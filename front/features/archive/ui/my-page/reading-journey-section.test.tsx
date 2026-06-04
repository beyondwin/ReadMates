import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReadingJourneySection } from "./reading-journey-section";

describe("ReadingJourneySection", () => {
  it("renders per-book groups and a recent timeline", () => {
    render(
      <ReadingJourneySection
        questions={[
          { sessionId: "s1", sessionNumber: 1, bookTitle: "책A", date: "2026-04-01", text: "질문", priority: 1, draftThought: null },
        ]}
        reviews={[{ sessionId: "s2", sessionNumber: 2, bookTitle: "책B", date: "2026-05-02", kind: "LONG_REVIEW", text: "서평" }]}
      />,
    );

    expect(screen.getAllByText(/책A/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/책B/).length).toBeGreaterThan(0);
  });

  it("shows an honest empty state when there is no activity", () => {
    render(<ReadingJourneySection questions={[]} reviews={[]} />);

    expect(screen.getByText(/아직.*기록/)).toBeInTheDocument();
  });
});
