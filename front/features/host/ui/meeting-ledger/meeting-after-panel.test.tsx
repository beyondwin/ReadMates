import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SessionImportPreviewResponse } from "@/features/host/model/host-view-types";
import { MeetingAfterPanel } from "./meeting-after-panel";

const importPreview: SessionImportPreviewResponse = {
  valid: true,
  session: { sessionNumber: 7, bookTitle: "테스트 책", meetingDate: "2026-05-16" },
  publication: { summary: "정리본 요약" },
  highlights: [],
  oneLineReviews: [],
  feedbackDocument: {
    fileName: "import-preview.md",
    title: "가져올 문서",
    valid: true,
  },
  issues: [],
};

const legacySnapshot = {
  schema: "readmates-session-record:v1",
  visibility: "MEMBER",
  publicationSummary: "레거시 공개 요약입니다.",
  highlights: [],
  oneLineReviews: [],
  feedbackDocument: { fileName: "", title: "", markdown: "" },
} as const;

describe("MeetingAfterPanel", () => {
  it("publishes from a legacy applied snapshot summary without a revision number", () => {
    render(
      <MeetingAfterPanel
        state="CLOSED"
        summary={legacySnapshot.publicationSummary}
        accessScope="GUEST_READABLE"
        onPublish={() => {}}
      />,
    );

    expect(screen.queryByText("버전 0")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "기록 공개" })).toBeEnabled();
  });

  it("offers package upload not a feedback textarea", () => {
    render(<MeetingAfterPanel state="CLOSED" summary="" accessScope="GUEST_READABLE" />);
    expect(screen.getByRole("button", { name: "정리본 올리기" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Markdown/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "피드백 넣기" })).not.toBeInTheDocument();
  });

  it("puts attendance, wrap-up, and publish on the after-phase primary row", () => {
    render(
      <MeetingAfterPanel
        state="CLOSED"
        summary="공개할 요약"
        accessScope="GUEST_READABLE"
      />,
    );

    expect(primaryActionNames()).toEqual(["출석 수정", "정리본 올리기", "기록 공개"]);
    expect(screen.queryByRole("button", { name: "AI로 생성" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "AI로 생성" })).not.toBeInTheDocument();
  });

  it("disables 기록 공개 with a one-line reason when the summary is empty", () => {
    render(
      <MeetingAfterPanel
        state="CLOSED"
        summary="   "
        accessScope="GUEST_READABLE"
      />,
    );

    expect(screen.getByRole("button", { name: "기록 공개" })).toBeDisabled();
    expect(screen.getByText("공개하려면 요약이 필요합니다")).toBeInTheDocument();
  });

  it("disables 기록 공개 with a one-line reason when access is HOST_ONLY", () => {
    render(
      <MeetingAfterPanel
        state="CLOSED"
        summary="공개할 요약"
        accessScope="HOST_ONLY"
      />,
    );

    expect(screen.getByRole("button", { name: "기록 공개" })).toBeDisabled();
    expect(screen.getByText("공개하려면 게스트와 멤버에게 보이기로 바꿔 주세요.")).toBeInTheDocument();
    expect(screen.queryByText("공개하려면 요약이 필요합니다")).not.toBeInTheDocument();
  });

  it("keeps the HOST_ONLY reason when the summary is also empty", () => {
    render(
      <MeetingAfterPanel
        state="CLOSED"
        summary=""
        accessScope="HOST_ONLY"
      />,
    );

    expect(screen.getByRole("button", { name: "기록 공개" })).toBeDisabled();
    expect(screen.getByText("공개하려면 게스트와 멤버에게 보이기로 바꿔 주세요.")).toBeInTheDocument();
    expect(screen.queryByText("공개하려면 요약이 필요합니다")).not.toBeInTheDocument();
  });

  it("opens the package drop zone from 정리본 올리기", async () => {
    const user = userEvent.setup();
    render(
      <MeetingAfterPanel
        state="CLOSED"
        summary="공개할 요약"
        accessScope="GUEST_READABLE"
        sessionId="session-1"
        recordVisibility="MEMBER"
      />,
    );

    expect(screen.queryByText("정리한 파일을 여기에 놓으세요")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "정리본 올리기" }));
    expect(screen.getByLabelText("정리한 파일을 여기에 놓으세요")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Markdown/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Markdown/i })).not.toBeInTheDocument();
  });

  it("keeps in-app AI inside collapsed 다른 방법", async () => {
    const user = userEvent.setup();
    const onOpenAi = vi.fn();
    render(
      <MeetingAfterPanel
        state="CLOSED"
        summary="공개할 요약"
        accessScope="GUEST_READABLE"
        canUseAi
        onOpenAi={onOpenAi}
      />,
    );

    const other = screen.getByRole("group", { name: "다른 방법" });
    expect(other).toBeInTheDocument();
    expect(within(other).getByRole("button", { name: "AI로 생성", hidden: true })).not.toBeVisible();

    await user.click(within(other).getByText("다른 방법"));
    await user.click(within(other).getByRole("button", { name: "AI로 생성" }));
    expect(onOpenAi).toHaveBeenCalledTimes(1);
    expect(primaryActionNames()).not.toContain("AI로 생성");
  });

  it("shows a one-line HOST_ONLY import reason and a control to set GUEST_READABLE first", async () => {
    const user = userEvent.setup();
    const onSetGuestReadable = vi.fn();
    render(
      <MeetingAfterPanel
        state="CLOSED"
        summary="공개할 요약"
        accessScope="HOST_ONLY"
        sessionId="session-1"
        recordVisibility="HOST_ONLY"
        importPreview={importPreview}
        importStatus="ready"
        onSetGuestReadable={onSetGuestReadable}
      />,
    );

    await user.click(screen.getByRole("button", { name: "정리본 올리기" }));
    expect(screen.getByRole("region", { name: "정리본 미리보기" })).toBeInTheDocument();
    expect(screen.queryByText(/회차/)).not.toBeInTheDocument();
    expect(screen.queryByText(/세션/)).not.toBeInTheDocument();
    expect(screen.getByText("기록 공개 범위를 MEMBER 또는 PUBLIC으로 바꾼 뒤 저장할 수 있습니다.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "게스트와 멤버에게 보이기로 바꾸기" }));
    expect(onSetGuestReadable).toHaveBeenCalledTimes(1);
  });

  it("lands on apply review after a successful package commit", async () => {
    const user = userEvent.setup();
    const onImportCommit = vi.fn();
    const onConfirmApply = vi.fn();
    const onDismissApply = vi.fn();
    render(
      <MeetingAfterPanel
        state="CLOSED"
        summary="공개할 요약"
        accessScope="GUEST_READABLE"
        sessionId="session-1"
        recordVisibility="MEMBER"
        importPreview={importPreview}
        importStatus="ready"
        applyReview={{
          open: true,
          preview: {
            eventType: "SESSION_RECORD_UPDATED",
            changedSections: ["공개 요약"],
            liveRevision: 0,
            nextLiveRevision: 1,
            draftRevision: 4,
            visibility: "MEMBER",
            hasAppliedRecord: true,
          },
          submitting: false,
        }}
        onImportCommit={onImportCommit}
        onConfirmApply={onConfirmApply}
        onDismissApply={onDismissApply}
      />,
    );

    await user.click(screen.getByRole("button", { name: "정리본 올리기" }));
    const dialog = screen.getByRole("dialog", { name: "반영 전 확인" });
    expect(within(dialog).getByText("이전 적용본 → 버전 1")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "멤버에게 반영" })).toBeEnabled();
    await user.click(within(dialog).getByRole("button", { name: "멤버에게 반영" }));
    expect(onConfirmApply).toHaveBeenCalledTimes(1);
    expect(onDismissApply).not.toHaveBeenCalled();
  });

  it.each(["Escape", "나중", "닫기"] as const)(
    "does not apply from %s",
    async (dismissal) => {
      const user = userEvent.setup();
      const onConfirmApply = vi.fn();
      const onDismissApply = vi.fn();
      render(
        <MeetingAfterPanel
          state="CLOSED"
          summary="공개할 요약"
          accessScope="GUEST_READABLE"
          applyReview={{
            open: true,
            preview: {
              eventType: "SESSION_RECORD_UPDATED",
              changedSections: ["공개 요약"],
              liveRevision: 0,
              nextLiveRevision: 1,
              draftRevision: 4,
              visibility: "MEMBER",
            },
            submitting: false,
          }}
          onConfirmApply={onConfirmApply}
          onDismissApply={onDismissApply}
        />,
      );

      const dialog = screen.getByRole("dialog", { name: "반영 전 확인" });
      if (dismissal === "Escape") {
        await user.keyboard("{Escape}");
      } else {
        await user.click(within(dialog).getByRole("button", { name: dismissal }));
      }

      expect(onDismissApply).toHaveBeenCalledTimes(1);
      expect(onConfirmApply).not.toHaveBeenCalled();
    },
  );

  it("does not use window.confirm", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    const onPublish = vi.fn();
    const onEditAttendance = vi.fn();
    render(
      <MeetingAfterPanel
        state="CLOSED"
        summary="공개할 요약"
        accessScope="GUEST_READABLE"
        onPublish={onPublish}
        onEditAttendance={onEditAttendance}
      />,
    );

    await user.click(screen.getByRole("button", { name: "출석 수정" }));
    await user.click(screen.getByRole("button", { name: "기록 공개" }));
    expect(onEditAttendance).toHaveBeenCalledTimes(1);
    expect(onPublish).toHaveBeenCalledTimes(1);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("does not show operator jargon on the after-phase surface", () => {
    render(
      <MeetingAfterPanel
        state="CLOSED"
        summary="공개할 요약"
        accessScope="GUEST_READABLE"
      />,
    );

    expect(screen.queryByText(/세션/)).not.toBeInTheDocument();
    expect(screen.queryByText(/회차/)).not.toBeInTheDocument();
    expect(screen.queryByText("기록 작업대")).not.toBeInTheDocument();
    expect(screen.queryByText("외부 JSON")).not.toBeInTheDocument();
    expect(screen.queryByText(/session-import/i)).not.toBeInTheDocument();
  });

  it("forwards a dropped package file to the existing import handler", async () => {
    const onFileSelected = vi.fn();
    render(
      <MeetingAfterPanel
        state="CLOSED"
        summary="공개할 요약"
        accessScope="GUEST_READABLE"
        sessionId="session-1"
        recordVisibility="MEMBER"
        onFileSelected={onFileSelected}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "정리본 올리기" }));
    const dropZone = document.querySelector(".rm-session-import-drop");
    expect(dropZone).toBeTruthy();
    const file = new File([JSON.stringify({ schema: "readmates-session-import:v1" })], "wrap-up.json", {
      type: "application/json",
    });
    fireEvent.drop(dropZone as Element, {
      dataTransfer: { files: [file], types: ["Files"] },
    });

    expect(onFileSelected).toHaveBeenCalledTimes(1);
  });
});

function primaryActionNames() {
  const container = document.querySelector(".rm-meeting-after-panel__actions");
  if (!(container instanceof HTMLElement)) {
    return [];
  }
  return within(container)
    .getAllByRole("button")
    .map((button) => button.textContent?.trim() ?? "");
}
