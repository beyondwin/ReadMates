import { Link } from "@/src/app/router-link";
import type { PublicSessionDetailResponse } from "@/shared/api/readmates";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { BookCover } from "@/shared/ui/book-cover";
import { displayText, formatDateLabel } from "@/shared/ui/readmates-display";
import { PUBLIC_MEMBERSHIP_NOTE } from "./public-club-copy";

type PublicSessionProps = {
  session: PublicSessionDetailResponse;
};

export default function PublicSession({ session }: PublicSessionProps) {
  const bookTitle = displayText(session.bookTitle, "도서 제목 미정");
  const bookAuthor = displayText(session.bookAuthor, "저자 미상");
  const dateLabel = formatDateLabel(session.date);
  const summary = displayText(session.summary, "공개 요약이 아직 준비되지 않았습니다.");

  return (
    <main className="page-frame">
      <section className="page-header">
        <div className="container container-sm">
          <Link to="/about" className="btn btn-quiet btn-sm" style={{ marginLeft: "-10px", marginBottom: "16px" }}>
            ← 클럽으로
          </Link>
          <div className="eyebrow" style={{ marginBottom: "14px" }}>
            공개 기록 · No.{session.sessionNumber} · {dateLabel}
          </div>
          <h1 className="h1 editorial" style={{ margin: 0 }}>
            {bookTitle}
          </h1>
          <div className="small" style={{ marginTop: "10px" }}>
            {bookAuthor} · {session.sessionNumber}번째 모임
          </div>
        </div>
      </section>

      <section style={{ padding: "56px 0" }}>
        <div className="container container-sm public-session-summary">
          <BookCover title={bookTitle} author={bookAuthor} imageUrl={session.bookImageUrl} width={160} />
          <div>
            <div className="eyebrow" style={{ marginBottom: "10px" }}>
              공개 요약
            </div>
            <p className="body-lg" style={{ color: "var(--text)", marginTop: 0, maxWidth: "560px", lineHeight: 1.7 }}>
              {summary}
            </p>
            <div className="rule" style={{ marginTop: "24px" }}>
              <span>
                하이라이트 {session.highlights.length} · 한줄평 {session.oneLiners.length}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: "40px 0 20px" }}>
        <div className="container container-sm">
          <div className="eyebrow" style={{ marginBottom: "8px" }}>
            하이라이트
          </div>
          <h2 className="h2 editorial" style={{ margin: 0 }}>
            남은 문장들
          </h2>
          {session.highlights.length > 0 ? (
            <div className="public-stack" style={{ marginTop: "20px", gap: 0 }}>
              {session.highlights.map((highlight, index) => (
                <div
                  key={`${index}-${highlight}`}
                  style={{ padding: "26px 0", borderTop: "1px solid var(--line-soft)" }}
                >
                  <div className="quote editorial" style={{ fontSize: "20px", lineHeight: 1.5 }}>
                    {displayText(highlight, "공개 하이라이트가 준비 중입니다.")}
                  </div>
                  <div className="row" style={{ marginTop: "14px", gap: "10px", color: "var(--text-3)" }}>
                    <span className="small mono">하이라이트 {String(index + 1).padStart(2, "0")}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="surface" style={{ padding: "20px", marginTop: "20px" }}>
              공개된 하이라이트가 없습니다.
            </div>
          )}
        </div>
      </section>

      <section style={{ padding: "40px 0 80px" }}>
        <div className="container container-sm">
          <div className="eyebrow" style={{ marginBottom: "8px" }}>
            한줄평
          </div>
          <h2 className="h2 editorial" style={{ margin: 0 }}>
            공개 한줄평
          </h2>
          {session.oneLiners.length > 0 ? (
            <div className="public-grid-2" style={{ marginTop: "20px" }}>
              {session.oneLiners.map((oneLiner, index) => {
                const authorName = displayText(oneLiner.authorName, "익명");
                const authorShortName = displayText(oneLiner.authorShortName, authorName);
                const text = displayText(oneLiner.text, "공개 한줄평이 준비 중입니다.");

                return (
                  <div
                    key={`${index}-${oneLiner.authorName}-${oneLiner.text}`}
                    style={{
                      padding: "18px 20px",
                      background: "var(--bg-sub)",
                      borderRadius: "10px",
                      border: "1px solid var(--line-soft)",
                    }}
                  >
                    <div className="body editorial" style={{ fontSize: "16px" }}>
                      {text}
                    </div>
                    <div className="row" style={{ marginTop: "10px", gap: "8px" }}>
                      <AvatarChip name={authorName} fallbackInitial={authorShortName} label={authorName} size={22} />
                      <span className="tiny">{authorName}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="surface" style={{ padding: "20px", marginTop: "20px" }}>
              공개된 한줄평이 없습니다.
            </div>
          )}
        </div>
      </section>

      <section style={{ padding: "0 0 100px" }}>
        <div className="container container-sm surface" style={{ padding: "36px", textAlign: "center" }}>
          <div className="eyebrow" style={{ marginBottom: "12px" }}>
            함께 읽기
          </div>
          <div className="h3 editorial">함께 읽고 싶다면</div>
          <p
            className="body"
            style={{ color: "var(--text-2)", marginTop: "10px", maxWidth: "440px", marginInline: "auto" }}
          >
            {PUBLIC_MEMBERSHIP_NOTE}
          </p>
          <div className="row" style={{ justifyContent: "center", marginTop: "20px", gap: "10px", flexWrap: "wrap" }}>
            <Link to="/login" className="btn btn-primary">
              로그인 / 초대 수락
            </Link>
            <Link to="/about" className="btn btn-ghost">
              클럽으로 돌아가기
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
