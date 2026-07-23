import { describe, expect, it } from "vitest";
import {
  buildSessionImportCommitResult,
  buildSessionImportReview,
  buildSessionImportRequest,
  sessionImportCanCommit,
  sessionImportFailureMessage,
  sessionImportReplacementSummary,
  sessionImportReplacementWarning,
  summarizeAuthorMatches,
} from "./session-import-model";
import type { SessionImportPreviewResponse, SessionImportRecordPreview } from "./host-view-types";

describe("session import model", () => {
  it("wraps generated import json with the selected editor visibility", () => {
    const request = buildSessionImportRequest(
      JSON.stringify({
        format: "readmates-session-import:v1",
        session: { number: 7, bookTitle: "Example Book", meetingDate: "2026-05-14" },
        publication: { summary: "Summary" },
        highlights: [{ authorName: "Host", text: "Highlight" }],
        oneLineReviews: [{ authorName: "Host", text: "One line" }],
        feedbackDocument: { fileName: "session-7.md", markdown: "<!-- readmates-feedback:v1 -->" },
      }),
      "MEMBER",
    );

    expect(request.recordVisibility).toBe("MEMBER");
    expect(request.format).toBe("readmates-session-import:v1");
    expect(request.highlights).toHaveLength(1);
  });

  it("rejects malformed json and missing format before preview", () => {
    expect(() => buildSessionImportRequest("{", "PUBLIC")).toThrow("JSON");
    expect(() => buildSessionImportRequest("{}", "PUBLIC")).toThrow("readmates-session-import:v1");
  });

  it("allows commit only for valid previews with saveable visibility", () => {
    expect(sessionImportCanCommit(preview({ valid: true, issueCount: 0 }), "MEMBER")).toBe(true);
    expect(sessionImportCanCommit(preview({ valid: true, issueCount: 0 }), "PUBLIC")).toBe(true);
    expect(sessionImportCanCommit(preview({ valid: true, issueCount: 0 }), "HOST_ONLY")).toBe(false);
    expect(sessionImportCanCommit(preview({ valid: false, issueCount: 1 }), "MEMBER")).toBe(false);
  });

  it("describes the replacement scope in one warning", () => {
    expect(sessionImportReplacementWarning()).toContain("요약");
    expect(sessionImportReplacementWarning()).toContain("피드백 문서");
  });

  it("summarizes author matching across highlights and one-line reviews", () => {
    const summary = summarizeAuthorMatches([
      record({ authorName: "독자A", authorMatched: true }),
      record({ authorName: "독자B", authorMatched: false }),
      record({ authorName: "독자B", authorMatched: false }),
      record({ authorName: "독자C", authorMatched: true }),
    ]);

    expect(summary.totalCount).toBe(4);
    expect(summary.matchedCount).toBe(2);
    expect(summary.unmatchedCount).toBe(2);
    expect(summary.unmatchedAuthors).toEqual(["독자B"]);
  });

  it("builds a saveable review model from a valid preview", () => {
    const review = buildSessionImportReview(preview({ valid: true, issueCount: 0 }), "MEMBER");

    expect(review.canCommit).toBe(true);
    expect(review.statusLabel).toBe("저장 가능");
    expect(review.statusTone).toBe("success");
    expect(review.sessionLabel).toBe("7회차 · Example Book · 2026-05-14");
    expect(review.replacementItems).toEqual([
      "공개 요약 교체",
      "하이라이트 1개",
      "한줄평 1개",
      "독서모임 7차 피드백",
    ]);
    expect(review.authorSummary.unmatchedAuthors).toEqual([]);
    expect(review.authorStatusLabel).toBe("작성자 매칭 완료");
    expect(review.feedbackDocumentLabel).toBe("독서모임 7차 피드백");
    expect(review.feedbackDocumentStatusLabel).toBe("피드백 문서 구조 확인 완료");
    expect(review.blockingMessages).toEqual([]);
  });

  it("labels unmatched authors with review item copy", () => {
    const review = buildSessionImportReview(
      preview({
        valid: true,
        issueCount: 0,
        issues: [],
      }),
      "MEMBER",
    );

    const unmatchedReview = buildSessionImportReview(
      {
        ...preview({ valid: true, issueCount: 0 }),
        highlights: [record({ authorName: "독자A", authorMatched: false })],
        oneLineReviews: [record({ authorName: "독자B", authorMatched: true })],
      },
      "MEMBER",
    );

    expect(review.authorStatusLabel).toBe("작성자 매칭 완료");
    expect(unmatchedReview.authorStatusLabel).toBe("작성자 1개 확인 필요");
  });

  it("blocks review commit for HOST_ONLY visibility", () => {
    const review = buildSessionImportReview(preview({ valid: true, issueCount: 0 }), "HOST_ONLY");

    expect(review.canCommit).toBe(false);
    expect(review.statusLabel).toBe("확인 필요");
    expect(review.blockingMessages).toContain("기록 공개 범위를 MEMBER 또는 PUBLIC으로 바꾼 뒤 저장할 수 있습니다.");
  });

  it("surfaces invalid feedback document and server issues as blocking messages", () => {
    const review = buildSessionImportReview(
      preview({
        valid: false,
        issueCount: 1,
        feedbackDocumentValid: false,
        issues: [{ code: "ADMIN_ROUTE", message: "피드백 문서 heading을 확인해 주세요." }],
      }),
      "MEMBER",
    );

    expect(review.canCommit).toBe(false);
    expect(review.statusLabel).toBe("확인 필요");
    expect(review.statusTone).toBe("danger");
    expect(review.feedbackDocumentStatusLabel).toBe("피드백 문서 구조 확인 필요");
    expect(review.blockingMessages).toEqual([
      "피드백 문서 구조를 확인해 주세요.",
      "피드백 문서 heading을 확인해 주세요.",
    ]);
  });

  it("describes replacement items without exposing raw json", () => {
    expect(sessionImportReplacementSummary(preview({ valid: true, issueCount: 0 }))).toEqual([
      "공개 요약 교체",
      "하이라이트 1개",
      "한줄평 1개",
      "독서모임 7차 피드백",
    ]);
  });

  it("builds a commit result summary from committed import data", () => {
    const result = buildSessionImportCommitResult(
      {
        sessionId: "session-7",
        draftRevision: 5,
        baseLiveRevision: 3,
        liveApplied: false,
      },
      {
        ...preview({ valid: true, issueCount: 0 }),
        highlights: [record({ authorName: "독자A", authorMatched: true })],
        oneLineReviews: [
          record({ authorName: "독자B", authorMatched: true }),
          record({ authorName: "독자C", authorMatched: true }),
        ],
      },
      "MEMBER",
    );

    expect(result).toEqual({
      tone: "success",
      title: "초안 저장 완료",
      message: "가져온 세션 기록을 공유 초안으로 저장했습니다.",
      visibilityLabel: "멤버 공개",
      items: [
        "공개 요약 초안 교체",
        "하이라이트 1개 초안 저장",
        "한줄평 2개 초안 저장",
        "피드백 문서 초안 저장: 독서모임 7차 피드백",
      ],
      nextAction: "검토 후 변경사항을 반영하기 전까지 멤버와 공개 화면은 바뀌지 않습니다.",
    });
  });

  it("keeps commit result summary public safe", () => {
    const result = buildSessionImportCommitResult(
      {
        sessionId: "session-7",
        draftRevision: 5,
        baseLiveRevision: 3,
        liveApplied: false,
      },
      {
        ...preview({ valid: true, issueCount: 0 }),
        publication: { summary: "{\"raw\":\"PRIVATE_MEMBER_EMAIL\"}" },
        highlights: [],
        oneLineReviews: [],
        feedbackDocument: {
          fileName: "PRIVATE_MEMBER_EMAIL-session.md",
          title: "독서모임 7차 피드백",
          valid: true,
        },
      },
      "PUBLIC",
    );

    expect(result.items.join(" ")).not.toContain("PRIVATE_MEMBER_EMAIL");
    expect(result.items.join(" ")).not.toContain("{\"raw\"");
    expect(result.visibilityLabel).toBe("외부 공개");
  });

  it("classifies session import failure copy by stage", () => {
    expect(sessionImportFailureMessage("preview")).toBe("가져온 JSON에서 수정할 항목이 있습니다.");
    expect(sessionImportFailureMessage("commit-revalidation")).toBe(
      "저장 전 검증 상태가 바뀌었습니다. 미리보기를 다시 실행한 뒤 저장해 주세요.",
    );
    expect(sessionImportFailureMessage("commit-permission")).toBe(
      "가져온 세션 기록 저장에 실패했습니다. 현재 클럽과 호스트 권한을 확인해 주세요.",
    );
    expect(sessionImportFailureMessage("commit-network")).toBe(
      "가져온 세션 기록 저장에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
    );
    expect(sessionImportFailureMessage("refresh")).toBe(
      "저장은 완료되었을 수 있습니다. 세션 문서를 새로 불러와 저장 결과를 확인해 주세요.",
    );
  });
});

function preview({
  valid,
  issueCount,
  feedbackDocumentValid = valid,
  issues,
}: {
  valid: boolean;
  issueCount: number;
  feedbackDocumentValid?: boolean;
  issues?: SessionImportPreviewResponse["issues"];
}): SessionImportPreviewResponse {
  return {
    valid,
    session: { sessionNumber: 7, bookTitle: "Example Book", meetingDate: "2026-05-14" },
    publication: { summary: "Summary" },
    highlights: [record({ authorName: "독자A", authorMatched: true })],
    oneLineReviews: [record({ authorName: "독자B", authorMatched: true })],
    feedbackDocument: {
      fileName: "session-7.md",
      title: "독서모임 7차 피드백",
      valid: feedbackDocumentValid,
    },
    issues: issues ?? Array.from({ length: issueCount }, (_, index) => ({
      code: `ISSUE_${index}`,
      message: "Issue",
    })),
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
