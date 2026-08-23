import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeedbackDocumentUnavailablePage } from "@/features/feedback/ui/feedback-document-page";

describe("FeedbackDocumentUnavailablePage return context", () => {
  it("uses the correct topic particle for a meeting without a feedback document", () => {
    render(<FeedbackDocumentUnavailablePage reason="missing" />);

    expect(screen.getByRole("note")).toHaveTextContent("문서가 등록되지 않은 모임은 본문을 표시하지 않습니다.");
  });

  it("renders a reflection return link when member home supplied the return target", () => {
    render(
      <FeedbackDocumentUnavailablePage
        reason="missing"
        returnTarget={{
          href: "/app",
          label: "지난 모임 회고",
        }}
      />,
    );

    const returnLink = screen.getByRole("link", { name: "지난 모임 회고 돌아가기" });
    expect(returnLink).toHaveAttribute("href", "/app");
    expect(returnLink).toHaveTextContent("← 회고");
  });
});
