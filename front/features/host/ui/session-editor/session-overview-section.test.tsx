import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { HostSessionEditorOverview } from "../../model/host-session-editor-view-model";
import { SessionOverviewSection } from "./session-overview-section";

describe("SessionOverviewSection", () => {
  it("connects the applied record, working draft, and next action as one ledger", () => {
    renderOverview();

    const ledger = screen.getByRole("region", { name: "세션 편집 개요" });
    expect(within(ledger).getByRole("heading", { name: "현재 적용본" })).toBeInTheDocument();
    expect(within(ledger).getByRole("heading", { name: "작업 중인 초안" })).toBeInTheDocument();
    expect(within(ledger).getByRole("heading", { name: "다음 할 일" })).toBeInTheDocument();
    expect(ledger.querySelectorAll(".surface")).toHaveLength(0);
  });

  it("does not invent version zero and presents record visibility as separate metadata", () => {
    renderOverview({
      overview: overviewFixture({
        applied: {
          exists: false,
          versionLabel: null,
          visibilityLabel: "호스트만",
          appliedAt: null,
          summary: "요약이 아직 없습니다",
        },
      }),
    });

    expect(screen.queryByText("버전 0")).not.toBeInTheDocument();
    expect(screen.getByText("아직 적용된 기록이 없습니다")).toBeInTheDocument();
    const visibility = screen.getByText("호스트만");
    expect(visibility).toHaveClass("badge");
    expect(visibility.parentElement).toHaveTextContent("기록 공개 범위");
    expect(visibility.closest("button")).toBeNull();
  });

  it("reports the exact next-action target", async () => {
    const user = userEvent.setup();
    const onNextAction = vi.fn();
    renderOverview({ onNextAction });

    await user.click(screen.getByRole("button", { name: "초안 내용을 검토하세요" }));

    expect(onNextAction).toHaveBeenCalledWith({ section: "records", source: "manual" });
  });

  it("offers session closing for an open session without treating visibility as a lifecycle action", async () => {
    const user = userEvent.setup();
    const onCloseSession = vi.fn().mockResolvedValue(undefined);
    renderOverview({ sessionState: "OPEN", onCloseSession });

    expect(screen.getByText("모임이 끝났다면 세션을 마감한 뒤 기록을 정리하세요.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "세션 마감" }));
    expect(onCloseSession).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /멤버 공개/ })).not.toBeInTheDocument();
  });

  it("guides a closed session through the record workbench before session publication", async () => {
    const user = userEvent.setup();
    const onNextAction = vi.fn();
    const onPublishSession = vi.fn().mockResolvedValue(undefined);
    renderOverview({
      sessionState: "CLOSED",
      onNextAction,
      onPublishSession,
    });

    expect(screen.getByText(/모임은 마감되었습니다/)).toHaveTextContent("기록 작업대");
    await user.click(screen.getByRole("button", { name: "기록 작업대" }));
    expect(onNextAction).toHaveBeenCalledWith({ section: "records", source: "manual" });
    await user.click(screen.getByRole("button", { name: "세션 공개" }));
    expect(onPublishSession).toHaveBeenCalledTimes(1);
  });

  it("explains that a published session remains editable", () => {
    renderOverview({ sessionState: "PUBLISHED" });

    expect(screen.getByText("공개된 세션입니다. 공개 후에도 기본 정보와 기록 초안을 수정할 수 있습니다."))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "세션 마감" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "세션 공개" })).not.toBeInTheDocument();
  });
});

function renderOverview({
  overview = overviewFixture(),
  sessionState = "OPEN",
  onNextAction = vi.fn(),
  onCloseSession,
  onPublishSession,
}: {
  overview?: HostSessionEditorOverview;
  sessionState?: "DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED";
  onNextAction?: (target: HostSessionEditorOverview["nextAction"]["target"]) => void;
  onCloseSession?: () => void | Promise<void>;
  onPublishSession?: () => void | Promise<void>;
} = {}) {
  return render(
    <SessionOverviewSection
      overview={overview}
      sessionState={sessionState}
      onNextAction={onNextAction}
      onCloseSession={onCloseSession}
      onPublishSession={onPublishSession}
      lifecyclePending={false}
    />,
  );
}

function overviewFixture(
  overrides: Partial<HostSessionEditorOverview> = {},
): HostSessionEditorOverview {
  return {
    applied: {
      exists: true,
      versionLabel: "버전 3",
      visibilityLabel: "멤버 공개",
      appliedAt: "2026-07-27T12:00:00+09:00",
      summary: "세 번째 적용본 요약",
    },
    draft: {
      exists: true,
      statusLabel: "저장됨",
      sourceLabel: "직접 작성",
      updatedAt: "2026-07-27T13:00:00+09:00",
      tone: "info",
    },
    nextAction: {
      kind: "REVIEW_DRAFT",
      label: "초안 내용을 검토하세요",
      target: { section: "records", source: "manual" },
      enabled: true,
    },
    ...overrides,
  };
}
