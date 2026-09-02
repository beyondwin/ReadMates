import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PhaseStatusLedger } from "./phase-status-ledger";

describe("PhaseStatusLedger", () => {
  it("renders the approved live composition with source-derived facts and actions", () => {
    render(
      <PhaseStatusLedger
        title="현장 현황"
        rows={[
          {
            label: "실제 출석",
            value: "8 / 12",
            detail: "참석 8 · 알린 불참 1 · 확인 필요 3",
            href: "/clubs/reading-sai/app/host/sessions/public-safe-session-27?section=attendance",
            action: "출석 보기",
          },
          {
            label: "참석 응답",
            value: "9 / 12",
            detail: "참석 7 · 불참 2 · 미응답 3",
            href: "/clubs/reading-sai/app/host/sessions/public-safe-session-27?section=responses",
            action: "응답 보기",
          },
        ]}
      />,
    );

    const region = screen.getByRole("region", { name: "현장 현황" });
    expect(within(region).getByRole("heading", { name: "현장 현황" })).toBeVisible();
    expect(within(region).getByText("실제 출석")).toBeVisible();
    expect(within(region).getByText("참석 8 · 알린 불참 1 · 확인 필요 3")).toBeVisible();
    expect(within(region).getByRole("link", { name: "실제 출석 자세히 보기" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/sessions/public-safe-session-27?section=attendance",
    );
    expect(within(region).getByRole("link", { name: "실제 출석 자세히 보기" })).toHaveTextContent("출석 보기");
    expect(region.querySelector("svg[data-icon='person']")).not.toBeNull();
    expect(region.querySelector("svg[data-icon='people']")).not.toBeNull();
  });

  it("paints numbered 1-5 markers on the closing ledger", () => {
    render(
      <PhaseStatusLedger
        title="마감 현황"
        rows={[
          { label: "출석 확정", value: "완료", detail: "9명 · 어제 21:42", href: "?section=attendance", action: "출석 보기" },
          { label: "소감 수집", value: "8 / 12", detail: "미작성 4명", href: "?section=notes", action: "대상 보기" },
          { label: "기록 초안", value: "작성 중", detail: "마지막 저장 오늘 10:18", href: "?section=records", action: "초안 열기" },
          { label: "피드백 문서", value: "확인 필요", detail: "파일 1개", href: "?section=feedback", action: "문서 확인" },
          { label: "멤버 게시", value: "대기", detail: "앞선 2단계 남음", href: "?section=publish", action: "게시 조건" },
        ]}
      />,
    );

    const region = screen.getByRole("region", { name: "마감 현황" });
    const items = within(region).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    items.forEach((item, index) => {
      expect(item.querySelector("[data-index]")?.textContent).toBe(String(index + 1));
    });
  });
});
