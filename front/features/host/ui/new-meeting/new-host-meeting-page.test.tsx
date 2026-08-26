import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { findNestedLiveRegions } from "@/shared/testing/accessibility-checks";
import { emptyNewMeetingDraft, type NewMeetingDraft } from "../../model/new-host-meeting-model";
import { NewHostMeetingPage } from "./new-host-meeting-page";

const onFieldChange = vi.fn<(field: keyof NewMeetingDraft, value: string) => void>();

function renderPage(overrides: Partial<Parameters<typeof NewHostMeetingPage>[0]> = {}) {
  return render(
    <NewHostMeetingPage
      draft={emptyNewMeetingDraft()}
      errors={{}}
      suggestionStatus="no-history"
      suggestionMessage="지난 모임이 없어 직접 입력합니다."
      suggestionReason={null}
      sourceMeetingCount={0}
      sensitiveSuggestionAvailable={false}
      status="editing"
      formError={null}
      savedMeeting={null}
      prepareConfirmationOpen={false}
      prepareError={null}
      onFieldChange={onFieldChange}
      onSubmit={vi.fn()}
      onCheckPendingCreate={vi.fn()}
      onRetrySuggestions={vi.fn()}
      onAdoptSensitiveSuggestion={vi.fn()}
      onPrepareRequested={vi.fn()}
      onPrepareCanceled={vi.fn()}
      onPrepareConfirmed={vi.fn()}
      {...overrides}
    />,
  );
}

describe("NewHostMeetingPage", () => {
  it("renders a dedicated indexed form and judgment rail with one initial CTA", () => {
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "새 모임 만들기" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "새 모임 작성 목차" })).toBeVisible();
    expect(screen.getByRole("form", { name: "새 모임 정보" })).toBeVisible();
    expect(screen.getByRole("complementary", { name: "저장 전 확인" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: "모임 초안 저장" })).toHaveLength(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /알림/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/modal|sheet/i)).not.toBeInTheDocument();
  });

  it("links each section-index item to the matching form section", () => {
    renderPage();

    const bookTarget = document.querySelector(
      screen.getByRole("link", { name: "책과 제목" }).getAttribute("href")!,
    );
    const scheduleTarget = document.querySelector(
      screen.getByRole("link", { name: "일시와 장소" }).getAttribute("href")!,
    );

    expect(within(bookTarget as HTMLElement).getByRole("heading", { name: "읽을 책" })).toBeVisible();
    expect(within(scheduleTarget as HTMLElement).getByRole("heading", { name: "모임 일정과 접속 정보" })).toBeVisible();
  });

  it("keeps URL and passcode behind one explicit adoption action", async () => {
    const user = userEvent.setup();
    const adopt = vi.fn();
    renderPage({
      sensitiveSuggestionAvailable: true,
      suggestionStatus: "ready",
      suggestionMessage: "최근 모임의 운영 정보를 바탕으로 제안합니다.",
      onAdoptSensitiveSuggestion: adopt,
    });

    expect(screen.getByLabelText("미팅 URL")).toHaveValue("");
    expect(screen.getByLabelText("Passcode · 선택")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "이전 온라인 모임 정보 사용" }));
    expect(adopt).toHaveBeenCalledTimes(1);
  });

  it("shows the host-only saved projection and confirms prepare in a separate transaction", async () => {
    const user = userEvent.setup();
    const requestPrepare = vi.fn();
    const confirmPrepare = vi.fn();
    const { rerender } = renderPage({
      status: "saved",
      savedMeeting: {
        sessionId: "meeting-8",
        sessionNumber: 8,
        state: "DRAFT",
        accessScope: "HOST_ONLY",
        siteVisibility: "HIDDEN",
        notificationDecision: "NOT_SENT",
      },
      onPrepareRequested: requestPrepare,
      onPrepareConfirmed: confirmPrepare,
    });

    expect(screen.getByText("호스트만 볼 수 있는 초안으로 저장했습니다.")).toBeVisible();
    expect(screen.getByText(/공개 사이트에는 보이지 않습니다/)).toBeVisible();
    expect(screen.getAllByRole("button", { name: "멤버와 준비 시작" })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "멤버와 준비 시작" }));
    expect(requestPrepare).toHaveBeenCalledTimes(1);

    rerender(
      <NewHostMeetingPage
        draft={emptyNewMeetingDraft()}
        errors={{}}
        suggestionStatus="ready"
        suggestionMessage=""
        suggestionReason={null}
        sourceMeetingCount={0}
        sensitiveSuggestionAvailable={false}
        status="saved"
        formError={null}
        savedMeeting={{
          sessionId: "meeting-8",
          sessionNumber: 8,
          state: "DRAFT",
          accessScope: "HOST_ONLY",
          siteVisibility: "HIDDEN",
          notificationDecision: "NOT_SENT",
        }}
        prepareConfirmationOpen
        prepareError={null}
        onFieldChange={onFieldChange}
        onSubmit={vi.fn()}
        onCheckPendingCreate={vi.fn()}
        onRetrySuggestions={vi.fn()}
        onAdoptSensitiveSuggestion={vi.fn()}
        onPrepareRequested={requestPrepare}
        onPrepareCanceled={vi.fn()}
        onPrepareConfirmed={confirmPrepare}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "멤버와 준비 시작" });
    expect(dialog).toHaveTextContent("참여자 목록을 확정하고 멤버에게 모임을 보입니다");
    await user.click(screen.getByRole("button", { name: "확인하고 준비 시작" }));
    expect(confirmPrepare).toHaveBeenCalledTimes(1);
  });

  it("associates field errors without replacing entered text", () => {
    renderPage({
      draft: { ...emptyNewMeetingDraft(), bookTitle: "입력은 그대로" },
      errors: { bookTitle: "책 제목을 확인해 주세요." },
    });

    expect(screen.getByLabelText("책 제목")).toHaveValue("입력은 그대로");
    expect(screen.getByLabelText("책 제목")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("책 제목을 확인해 주세요.")).toBeVisible();
  });

  it("imports editorial ledger styles from the new-meeting route entry", () => {
    const routeSource = readFileSync(path.resolve("features/host/route/new-host-meeting-route.tsx"), "utf8");
    expect(routeSource).toContain("host-editorial-ledger.css");
  });

  it("keeps one editable form flow without auto-submit, forced AI, or inline styles", () => {
    const onSubmit = vi.fn();
    renderPage({
      onSubmit,
      suggestionStatus: "ready",
      suggestionMessage: "최근 모임의 운영 정보를 바탕으로 제안합니다.",
    });

    const root = document.querySelector(".rm-host-editorial-ledger") as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(within(root!).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(within(root!).getByRole("heading", { level: 1, name: "새 모임 만들기" })).toBeInTheDocument();
    expect(root!.querySelector("[role='tablist']")).toBeNull();
    expect(readFileSync(path.resolve("features/host/ui/new-meeting/new-host-meeting-page.tsx"), "utf8")).not.toMatch(/style=\{\{/);
    expect(within(root!).getByRole("heading", { level: 1 }).getAttribute("style")).toBeNull();
    expect(within(root!).getByRole("form", { name: "새 모임 정보" }).getAttribute("style")).toBeNull();
    expect(findNestedLiveRegions(root!)).toEqual([]);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /AI|자동 생성|자동 제출/i })).not.toBeInTheDocument();
    expect(screen.getByRole("form", { name: "새 모임 정보" })).toHaveClass("rm-host-editorial-ledger__form");
    expect(screen.getAllByRole("button", { name: "모임 초안 저장" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "모임 초안 저장" })).toHaveClass(
      "rm-host-editorial-ledger__action",
    );
    expect(screen.getByRole("status")).toHaveClass("rm-host-editorial-ledger__state");
  });
});
