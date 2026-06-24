import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SessionClosingBoardView } from "@/features/host/model/session-closing-model";
import { SessionClosingBoard } from "./session-closing-board";

const view: SessionClosingBoardView = {
  title: "No.07 · E2E Book",
  subtitle: "2026-06-18 · Public",
  statusLabel: "Ready",
  statusTone: "accent",
  primaryAction: {
    label: "멤버 알림 확인",
    reason: "멤버가 지난 모임 회고로 돌아갈 알림 흐름이 아직 완성되지 않았습니다.",
    tone: "warn",
    href: "/app/host/notifications",
  },
  checklist: [
    {
      id: "SESSION_CLOSED",
      label: "세션 종료",
      detail: "닫힘",
      state: "DONE",
      stateLabel: "완료",
      tone: "ok",
      href: "/app/host/sessions/s1/edit",
      actionLabel: "확인하기",
    },
    {
      id: "MEMBER_NOTIFICATION_SENT",
      label: "멤버 알림",
      detail: "대기",
      state: "ACTION_REQUIRED",
      stateLabel: "조치 필요",
      tone: "warn",
      href: "/app/host/notifications",
      actionLabel: "확인하기",
    },
  ],
  surfaces: [
    {
      id: "HOST",
      title: "호스트 문서",
      detail: "호스트가 기록 패키지와 마감 상태를 관리할 수 있습니다.",
      tone: "accent",
      href: "/app/host/sessions/s1/edit",
      actionLabel: "호스트 문서 확인",
    },
    {
      id: "MEMBER",
      title: "멤버 회고",
      detail: "멤버가 지난 모임 기록과 피드백으로 돌아갈 수 있습니다.",
      tone: "ok",
      href: "/clubs/club-a/app/sessions/s1",
      actionLabel: "멤버 회고 확인",
    },
    {
      id: "PUBLIC",
      title: "공개 기록",
      detail: "공개 기록 표면에서 발행 상태를 확인할 수 있습니다.",
      tone: "ok",
      href: "/clubs/club-a/sessions/s1",
      actionLabel: "공개 기록 확인",
    },
  ],
  evidence: [
    { label: "공개 요약", value: "저장됨" },
    { label: "하이라이트", value: "2" },
    { label: "한줄평", value: "1" },
    { label: "피드백 문서", value: "열람 가능" },
    { label: "최근 멤버 알림", value: "없음" },
  ],
};

describe("SessionClosingBoard", () => {
  it("renders primary action checklist surfaces and evidence", () => {
    render(<SessionClosingBoard view={view} />);

    expect(screen.getByRole("heading", { name: "No.07 · E2E Book" })).toBeVisible();
    expect(screen.getByText("이번 회차 다음 조치")).toBeVisible();
    expect(screen.getByText("멤버가 지난 모임 회고로 돌아갈 알림 흐름이 아직 완성되지 않았습니다.")).toBeVisible();
    expect(screen.getByText("마감 단계")).toBeVisible();
    expect(screen.getByText("조치 필요")).toBeVisible();
    expect(screen.getByRole("link", { name: "호스트 문서 확인" })).toHaveAttribute("href", "/app/host/sessions/s1/edit");
    expect(screen.getByRole("link", { name: "멤버 회고 확인" })).toHaveAttribute("href", "/clubs/club-a/app/sessions/s1");
    expect(screen.getByRole("link", { name: "공개 기록 확인" })).toHaveAttribute("href", "/clubs/club-a/sessions/s1");
    expect(screen.getByText("최근 멤버 알림")).toBeVisible();
  });

  it("shows honest surface copy when member and public links are missing", () => {
    render(
      <SessionClosingBoard
        view={{
          ...view,
          surfaces: view.surfaces.map((surface) =>
            surface.id === "HOST"
              ? surface
              : {
                  ...surface,
                  href: null,
                  detail:
                    surface.id === "MEMBER"
                      ? "멤버 회고 진입은 아직 확인되지 않았습니다."
                      : "공개 표면에는 아직 발행되지 않았습니다.",
                },
          ),
        }}
      />,
    );

    expect(screen.getByText("멤버 회고 진입은 아직 확인되지 않았습니다.")).toBeVisible();
    expect(screen.getByText("공개 표면에는 아직 발행되지 않았습니다.")).toBeVisible();
    expect(screen.queryByRole("link", { name: "멤버 회고 확인" })).toBeNull();
    expect(screen.queryByRole("link", { name: "공개 기록 확인" })).toBeNull();
  });

  it("does not render private sentinels", () => {
    render(<SessionClosingBoard view={view} />);

    expect(screen.queryByText("member1@example.com")).toBeNull();
    expect(screen.queryByText("ADMIN_ROUTE")).toBeNull();
    expect(screen.queryByText("{\"")).toBeNull();
  });
});
