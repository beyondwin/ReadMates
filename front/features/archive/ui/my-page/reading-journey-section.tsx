import type { ArchiveQuestionItem, ArchiveReviewItem } from "@/features/archive/model/archive-model";
import { formatSessionMonthDayLabel, sessionNo } from "@/features/archive/model/archive-model";
import { groupHistoryByBook, mergeActivityTimeline } from "@/features/archive/model/reading-journey-model";
import { Link } from "@/features/archive/ui/archive-link";

const TIMELINE_LIMIT = 8;

export function ReadingJourneySection({
  questions,
  reviews,
}: {
  questions: ArchiveQuestionItem[];
  reviews: ArchiveReviewItem[];
}) {
  const books = groupHistoryByBook(questions, reviews);
  const timeline = mergeActivityTimeline(questions, reviews).slice(0, TIMELINE_LIMIT);

  return (
    <section>
      <div className="row-between" style={{ alignItems: "flex-end", marginBottom: "16px" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: "8px" }}>
            함께 읽어온 길
          </div>
          <h2 className="h2" style={{ margin: 0 }}>
            독서 여정
          </h2>
        </div>
      </div>

      {books.length === 0 ? (
        <div className="surface-quiet" style={{ padding: "16px 18px" }}>
          <p className="small" style={{ color: "var(--text-2)", margin: 0, wordBreak: "keep-all" }}>
            아직 남긴 독서 기록이 없어요. 질문이나 서평을 남기면 이곳에 책별로 모입니다.
          </p>
        </div>
      ) : (
        <div className="surface" style={{ padding: "22px" }}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "10px" }}>
            {books.map((book) => (
              <li key={book.sessionId}>
                <Link
                  to={`/app/sessions/${encodeURIComponent(book.sessionId)}`}
                  className="row-between"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 14px",
                    background: "var(--bg-sub)",
                    borderRadius: "var(--r-2)",
                    color: "inherit",
                    textDecoration: "none",
                  }}
                >
                  <span className="small" style={{ minWidth: 0, wordBreak: "keep-all" }}>
                    <span className="tiny mono" style={{ color: "var(--text-3)", marginRight: "6px" }}>
                      {sessionNo(book.sessionNumber)}
                    </span>
                    {book.bookTitle}
                  </span>
                  <span className="tiny mono" style={{ color: "var(--text-3)", flexShrink: 0 }}>
                    질문 {book.questionCount} · 서평 {book.reviewCount}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {timeline.length > 0 ? (
            <>
              <div className="tiny" style={{ color: "var(--text-3)", margin: "20px 0 8px" }}>
                최근 활동
              </div>
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "6px" }}>
                {timeline.map((item, index) => (
                  <li
                    key={`${item.sessionId}-${item.kind}-${index}`}
                    className="tiny"
                    style={{ color: "var(--text-2)", wordBreak: "keep-all" }}
                  >
                    <span className="mono" style={{ color: "var(--text-3)" }}>
                      {formatSessionMonthDayLabel(item.date)}
                    </span>{" "}
                    · {item.kind === "QUESTION" ? "질문" : "서평"} · {item.bookTitle}
                  </li>
                ))}
              </ol>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
