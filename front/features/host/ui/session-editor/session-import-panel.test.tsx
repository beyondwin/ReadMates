import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionImportPreviewResponse, SessionImportRecordPreview, SessionRecordVisibility } from "@/features/host/model/host-view-types";
import { SessionImportPanelBody } from "./session-import-panel";

describe("SessionImportPanelBody", () => {
  it("renders a saveable preview review and calls commit", () => {
    const onCommit = vi.fn();
    renderPanel({ preview: preview({ valid: true }), onCommit });

    const review = screen.getByRole("region", { name: "세션 기록 미리보기" });
    expect(within(review).getByText("저장 가능")).toBeInTheDocument();
    expect(within(review).getByText("7회차 · E2E 책 · 2026-05-16")).toBeInTheDocument();
    expect(within(review).getByText("공개 요약 교체")).toBeInTheDocument();
    expect(within(review).getByText("하이라이트 1개")).toBeInTheDocument();
    expect(within(review).getByText("한줄평 1개")).toBeInTheDocument();
    expect(within(review).getByText("작성자 매칭 완료")).toBeInTheDocument();
    expect(within(review).getByText(/매칭 2개 \/ 전체 2개/)).toBeInTheDocument();
    expect(within(review).getByText("피드백 문서 구조 확인 완료")).toBeInTheDocument();
    expect(screen.getByText("현재 선택한 공개 범위: MEMBER")).toBeInTheDocument();

    const button = screen.getByRole("button", { name: "가져온 기록 저장" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("shows unmatched authors and blocks HOST_ONLY visibility", () => {
    renderPanel({
      recordVisibility: "HOST_ONLY",
      preview: preview({
        valid: true,
        highlights: [record({ authorName: "긴 이름을 가진 외부 작성자", authorMatched: false })],
      }),
    });

    const review = screen.getByRole("region", { name: "세션 기록 미리보기" });
    expect(within(review).getByText("확인 필요")).toBeInTheDocument();
    expect(within(review).getByText("작성자 1개 확인 필요")).toBeInTheDocument();
    expect(within(review).getByText("긴 이름을 가진 외부 작성자")).toBeInTheDocument();
    expect(within(review).getByText("기록 공개 범위를 MEMBER 또는 PUBLIC으로 바꾼 뒤 저장할 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "가져온 기록 저장" })).toBeDisabled();
  });

  it("renders server issue messages but not issue codes or raw json", () => {
    renderPanel({
      preview: preview({
        valid: false,
        feedbackDocumentValid: false,
        issues: [{ code: "ADMIN_ROUTE", message: "피드백 문서 heading을 확인해 주세요." }],
      }),
    });

    const review = screen.getByRole("region", { name: "세션 기록 미리보기" });
    expect(within(review).getByText("피드백 문서 구조 확인 필요")).toBeInTheDocument();
    expect(within(review).getByText("피드백 문서 구조를 확인해 주세요.")).toBeInTheDocument();
    expect(within(review).getByText("피드백 문서 heading을 확인해 주세요.")).toBeInTheDocument();
    expect(screen.queryByText("ADMIN_ROUTE")).toBeNull();
    expect(screen.queryByText("{\"")).toBeNull();
    expect(screen.getByRole("button", { name: "가져온 기록 저장" })).toBeDisabled();
  });
});

function renderPanel({
  preview,
  recordVisibility = "MEMBER",
  onCommit = vi.fn(),
}: {
  preview: SessionImportPreviewResponse;
  recordVisibility?: SessionRecordVisibility;
  onCommit?: () => void;
}) {
  render(
    <SessionImportPanelBody
      sessionId="session-1"
      recordVisibility={recordVisibility}
      preview={preview}
      status={preview.valid ? "ready" : "error"}
      error={preview.valid ? null : "가져온 JSON에서 수정할 항목이 있습니다."}
      onFileSelected={() => {}}
      onCommit={onCommit}
    />,
  );
}

function preview({
  valid,
  feedbackDocumentValid = valid,
  highlights = [record({ authorName: "독자A", authorMatched: true })],
  oneLineReviews = [record({ authorName: "독자B", authorMatched: true })],
  issues = [],
}: {
  valid: boolean;
  feedbackDocumentValid?: boolean;
  highlights?: SessionImportRecordPreview[];
  oneLineReviews?: SessionImportRecordPreview[];
  issues?: SessionImportPreviewResponse["issues"];
}): SessionImportPreviewResponse {
  return {
    valid,
    session: { sessionNumber: 7, bookTitle: "E2E 책", meetingDate: "2026-05-16" },
    publication: { summary: "공개 가능한 세션 요약입니다." },
    highlights,
    oneLineReviews,
    feedbackDocument: {
      fileName: "session-7-feedback.md",
      title: "독서모임 7차 피드백",
      valid: feedbackDocumentValid,
    },
    issues,
  };
}

function record({
  authorName,
  authorMatched,
}: {
  authorName: string;
  authorMatched: boolean;
}): SessionImportRecordPreview {
  return {
    authorName,
    text: `${authorName} 기록`,
    authorMatched,
    membershipId: authorMatched ? `membership-${authorName}` : null,
  };
}
