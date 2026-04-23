import { describe, expect, it } from "vitest";
import {
  buildQuestionPayload,
  countWrittenQuestions,
  createAddedQuestionInput,
  getAddQuestionValidationMessage,
  getQuestionPayloadValidationMessage,
  getRemoveQuestionValidationMessage,
  MAX_QUESTION_INPUT_COUNT,
  MIN_QUESTION_INPUT_COUNT,
  normalizeInitialQuestionInputs,
} from "@/features/current-session/model/current-session-form-model";
import {
  getBlockedWriteValidationMessage,
  getCurrentSessionAccessState,
  getCurrentSessionBoardTabs,
  getCurrentSessionFeedbackAccessState,
  getCurrentSessionMemberNotice,
  getCurrentSessionSaveStatusLabel,
} from "@/features/current-session/model/current-session-view-model";

describe("current session form model", () => {
  it("normalizes saved questions by priority, caps to max inputs, and pads to min inputs", () => {
    const savedQuestions = Array.from({ length: MAX_QUESTION_INPUT_COUNT + 1 }, (_, index) => ({
      priority: index + 1,
      text: `${index + 1}번째 질문`,
    })).reverse();

    expect(
      normalizeInitialQuestionInputs(savedQuestions),
    ).toEqual(
      Array.from({ length: MAX_QUESTION_INPUT_COUNT }, (_, index) => ({
        clientId: `saved-${index + 1}`,
        text: `${index + 1}번째 질문`,
      })),
    );

    const savedPriority = Math.max(1, MAX_QUESTION_INPUT_COUNT - 1);
    expect(normalizeInitialQuestionInputs([{ priority: savedPriority, text: "저장된 질문" }])).toEqual([
      { clientId: `saved-${savedPriority}`, text: "저장된 질문" },
      ...Array.from({ length: MIN_QUESTION_INPUT_COUNT - 1 }, (_, index) => ({
        clientId: `empty-${index + 2}`,
        text: "",
      })),
    ]);
  });

  it("counts written questions and creates deterministic added input ids when a timestamp is provided", () => {
    const inputs = [
      { clientId: "saved-1", text: "  첫 질문  " },
      { clientId: "saved-2", text: "   " },
      { clientId: "saved-3", text: "셋째 질문" },
    ];

    expect(countWrittenQuestions(inputs)).toBe(2);
    expect(createAddedQuestionInput(inputs.length, 123456)).toEqual({ clientId: "added-123456-3", text: "" });
  });

  it("builds trimmed save payloads and returns the existing validation messages", () => {
    const payload = buildQuestionPayload([
      { clientId: "q1", text: "  첫 질문  " },
      { clientId: "q2", text: "" },
      { clientId: "q3", text: "  둘째 질문\n" },
    ]);

    expect(payload).toEqual([{ text: "첫 질문" }, { text: "둘째 질문" }]);
    expect(getQuestionPayloadValidationMessage(payload)).toBe("");
    const tooFewQuestions = Array.from({ length: MIN_QUESTION_INPUT_COUNT - 1 }, (_, index) => ({
      text: `질문 ${index + 1}`,
    }));
    expect(getQuestionPayloadValidationMessage(tooFewQuestions)).toBe(
      `질문은 최소 ${MIN_QUESTION_INPUT_COUNT}개 작성해 주세요.`,
    );
  });

  it("returns min and max question input validation messages", () => {
    const minimumInputs = Array.from({ length: MIN_QUESTION_INPUT_COUNT }, (_, index) => ({
      clientId: `q${index + 1}`,
      text: `질문 ${index + 1}`,
    }));
    const maximumInputs = Array.from({ length: MAX_QUESTION_INPUT_COUNT }, (_, index) => ({
      clientId: `q${index + 1}`,
      text: `질문 ${index + 1}`,
    }));

    expect(getRemoveQuestionValidationMessage(minimumInputs)).toBe(
      `질문 입력칸은 최소 ${MIN_QUESTION_INPUT_COUNT}개가 필요해요.`,
    );
    expect(getAddQuestionValidationMessage(maximumInputs)).toBe(
      `최대 ${MAX_QUESTION_INPUT_COUNT}개까지 작성할 수 있어요.`,
    );
  });
});

describe("current session view model", () => {
  it("derives write access and member role flags from auth state", () => {
    expect(getCurrentSessionAccessState()).toEqual({
      isViewer: false,
      isSuspended: false,
      isHost: false,
      canWrite: true,
    });
    expect(
      getCurrentSessionAccessState({
        membershipStatus: "ACTIVE",
        approvalState: "ACTIVE",
        role: "HOST",
      }),
    ).toEqual({
      isViewer: false,
      isSuspended: false,
      isHost: true,
      canWrite: true,
    });
    expect(
      getCurrentSessionAccessState({
        membershipStatus: "VIEWER",
        approvalState: "VIEWER",
        role: "MEMBER",
      }),
    ).toMatchObject({ isViewer: true, isSuspended: false, isHost: false, canWrite: false });
    expect(
      getCurrentSessionAccessState({
        membershipStatus: "SUSPENDED",
        approvalState: "SUSPENDED",
        role: "MEMBER",
      }),
    ).toMatchObject({ isViewer: false, isSuspended: true, isHost: false, canWrite: false });
  });

  it("selects viewer and suspended notices without changing existing Korean copy", () => {
    expect(getBlockedWriteValidationMessage({ isViewer: true })).toBe(
      "둘러보기 멤버입니다. 정식 멤버가 되면 RSVP와 질문 작성이 열립니다.",
    );
    expect(getBlockedWriteValidationMessage({ isViewer: false })).toBe("");
    expect(getCurrentSessionMemberNotice({ isViewer: false, isSuspended: true })).toEqual({
      kind: "suspended",
      message: "멤버십이 일시 정지되어 새 활동을 저장할 수 없습니다.",
    });
    expect(getCurrentSessionMemberNotice({ isViewer: true, isSuspended: false })).toEqual({
      kind: "viewer",
      message: "정식 멤버가 되면 참여와 작성이 열립니다.",
    });
    expect(getCurrentSessionMemberNotice({ isViewer: false, isSuspended: false })).toBeNull();
  });

  it("derives board tab labels and feedback access state", () => {
    expect(
      getCurrentSessionBoardTabs({
        questions: [{ id: 1 }, { id: 2 }],
        oneLineReviews: [{ id: 1 }],
        highlights: [],
      }),
    ).toEqual([
      { key: "questions", label: "질문 · 2", count: 2 },
      { key: "oneLineReviews", label: "한줄평 · 1", count: 1 },
      { key: "highlights", label: "하이라이트 · 0", count: 0 },
    ]);

    expect(getCurrentSessionFeedbackAccessState(true)).toEqual({
      className: "rm-locked-state",
      title: "정식 멤버에게 열립니다",
      body: "둘러보기 멤버는 현재 세션 내용은 읽을 수 있지만, 참석자 피드백 문서와 작성 기능은 제한됩니다.",
      canOpenArchive: false,
    });
    expect(getCurrentSessionFeedbackAccessState(false)).toEqual({
      className: "surface-quiet",
      title: "참석한 세션의 피드백 문서를 보존합니다",
      body: "이번 세션 피드백은 모임 이후 호스트가 업로드하면 참석자 기준으로 열립니다.",
      canOpenArchive: true,
    });
  });

  it("returns reusable save status labels", () => {
    expect(getCurrentSessionSaveStatusLabel("rsvp", "idle")).toBe("");
    expect(getCurrentSessionSaveStatusLabel("checkin", "saving")).toBe("체크인 변경사항을 저장하는 중");
    expect(getCurrentSessionSaveStatusLabel("question", "saved")).toBe("질문 저장됨");
    expect(getCurrentSessionSaveStatusLabel("longReview", "error")).toBe("서평 저장 실패 · 다시 시도해 주세요");
    expect(getCurrentSessionSaveStatusLabel("oneLineReview", "saved")).toBe("한줄평 저장됨");
  });
});
