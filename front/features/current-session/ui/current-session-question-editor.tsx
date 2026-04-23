import { type CSSProperties } from "react";
import { SaveFeedback } from "@/features/current-session/ui/current-session-primitives";
import type { SaveState } from "@/features/current-session/ui/current-session-types";
import {
  MAX_QUESTION_INPUT_COUNT,
  canAddQuestionInput,
  canRemoveQuestionInput,
} from "@/features/current-session/model/current-session-form-model";

export type QuestionInput = {
  clientId: string;
  text: string;
};

export function QuestionEditor({
  variant,
  questionInputs,
  writtenQuestionCount,
  validationMessage,
  saveStatus,
  onChangeQuestion,
  onAddQuestion,
  onRemoveQuestion,
  onSaveQuestions,
}: {
  variant: "desktop" | "mobile";
  questionInputs: QuestionInput[];
  writtenQuestionCount: number;
  validationMessage: string;
  saveStatus: SaveState;
  onChangeQuestion: (index: number, value: string) => void;
  onAddQuestion: () => void;
  onRemoveQuestion: (index: number) => void;
  onSaveQuestions: () => void;
}) {
  const isMobile = variant === "mobile";
  const canAddQuestion = canAddQuestionInput(questionInputs);
  const canRemoveQuestion = canRemoveQuestionInput(questionInputs);
  const textareaClassName = isMobile ? "m-textarea" : "textarea";
  const inputStyle = isMobile ? undefined : { fontSize: "15px", lineHeight: 1.6, letterSpacing: 0 };
  const questionList = (
    <>
      <div className="stack" style={{ "--stack": isMobile ? "10px" : "12px" } as CSSProperties}>
        {questionInputs.map((input, index) => {
          const questionId = `${variant}-question-${index + 1}`;
          const isEmpty = !input.text.trim();

          return (
            <div
              key={input.clientId}
              style={{
                border: "1px solid var(--line-soft)",
                borderStyle: isEmpty ? "dashed" : "solid",
                borderRadius: "8px",
                padding: isMobile ? "10px" : "12px",
                background: isMobile ? "var(--bg-raised)" : "var(--bg)",
              }}
            >
              <div className="row-between" style={{ alignItems: "center", marginBottom: 8, gap: "10px" }}>
                <label className="label" htmlFor={questionId} style={{ marginBottom: 0 }}>
                  질문 {index + 1}
                </label>
                {canRemoveQuestion ? (
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    aria-label={`질문 ${index + 1} 삭제`}
                    onClick={() => onRemoveQuestion(index)}
                  >
                    삭제
                  </button>
                ) : null}
              </div>
              <textarea
                id={questionId}
                aria-label={`질문 ${index + 1} 내용`}
                className={textareaClassName}
                rows={isMobile ? 2 : 3}
                value={input.text}
                onChange={(event) => onChangeQuestion(index, event.target.value)}
                placeholder="모임에서 나누고 싶은 질문을 적어 주세요."
                style={inputStyle}
              />
            </div>
          );
        })}
      </div>

      <div className={isMobile ? "rm-current-session-mobile__save-row" : "row-between"} style={{ marginTop: isMobile ? 14 : 16 }}>
        <span className={isMobile ? "tiny" : "small"} style={{ color: validationMessage ? "var(--danger)" : "var(--text-3)" }}>
          {validationMessage || "저장하면 공동 보드에 반영돼요"}
        </span>
        <div className={isMobile ? "m-row" : "row"} style={{ gap: "10px", justifyContent: "flex-end" }}>
          <SaveFeedback scope="question" status={saveStatus} />
          {canAddQuestion ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onAddQuestion}>
              + 질문 추가
            </button>
          ) : (
            <span className="badge">최대 {MAX_QUESTION_INPUT_COUNT}개까지 작성했어요</span>
          )}
          <button type="button" className="btn btn-primary btn-sm" disabled={saveStatus === "saving"} onClick={onSaveQuestions}>
            질문 저장
          </button>
        </div>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <section className="m-sec">
        <div className="m-eyebrow-row">
          <span className="eyebrow">질문 작성</span>
          <span className="tiny mono" style={{ color: "var(--text-3)" }}>
            {writtenQuestionCount}/{MAX_QUESTION_INPUT_COUNT}
          </span>
        </div>
        <div className="m-card">{questionList}</div>
      </section>
    );
  }

  return (
    <section className="surface" style={{ padding: "28px" }}>
      <div className="row-between" style={{ alignItems: "flex-start", marginBottom: "16px", gap: "16px" }}>
        <div>
          <div className="eyebrow">질문 작성</div>
          <div className="h4 editorial" style={{ marginTop: "6px" }}>
            이번 달 내 질문
          </div>
          <p className="small" style={{ color: "var(--text-3)", margin: "6px 0 0" }}>
            최대 {MAX_QUESTION_INPUT_COUNT}개까지 준비해 주세요.
          </p>
        </div>
        <span className="tiny mono" style={{ color: "var(--text-3)" }}>
          내 질문 {writtenQuestionCount}/{MAX_QUESTION_INPUT_COUNT}
        </span>
      </div>
      {questionList}
    </section>
  );
}
