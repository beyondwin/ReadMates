import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemberSessionDetailUnavailablePage } from "@/features/archive/ui/member-session-detail-page";

describe("MemberSessionDetailUnavailablePage return context", () => {
  it("keeps unavailable copy generic for reflection return targets", () => {
    render(
      <MemberSessionDetailUnavailablePage
        returnTarget={{
          href: "/app",
          label: "지난 모임 회고",
        }}
      />,
    );

    expect(screen.getAllByText("세션 없음").length).toBeGreaterThan(0);
    expect(screen.getAllByText("지난 세션을 찾을 수 없습니다.").length).toBeGreaterThan(0);
  });
});
