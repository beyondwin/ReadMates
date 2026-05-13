import type { BoardLongReview, BoardQuestion, CurrentSession } from "@/features/current-session/ui/current-session-types";
import { AvatarChip } from "@/shared/ui/avatar-chip";

export function MobileBoardSegment({ session }: { session: CurrentSession }) {
  return (
    <>
      <section className="m-sec">
        <div className="m-eyebrow-row">
          <span className="eyebrow">질문</span>
          <span className="tiny mono" style={{ color: "var(--text-3)" }}>
            {session.board.questions.length}개
          </span>
        </div>
        <MobileQuestionList questions={session.board.questions} />
      </section>

      <section className="m-sec">
        <div className="m-eyebrow-row">
          <span className="eyebrow">서평</span>
          <span className="tiny mono" style={{ color: "var(--text-3)" }}>
            {session.board.longReviews.length}개
          </span>
        </div>
        <MobileLongReviewList longReviews={session.board.longReviews} />
      </section>
    </>
  );
}

function MobileQuestionList({ questions }: { questions: BoardQuestion[] }) {
  if (questions.length === 0) {
    return <MobileEmptyBoardState />;
  }

  return (
    <div className="rm-current-session-mobile__card-stack">
      {questions.map((question) => (
        <article key={`${question.priority}-${question.authorName}-${question.text}`} className="m-card">
          <div className="m-row-between" style={{ alignItems: "flex-start", marginBottom: 10 }}>
            <div className="m-row" style={{ gap: 10 }}>
              <AvatarChip name={question.authorName} fallbackInitial={question.authorShortName} label={question.authorName} size={24} />
              <span className="body" style={{ fontSize: 14, fontWeight: 500 }}>
                {question.authorName}
              </span>
            </div>
            <span className="badge badge-accent">Q{question.priority}</span>
          </div>
          <div className="body editorial rm-current-session-mobile__board-text">{question.text}</div>
          {question.draftThought ? (
            <div className="rm-current-session-mobile__draft">
              <span className="tiny" style={{ color: "var(--text-3)" }}>
                {question.draftThought}
              </span>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function MobileLongReviewList({ longReviews }: { longReviews: BoardLongReview[] }) {
  if (longReviews.length === 0) {
    return <MobileEmptyBoardState />;
  }

  return (
    <div className="rm-current-session-mobile__card-stack">
      {longReviews.map((review) => (
        <article key={`${review.authorName}-${review.body}`} className="m-card">
          <div className="body editorial rm-current-session-mobile__board-text">{review.body}</div>
          <div className="m-row" style={{ gap: 8, marginTop: 10, color: "var(--text-3)" }}>
            <AvatarChip name={review.authorName} fallbackInitial={review.authorShortName} label={review.authorName} size={24} />
            <span className="tiny">{review.authorName}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function MobileEmptyBoardState() {
  return (
    <div className="m-card-quiet">
      <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
        아직 공유된 기록이 없습니다.
      </p>
    </div>
  );
}
