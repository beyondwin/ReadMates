import { Link } from "@/features/public/ui/public-link";
import { publicRecordsReturnTarget, type ReadmatesReturnTarget } from "@/features/public/ui/public-route-continuity";
import type { PublicSessionDetailView } from "@/features/public/model/public-display-model";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { BookCover } from "@/shared/ui/book-cover";
import { PublicGuestOnlyActions, PublicInviteGuidance } from "@/shared/ui/public-auth-action";
import { displayText, getPublicSessionDetailDisplay } from "@/features/public/model/public-display-model";
import { PUBLIC_MEMBERSHIP_NOTE } from "@/features/public/model/public-copy";

type PublicSessionProps = {
  session: PublicSessionDetailView;
  returnTarget?: ReadmatesReturnTarget;
};

export default function PublicSession({ session, returnTarget = publicRecordsReturnTarget }: PublicSessionProps) {
  const { bookTitle, bookAuthor, dateLabel, summary } = getPublicSessionDetailDisplay(session);

  return (
    <main className="page-frame public-session-record">
      <section className="page-header public-session-record__header">
        <div className="container container-sm">
          <Link to={returnTarget.href} className="desktop-only btn btn-quiet btn-sm" style={{ marginLeft: "-10px", marginBottom: 16 }}>
            ← {returnTarget.label}
          </Link>
          <div className="public-session-record__identity">
            <BookCover title={bookTitle} author={bookAuthor} imageUrl={session.bookImageUrl} width={142} />
            <div>
              <div className="eyebrow" style={{ marginBottom: 14 }}>
                공개 기록 · No.{session.sessionNumber} · {dateLabel}
              </div>
              <h1 className="h1 editorial" style={{ margin: 0 }}>
                {bookTitle}
              </h1>
              <div className="small" style={{ marginTop: 10 }}>
                {bookAuthor} · {session.sessionNumber}번째 모임
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="public-section">
        <div className="container container-sm">
          <article className="rm-document-panel public-session-document">
            <header className="public-document-head">
              <div>
                <div className="eyebrow">발행 요약</div>
                <h2 className="h2 editorial" style={{ margin: "8px 0 0" }}>
                  공개된 세션 기록
                </h2>
              </div>
              <dl className="public-session-meta" aria-label="공개 세션 메타데이터">
                <div>
                  <dt>하이라이트</dt>
                  <dd>{session.highlights.length}</dd>
                </div>
                <div>
                  <dt>한줄평</dt>
                  <dd>{session.oneLiners.length}</dd>
                </div>
              </dl>
            </header>
            <p className="public-session-summary-text editorial">{summary}</p>
          </article>
        </div>
      </section>

      <section className="public-section public-section--subtle">
        <div className="container container-sm">
          <div className="public-section-head">
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                하이라이트
              </div>
              <h2 className="h2 editorial" style={{ margin: 0 }}>
                남은 문장들
              </h2>
            </div>
          </div>
          {session.highlights.length > 0 ? (
            <div className="public-record-list">
              {session.highlights.map((highlight, index) => (
                <div className="rm-record-row public-highlight-row" key={`${index}-${highlight}`}>
                  <span className="mono tiny">H{String(index + 1).padStart(2, "0")}</span>
                  <blockquote className="quote editorial">{displayText(highlight, "공개 하이라이트가 준비 중입니다.")}</blockquote>
                </div>
              ))}
            </div>
          ) : (
            <div className="rm-empty-state public-empty-record">
              <div className="eyebrow">하이라이트</div>
              <div className="h3 editorial" style={{ marginTop: 10 }}>
                공개된 하이라이트가 없습니다
              </div>
              <p className="body" style={{ margin: "12px 0 0" }}>
                이번 기록은 요약 중심으로 발행되었습니다. 공개 가능한 문장이 정리되면 이 영역에 보관됩니다.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="public-section">
        <div className="container container-sm">
          <div className="public-section-head">
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                한줄평
              </div>
              <h2 className="h2 editorial" style={{ margin: 0 }}>
                참석자가 남긴 짧은 기록
              </h2>
            </div>
          </div>
          {session.oneLiners.length > 0 ? (
            <div className="public-one-liner-list">
              {session.oneLiners.map((oneLiner, index) => {
                const authorName = displayText(oneLiner.authorName, "익명");
                const authorShortName = displayText(oneLiner.authorShortName, authorName);
                const text = displayText(oneLiner.text, "공개 한줄평이 준비 중입니다.");

                return (
                  <article className="rm-record-row public-one-liner-row" key={`${index}-${oneLiner.authorName}-${oneLiner.text}`}>
                    <span className="mono tiny">R{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <p className="body editorial" style={{ margin: 0 }}>
                        {text}
                      </p>
                      <div className="row" style={{ marginTop: 12, gap: 8 }}>
                        <AvatarChip name={authorName} fallbackInitial={authorShortName} label={authorName} size={22} />
                        <span className="tiny">{authorName}</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rm-empty-state public-empty-record">
              <div className="eyebrow">한줄평</div>
              <div className="h3 editorial" style={{ marginTop: 10 }}>
                공개된 한줄평이 없습니다
              </div>
              <p className="body" style={{ margin: "12px 0 0" }}>
                참석자 전용 기록과 공개 기록의 경계를 지키기 위해 발행된 한줄평만 보여줍니다.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="public-section public-section--subtle">
        <div className="container container-sm">
          <div className="rm-document-panel public-membership-panel">
            <div className="eyebrow" style={{ marginBottom: 12 }}>
              함께 읽기
            </div>
            <div className="h3 editorial">기록은 누구나 읽고, 참여는 초대받은 멤버가 합니다</div>
            <p className="body" style={{ color: "var(--text-2)", marginTop: 12, maxWidth: 520 }}>
              {PUBLIC_MEMBERSHIP_NOTE}
            </p>
            <div className="public-membership-panel__actions">
              <PublicGuestOnlyActions>
                <Link to="/login" className="btn btn-primary">
                  기존 멤버 로그인
                </Link>
                <PublicInviteGuidance />
              </PublicGuestOnlyActions>
              <Link to={returnTarget.href} className="btn btn-quiet">
                {returnTarget.label}
              </Link>
            </div>
            <p className="tiny" style={{ margin: "14px 0 0", color: "var(--text-3)" }}>
              기존 멤버는 로그인으로 들어가고, 새 멤버는 호스트가 보낸 초대 링크에서 수락 절차를 시작합니다.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
