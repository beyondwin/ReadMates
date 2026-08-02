import { SaveFeedback } from "@/features/current-session/ui/current-session-primitives";
import type { SaveState } from "@/features/current-session/ui/current-session-types";
import { getCurrentSessionFeedbackAccessState } from "@/features/current-session/model/current-session-view-model";

export function MobileRecordsSegment({
  longReview,
  onLongReviewChange,
  oneLineReview,
  onOneLineReviewChange,
  longReviewSaveStatus,
  oneLineReviewSaveStatus,
  onSaveLongReview,
  onSaveOneLineReview,
  isViewer,
  isSuspended,
  canWrite,
  canReadFeedback,
}: {
  longReview: string;
  onLongReviewChange: (value: string) => void;
  oneLineReview: string;
  onOneLineReviewChange: (value: string) => void;
  longReviewSaveStatus: SaveState;
  oneLineReviewSaveStatus: SaveState;
  onSaveLongReview: () => void;
  onSaveOneLineReview: () => void;
  isViewer: boolean;
  isSuspended: boolean;
  canWrite: boolean;
  canReadFeedback: boolean;
}) {
  const feedbackAccess = getCurrentSessionFeedbackAccessState({ isViewer, isSuspended });

  return (
    <>
      <section className="m-sec">
        <div className="m-card">
          <div className="m-row-between" style={{ alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div className="eyebrow">한줄평</div>
              <div className="h4 editorial" style={{ marginTop: 4 }}>
                이 책을 한 문장으로
              </div>
            </div>
            <span className="badge">언제든</span>
          </div>
          <label className="label" htmlFor="mobile-one-line-review">
            한줄평 내용
          </label>
          <p className="tiny" style={{ color: "var(--text-3)", margin: "0 0 8px" }}>
            세션 참여자에게 보이는 한 문장입니다.
          </p>
          <input
            id="mobile-one-line-review"
            className="m-input"
            value={oneLineReview}
            disabled={!canWrite}
            onChange={(event) => onOneLineReviewChange(event.target.value)}
            placeholder="예: 떠난 자리에 남은 온기를 만지는 책."
          />
          <div className="rm-current-session-mobile__save-row">
            <span className="tiny" style={{ color: "var(--text-3)" }}>
              세션 참여자 공개
            </span>
            <div className="m-row" style={{ gap: 10, justifyContent: "flex-end" }}>
              <SaveFeedback scope="oneLineReview" status={oneLineReviewSaveStatus} />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!canWrite || oneLineReviewSaveStatus === "saving"}
                aria-disabled={!canWrite || oneLineReviewSaveStatus === "saving"}
                onClick={onSaveOneLineReview}
              >
                한줄평 저장
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="m-sec">
        <div className="m-card">
          <div className="m-row-between" style={{ alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div className="eyebrow">서평</div>
              <div className="h4 editorial" style={{ marginTop: 4 }}>
                이 책에 남기고 싶은 글
              </div>
            </div>
            <span className="badge">언제든</span>
          </div>
          <label className="label rm-sr-only" htmlFor="mobile-long-review">
            서평 내용
          </label>
          <p className="small" style={{ color: "var(--text-3)", margin: "0 0 8px" }}>
            모임 전후로 떠오른 생각을 자유롭게 남겨 주세요.
          </p>
          <textarea
            id="mobile-long-review"
            className="m-textarea"
            rows={5}
            value={longReview}
            disabled={!canWrite}
            onChange={(event) => onLongReviewChange(event.target.value)}
            placeholder="완독 후, 모임 이후, 시간이 지난 뒤에 떠오른 문장을 적어 주세요."
          />
          <div className="rm-current-session-mobile__save-row" style={{ justifyContent: "flex-end" }}>
            <div className="m-row" style={{ gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <span className="tiny" style={{ color: "var(--text-3)", flex: "1 1 180px" }}>
                작성한 글은 게스트에게도 공개돼요.
              </span>
              <SaveFeedback scope="longReview" status={longReviewSaveStatus} />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!canWrite || longReviewSaveStatus === "saving"}
                aria-disabled={!canWrite || longReviewSaveStatus === "saving"}
                onClick={onSaveLongReview}
              >
                서평 저장
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="m-sec">
        <div className={canReadFeedback ? "m-card-quiet" : "m-card-quiet rm-locked-state"} role="note">
          <div className="eyebrow">피드백 문서 접근</div>
          <p className="small" style={{ color: "var(--text-2)", margin: "6px 0 0" }}>
            {canReadFeedback ? "세션 후 호스트가 피드백 문서를 업로드하면 active 정식 멤버에게 열립니다." : feedbackAccess.body}
          </p>
        </div>
      </section>
    </>
  );
}
