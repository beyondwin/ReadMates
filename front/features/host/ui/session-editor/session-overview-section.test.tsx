import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostSessionEditorOverview } from "../../model/host-session-editor-view-model";
import { SessionEditorSectionNav } from "./session-editor-section-nav";
import { SessionOverviewSection } from "./session-overview-section";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SessionOverviewSection", () => {
  it("is the tabpanel controlled by the actual overview navigation tab", () => {
    renderOverview();

    const overviewTab = screen.getByRole("tab", { name: "개요" });
    const ledger = screen.getByRole("tabpanel", { name: "개요" });
    expect(overviewTab).toHaveAttribute("aria-controls", "host-editor-panel-overview");
    expect(ledger).toHaveAttribute("id", "host-editor-panel-overview");
    expect(ledger).toHaveAttribute("aria-labelledby", "host-editor-tab-overview");
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

  it("shows one clear empty-draft message without the projected idle status", () => {
    renderOverview({
      overview: overviewFixture({
        draft: {
          exists: false,
          statusLabel: "초안 준비됨",
          sourceLabel: null,
          updatedAt: null,
          tone: "neutral",
        },
      }),
    });

    expect(screen.getByText("준비된 초안이 없습니다")).toBeInTheDocument();
    expect(screen.queryByText("초안 준비됨")).not.toBeInTheDocument();
  });

  it("shows applied and draft timestamps as Seoul date-time labels", () => {
    renderOverview();

    expect(screen.getByText("2026.07.27 12:00")).toHaveAttribute(
      "datetime",
      "2026-07-27T12:00:00+09:00",
    );
    expect(screen.getByText("2026.07.27 13:00")).toHaveAttribute(
      "datetime",
      "2026-07-27T13:00:00+09:00",
    );
    expect(screen.queryByText("2026-07-27T12:00:00+09:00")).not.toBeInTheDocument();
  });

  it("reports the exact next-action target", async () => {
    const user = userEvent.setup();
    const onNextAction = vi.fn();
    renderOverview({ onNextAction });

    await user.click(screen.getByRole("button", { name: "초안 내용을 검토하세요" }));

    expect(onNextAction).toHaveBeenCalledWith({ section: "records", source: "manual" });
  });

  it("asks to open a draft meeting after confirm", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    const onOpenSession = vi.fn();
    renderOverview({ sessionState: "DRAFT", onOpenSession });

    const openButton = screen.getByRole("button", { name: "멤버에게 열기" });
    expect(openButton).toBeEnabled();
    expect(openButton).toHaveClass("btn", "btn-primary", "btn-sm");

    await user.click(openButton);

    expect(onOpenSession).toHaveBeenCalledTimes(1);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "모임 마치기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "모임 전으로 되돌리기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "기록 공개" })).not.toBeInTheDocument();
  });

  it("offers 목록에서 지우기 for a draft meeting without using window.confirm", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    const onDeleteDraft = vi.fn();
    const onOpenSession = vi.fn();
    renderOverview({ sessionState: "DRAFT", onOpenSession, onDeleteDraft });

    expect(lifecycleActionNames()).toEqual(["멤버에게 열기", "목록에서 지우기"]);
    const deleteButton = screen.getByRole("button", { name: "목록에서 지우기" });
    expect(deleteButton).toHaveClass("btn", "btn-ghost", "btn-sm");
    expect(screen.queryByRole("button", { name: "세션 삭제" })).not.toBeInTheDocument();

    await user.click(deleteButton);

    expect(onDeleteDraft).toHaveBeenCalledTimes(1);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onOpenSession).not.toHaveBeenCalled();
  });

  it("offers close and reverse for an open session without treating visibility as a lifecycle action", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    const onCloseSession = vi.fn().mockResolvedValue(undefined);
    const onReverseSession = vi.fn();
    renderOverview({
      sessionState: "OPEN",
      onCloseSession,
      reverseLabel: "모임 전으로 되돌리기",
      onReverseSession,
    });

    expect(screen.getByText("모임이 끝났다면 세션을 마감한 뒤 기록을 정리하세요.")).toBeInTheDocument();
    expect(lifecycleActionNames()).toEqual(["모임 마치기", "모임 전으로 되돌리기"]);
    expect(screen.getByRole("button", { name: "모임 마치기" })).toHaveClass("btn", "btn-primary", "btn-sm");
    expect(screen.getByRole("button", { name: "모임 전으로 되돌리기" })).toHaveClass(
      "btn",
      "btn-ghost",
      "btn-sm",
    );
    expect(lifecycleActions("모임 마치기")).toHaveClass("rm-host-session-editor__lifecycle-actions");

    await user.click(screen.getByRole("button", { name: "모임 마치기" }));

    expect(onCloseSession).toHaveBeenCalledTimes(1);
    expect(onReverseSession).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /게스트 공개/ })).not.toBeInTheDocument();
  });

  it("guides a closed session through wrap-up upload before record publication", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    const onNextAction = vi.fn();
    const onPublishSession = vi.fn().mockResolvedValue(undefined);
    const onReverseSession = vi.fn();
    renderOverview({
      sessionState: "CLOSED",
      onNextAction,
      onPublishSession,
      reverseLabel: "다시 진행 중으로",
      onReverseSession,
    });

    expect(screen.getByText(/모임은 마감되었습니다/)).toHaveTextContent("기록 작업대");
    expect(lifecycleActionNames()).toEqual(["정리본 올리기", "기록 공개", "다시 진행 중으로"]);
    await user.click(screen.getByRole("button", { name: "정리본 올리기" }));
    expect(onNextAction).toHaveBeenCalledWith({ section: "records", source: "json" });
    await user.click(screen.getByRole("button", { name: "기록 공개" }));
    expect(onPublishSession).toHaveBeenCalledTimes(1);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("explains that a published session remains editable", () => {
    renderOverview({ sessionState: "PUBLISHED" });

    expect(screen.getByText("공개된 세션입니다. 공개 후에도 기본 정보와 기록 초안을 수정할 수 있습니다."))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "모임 마치기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "기록 공개" })).not.toBeInTheDocument();
  });

  it("offers only unpublish for a published session", () => {
    renderOverview({
      sessionState: "PUBLISHED",
      reverseLabel: "공개 취소",
      onReverseSession: vi.fn(),
    });

    expect(lifecycleActionNames()).toEqual(["공개 취소"]);
    expect(screen.getByRole("button", { name: "공개 취소" })).toHaveClass("btn", "btn-ghost", "btn-sm");
    expect(screen.queryByRole("button", { name: "모임 마치기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "기록 공개" })).not.toBeInTheDocument();
  });

  it("does not offer reverse or close without an open callback on a draft session", () => {
    renderOverview({ sessionState: "DRAFT" });

    expect(screen.queryByRole("button", { name: "멤버에게 열기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "모임 마치기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "모임 전으로 되돌리기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 진행 중으로" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "공개 취소" })).not.toBeInTheDocument();
  });

  it("calls onReverseSession once from the reverse action", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    const onReverseSession = vi.fn();
    renderOverview({
      sessionState: "OPEN",
      onCloseSession: vi.fn(),
      reverseLabel: "모임 전으로 되돌리기",
      onReverseSession,
    });

    await user.click(screen.getByRole("button", { name: "모임 전으로 되돌리기" }));

    expect(onReverseSession).toHaveBeenCalledTimes(1);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("disables forward and reverse actions while lifecycle work is pending", () => {
    renderOverview({
      sessionState: "OPEN",
      onCloseSession: vi.fn(),
      reverseLabel: "모임 전으로 되돌리기",
      onReverseSession: vi.fn(),
      lifecyclePending: true,
    });

    expect(screen.getByRole("button", { name: "모임 마치기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "모임 전으로 되돌리기" })).toBeDisabled();
  });

  it("disables opening a draft while lifecycle work is pending", () => {
    renderOverview({
      sessionState: "DRAFT",
      onOpenSession: vi.fn(),
      onDeleteDraft: vi.fn(),
      lifecyclePending: true,
    });

    expect(screen.getByRole("button", { name: "멤버에게 열기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "목록에서 지우기" })).toBeDisabled();
  });
});

function renderOverview({
  overview = overviewFixture(),
  sessionState = "OPEN",
  onNextAction = vi.fn(),
  onOpenSession,
  onCloseSession,
  onPublishSession,
  onReverseSession,
  reverseLabel,
  onDeleteDraft,
  lifecyclePending = false,
}: {
  overview?: HostSessionEditorOverview;
  sessionState?: "DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED";
  onNextAction?: (target: HostSessionEditorOverview["nextAction"]["target"]) => void;
  onOpenSession?: () => void;
  onCloseSession?: () => void | Promise<void>;
  onPublishSession?: () => void | Promise<void>;
  onReverseSession?: () => void;
  reverseLabel?: string;
  onDeleteDraft?: (event: { currentTarget: EventTarget | null }) => void;
  lifecyclePending?: boolean;
} = {}) {
  return render(
    <>
      <SessionEditorSectionNav activeSection="overview" onSectionChange={() => {}} />
      <SessionOverviewSection
        overview={overview}
        sessionState={sessionState}
        onNextAction={onNextAction}
        onOpenSession={onOpenSession}
        onCloseSession={onCloseSession}
        onPublishSession={onPublishSession}
        onReverseSession={onReverseSession}
        reverseLabel={reverseLabel}
        onDeleteDraft={onDeleteDraft}
        lifecyclePending={lifecyclePending}
      />
    </>,
  );
}

function lifecycleActions(buttonName: string) {
  return screen.getByRole("button", { name: buttonName }).closest(
    ".rm-host-session-editor__lifecycle-actions",
  );
}

function lifecycleActionNames() {
  const container = document.querySelector(".rm-host-session-editor__lifecycle-actions");
  if (!(container instanceof HTMLElement)) {
    return [];
  }
  return within(container)
    .getAllByRole("button")
    .map((button) => button.textContent?.trim() ?? "");
}

function overviewFixture(
  overrides: Partial<HostSessionEditorOverview> = {},
): HostSessionEditorOverview {
  return {
    applied: {
      exists: true,
      versionLabel: "버전 3",
      visibilityLabel: "게스트 공개",
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
