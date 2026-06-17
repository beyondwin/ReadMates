import { SaveFeedback } from "@/features/current-session/ui/current-session-primitives";
import type { SaveState } from "@/features/current-session/ui/current-session-types";
import { getCurrentSessionFeedbackAccessState } from "@/features/current-session/model/current-session-view-model";

export function MobileRecordsSegment({
  longReview,
  onLongReviewChange,
  longReviewSaveStatus,
  onSaveLongReview,
  isSuspended,
  canWrite,
}: {
  longReview: string;
  onLongReviewChange: (value: string) => void;
  longReviewSaveStatus: SaveState;
  onSaveLongReview: () => void;
  isSuspended: boolean;
  canWrite: boolean;
}) {
  const feedbackAccess = getCurrentSessionFeedbackAccessState({ isViewer: false, isSuspended });

  return (
    <>
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
          <p className="tiny" style={{ color: "var(--text-3)", margin: "0 0 8px" }}>
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
            <div className="m-row" style={{ gap: 10, justifyContent: "flex-end" }}>
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
        <div className={canWrite ? "m-card-quiet" : "m-card-quiet rm-locked-state"} role="note">
          <div className="eyebrow">피드백 문서 접근</div>
          <p className="small" style={{ color: "var(--text-2)", margin: "6px 0 0" }}>
            {canWrite ? "세션 후 호스트가 피드백 문서를 업로드하면 active 정식 멤버에게 열립니다." : feedbackAccess.body}
          </p>
        </div>
      </section>
    </>
  );
}

export function MobileViewerRecordsSegment({ longReview, oneLineReview }: { longReview: string; oneLineReview: string }) {
  return (
    <>
      <section className="m-sec">
        <div className="m-card">
          <div className="eyebrow">보존된 서평</div>
          <div className="h4 editorial" style={{ marginTop: 6 }}>
            내 기록은 읽기 전용입니다
          </div>
          <p className="small" style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
            정식 멤버가 되면 한줄평과 서평을 새로 저장할 수 있습니다.
          </p>
        </div>
      </section>

      <section className="m-sec">
        <div className="m-card-quiet">
          <div className="eyebrow">한줄평</div>
          <p className="small editorial" style={{ color: "var(--text)", margin: "8px 0 0", whiteSpace: "pre-wrap" }}>
            {oneLineReview.trim() || "아직 남긴 한줄평이 없습니다."}
          </p>
        </div>
      </section>

      <section className="m-sec">
        <div className="m-card-quiet">
          <div className="eyebrow">서평</div>
          <p className="small editorial" style={{ color: "var(--text)", margin: "8px 0 0", whiteSpace: "pre-wrap" }}>
            {longReview.trim() || "아직 남긴 서평이 없습니다."}
          </p>
        </div>
      </section>

      <section className="m-sec">
        <div className="m-card-quiet rm-locked-state" role="note">
          <div className="eyebrow">피드백 문서 접근</div>
          <p className="small" style={{ color: "var(--text-2)", margin: "6px 0 0" }}>
            피드백 문서는 active 정식 멤버에게 열립니다. 둘러보기 상태에서는 문서 등록 여부와 접근 제한만 확인할 수 있어요.
          </p>
        </div>
      </section>
    </>
  );
}
