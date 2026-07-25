import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ComponentProps } from "react";
import type { HostChecklistItem, HostDashboardLedgerMetric } from "@/features/host/model/host-dashboard-model";
import {
  HostOperationFlow,
  HostOperationsTools,
  HostPriorityLedger,
  HostTodayBoard,
} from "./priority-ledger-sections";
import type { HostDashboardLinkComponent } from "./types";

const TestLink: HostDashboardLinkComponent = ({ to, children, ...props }) => (
  <a {...props} href={to}>
    {children}
  </a>
);

const metrics = [
  {
    id: "rsvp",
    label: "RSVP 미응답",
    value: 2,
    stateLabel: "확인 필요",
    tone: "warn",
  },
] satisfies HostDashboardLedgerMetric[];

const checklist = [
  {
    id: "session-basics",
    when: "7일 전",
    title: "책 정보와 일정 점검",
    helper: "현재 세션 정보 기준으로 계산합니다.",
    state: "complete",
    statusLabel: "완료",
  },
  {
    id: "question-reminder",
    when: "1일 전",
    title: "질문 제출 마감 확인",
    helper: "발송 기능 준비 중",
    state: "guidance",
    statusLabel: "안내",
  },
  {
    id: "rsvp-meeting",
    when: "당일",
    title: "참석 응답과 미팅 URL 점검",
    helper: "RSVP 미응답 2명",
    state: "pending",
    statusLabel: "확인 필요",
  },
  {
    id: "publication",
    when: "1일 후",
    title: "공개 요약 편집",
    helper: "공개 대기 1개",
    state: "pending",
    statusLabel: "확인 필요",
  },
] satisfies HostChecklistItem[];

function renderLedger(
  overrides: Partial<ComponentProps<typeof HostPriorityLedger>> = {},
) {
  return render(
    <HostPriorityLedger
      metrics={metrics}
      recordRows={<div>8회차 기록</div>}
      recordError={false}
      LinkComponent={TestLink}
      {...overrides}
    />,
  );
}

describe("priority-ledger sections", () => {
  it("keeps the two top concerns inside one today-board landmark", () => {
    render(
      <HostTodayBoard
        mobile={false}
        currentSession={<section aria-label="현재 세션 내용">현재 세션 본문</section>}
        priorityBoard={<section aria-label="우선 행동 내용">우선 행동 본문</section>}
      />,
    );

    const board = screen.getByRole("region", { name: "오늘의 운영" });
    expect(within(board).getByRole("heading", { name: "오늘의 운영" })).toHaveClass("rm-sr-only");
    expect(within(board).getByLabelText("현재 세션 내용")).toBeInTheDocument();
    expect(within(board).getByLabelText("우선 행동 내용")).toBeInTheDocument();
  });

  it("renders compact metrics, record rows, and a direct records action", () => {
    renderLedger();

    const ledger = screen.getByRole("region", { name: "처리 대기 원장" });
    expect(within(ledger).getByText("RSVP 미응답")).toBeInTheDocument();
    expect(within(ledger).getByText("2")).toBeInTheDocument();
    expect(within(ledger).getByText("8회차 기록")).toBeInTheDocument();
    expect(within(ledger).getByRole("link", { name: "세션 기록 전체 보기" })).toHaveAttribute(
      "href",
      "/app/host/sessions",
    );
  });

  it("replaces a failed record query with an actionable error row", () => {
    renderLedger({
      recordRows: null,
      recordError: true,
    });

    expect(screen.getByRole("alert")).toHaveTextContent("기록 상태를 불러오지 못했습니다");
    expect(screen.getByRole("link", { name: "세션 기록 열기" })).toHaveAttribute(
      "href",
      "/app/host/sessions",
    );
    expect(screen.queryByRole("button", { name: /회차 선택/ })).not.toBeInTheDocument();
  });

  it("shows three relevant steps and keeps the complete timeline in a disclosure", () => {
    render(
      <HostOperationFlow
        upcomingSessions={<div>9회차 예정</div>}
        checklist={{
          highlighted: checklist.slice(1),
          all: checklist,
        }}
      />,
    );

    expect(screen.getByText("9회차 예정")).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "현재 운영 단계" }))
        .getByText("참석 응답과 미팅 URL 점검"),
    ).toBeInTheDocument();
    expect(screen.getByText("전체 운영 일정 4단계")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "전체 운영 일정", hidden: true })).toBeInTheDocument();
  });

  it("groups compact operational tools without explanatory cards", () => {
    render(
      <HostOperationsTools
        notifications={<div>알림 장부</div>}
        members={<div>멤버 관리</div>}
        invitations={<div>초대 관리</div>}
        quickActions={<div>빠른 실행</div>}
      />,
    );

    const tools = screen.getByRole("region", { name: "운영 도구" });
    expect(within(tools).getByText("알림 장부")).toBeInTheDocument();
    expect(within(tools).getByText("멤버 관리")).toBeInTheDocument();
    expect(within(tools).getByText("초대 관리")).toBeInTheDocument();
    expect(within(tools).getByText("빠른 실행")).toBeInTheDocument();
  });
});
