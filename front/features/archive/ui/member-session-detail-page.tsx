import type { CSSProperties, ReactNode } from "react";
import type {
  MemberArchiveOneLinerItem,
  MemberArchiveQuestionItem,
  MemberArchiveSessionDetailResponse,
} from "@/features/archive/model/archive-model";
import {
  attendanceText,
  feedbackAccessCopy,
  feedbackBadgeClass,
  feedbackDocumentCardClassName,
  feedbackRailCardClassName,
  feedbackStatusText,
} from "@/features/archive/model/archive-model";
import { Link } from "@/features/archive/ui/archive-link";
import {
  appFeedbackHref,
  appSessionHref,
  archiveSessionsReturnTarget,
  readmatesReturnState,
  type ReadmatesReturnTarget,
} from "@/features/archive/ui/archive-route-continuity";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { BookCover } from "@/shared/ui/book-cover";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";
import { SessionIdentity } from "@/shared/ui/session-identity";

const segmentLinks = [
  { key: "summary", desktopLabel: "요약", mobileLabel: "요약" },
  { key: "highlights", desktopLabel: "회차 기록", mobileLabel: "회차 기록" },
  { key: "questions", desktopLabel: "함께 남긴 질문", mobileLabel: "질문" },
];

function returnLinkAriaLabel(label: string) {
  if (!label) {
    return "돌아가기";
  }

  return label.includes("돌아가기") ? label : `${label} 돌아가기`;
}

function sessionDetailBackLabel(returnTarget: ReadmatesReturnTarget) {
  if (returnTarget.href === "/app/me") {
    return "내 공간";
  }

  if (returnTarget.href.startsWith("/app/archive")) {
    return "아카이브";
  }

  return "이전 화면";
}

export default function MemberSessionDetailPage({
  session,
  returnTarget = archiveSessionsReturnTarget,
}: {
  session: MemberArchiveSessionDetailResponse;
  returnTarget?: ReadmatesReturnTarget;
}) {
  return (
    <main className="rm-member-session-detail-page">
      <MemberSessionDetailStyles />
      <div className="desktop-only">
        <MemberSessionDetailDesktop session={session} returnTarget={returnTarget} />
      </div>
      <div className="mobile-only">
        <MemberSessionDetailMobile session={session} returnTarget={returnTarget} />
      </div>
    </main>
  );
}

export function MemberSessionDetailUnavailablePage({
  returnTarget = archiveSessionsReturnTarget,
}: {
  returnTarget?: ReadmatesReturnTarget;
}) {
  void returnTarget;

  return (
    <main className="rm-member-session-detail-page">
      <div className="desktop-only">
        <section className="page-header-compact">
          <div className="container">
            <div className="surface-quiet" style={{ padding: 28, marginTop: 20 }}>
              <p className="eyebrow" style={{ margin: 0 }}>
                세션 없음
              </p>
              <h1 className="h2 editorial" style={{ margin: "8px 0 0" }}>
                지난 세션을 찾을 수 없습니다.
              </h1>
              <p className="small" style={{ margin: "10px 0 0", color: "var(--text-2)" }}>
                아카이브 목록에서 다시 확인해 주세요.
              </p>
            </div>
          </div>
        </section>
      </div>
      <div className="mobile-only">
        <div className="m-body">
          <section className="m-sec">
            <div className="m-card-quiet">
              <p className="eyebrow" style={{ margin: 0 }}>
                세션 없음
              </p>
              <h1 className="h3 editorial" style={{ margin: "8px 0 0" }}>
                지난 세션을 찾을 수 없습니다.
              </h1>
              <p className="small" style={{ margin: "10px 0 0", color: "var(--text-2)" }}>
                아카이브 목록에서 다시 확인해 주세요.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function MemberSessionDetailDesktop({
  session,
  returnTarget,
}: {
  session: MemberArchiveSessionDetailResponse;
  returnTarget: ReadmatesReturnTarget;
}) {
  const date = formatDateOnlyLabel(session.date);
  const published = session.state === "PUBLISHED";

  return (
    <>
      <section style={{ padding: "36px 0 80px" }}>
        <div className="container">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "180px minmax(0, 1fr)",
              gap: 36,
              alignItems: "start",
              paddingBottom: 32,
              borderBottom: "1px solid var(--line)",
            }}
          >
            <BookCover title={session.bookTitle} author={session.bookAuthor} imageUrl={session.bookImageUrl} width={180} />
            <div>
              <p className="eyebrow rm-session-detail-kicker" style={{ margin: 0 }}>
                <Link
                  to={returnTarget.href}
                  state={returnTarget.state}
                  className="rm-session-detail-backlink"
                  aria-label={returnLinkAriaLabel(returnTarget.label)}
                >
                  ← {sessionDetailBackLabel(returnTarget)}
                </Link>
              </p>
              <div style={{ marginTop: 10 }}>
                <SessionIdentity
                  sessionNumber={session.sessionNumber}
                  state={session.state}
                  date={session.date}
                  published={published}
                  feedbackDocumentAvailable={session.feedbackDocument.available}
                  hidePastPhaseLabel
                  hideFeedbackDocumentLabel
                />
              </div>
              <h1 className="h1 editorial" style={{ margin: "10px 0 0", maxWidth: 720 }}>
                {session.title}
              </h1>
              <h2 className="h3 editorial" style={{ margin: "10px 0 0", color: "var(--text-2)" }}>
                {session.bookTitle}
              </h2>
              <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 18 }}>
                <span className="badge">{session.bookAuthor}</span>
                <span className="badge">{date}</span>
                <span className="badge">
                  참석 {session.attendance}/{session.total}
                </span>
                <span className="badge">{session.locationLabel}</span>
                <span className={feedbackBadgeClass(session.feedbackDocument)}>{feedbackStatusText(session.feedbackDocument)}</span>
              </div>
              <nav className="rm-session-detail-section-nav" aria-label="세션 상세 섹션">
                {segmentLinks.map((link) => (
                  <a key={link.key} href={`#${link.key}`}>
                    {link.desktopLabel}
                  </a>
                ))}
              </nav>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 300px",
              gap: 44,
              alignItems: "start",
              paddingTop: 36,
            }}
          >
            <div className="stack" style={{ "--stack": "34px" } as CSSProperties}>
              <DesktopSection id="summary" title="요약">
                <SummaryBlock summary={session.publicSummary} />
              </DesktopSection>

              <DesktopSection id="highlights" title="회차 기록">
                <SessionHighlights session={session} />
              </DesktopSection>

              <DesktopSection id="questions" title="함께 남긴 질문">
                <SessionQuestions session={session} />
              </DesktopSection>
            </div>

            <aside className="stack" style={{ "--stack": "14px", position: "sticky", top: 86 } as CSSProperties}>
              <RailCard title="내 참석 상태" value={attendanceText(session.myAttendanceStatus)} />
              <FeedbackStatusCard session={session} returnTarget={returnTarget} />
              {session.isHost ? (
                <Link to={`/app/host/sessions/${encodeURIComponent(session.sessionId)}/edit`} className="btn btn-quiet btn-sm">
                  세션 문서 편집
                </Link>
              ) : null}
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}

function MemberSessionDetailMobile({
  session,
  returnTarget,
}: {
  session: MemberArchiveSessionDetailResponse;
  returnTarget: ReadmatesReturnTarget;
}) {
  const date = formatDateOnlyLabel(session.date);
  const published = session.state === "PUBLISHED";

  return (
    <div className="m-body">
      <section className="m-sec">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "72px minmax(0, 1fr)",
            gap: 14,
            alignItems: "end",
          }}
        >
          <BookCover
            title={session.bookTitle}
            author={session.bookAuthor}
            imageUrl={session.bookImageUrl}
            width={72}
            decorative
          />
          <div style={{ minWidth: 0 }}>
            <div>
              <SessionIdentity
                sessionNumber={session.sessionNumber}
                state={session.state}
                date={session.date}
                published={published}
                feedbackDocumentAvailable={session.feedbackDocument.available}
                compact
                hidePastPhaseLabel
                hideFeedbackDocumentLabel
              />
            </div>
            <h1 className="h2 editorial" style={{ margin: "6px 0 4px" }}>
              {session.bookTitle}
            </h1>
            <div className="small" style={{ color: "var(--text-2)" }}>
              {session.bookAuthor}
            </div>
            <div className="m-row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <span className="badge">{date}</span>
              <span className="badge">
                참석 {session.attendance}/{session.total}
              </span>
              <span className={feedbackBadgeClass(session.feedbackDocument)}>{feedbackStatusText(session.feedbackDocument)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="m-sec">
        <FeedbackStatusCard session={session} returnTarget={returnTarget} mobile />
      </section>

      <nav className="m-hscroll rm-session-detail-mobile-tabs" aria-label="세션 상세 모바일 섹션">
        {segmentLinks.map((link) => (
          <a key={link.key} href={`#mobile-${link.key}`} className="m-chip rm-session-detail-mobile-tab">
            {link.mobileLabel}
          </a>
        ))}
      </nav>

      <section id="mobile-summary" className="m-sec">
        <MobileSectionTitle title="요약" />
        <div className="m-card">
          <SummaryBlock summary={session.publicSummary} />
        </div>
      </section>

      <section id="mobile-highlights" className="m-sec">
        <MobileSectionTitle title="회차 기록" />
        <SessionHighlights session={session} mobile />
      </section>

      <section id="mobile-questions" className="m-sec">
        <MobileSectionTitle title="함께 남긴 질문" />
        <SessionQuestions session={session} mobile />
      </section>

    </div>
  );
}

function DesktopSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} style={{ scrollMarginTop: 90 }}>
      <h2 className="h2 editorial" style={{ margin: "0 0 16px" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function MobileSectionTitle({ title }: { title: string }) {
  return (
    <div className="m-eyebrow-row">
      <h2 className="h3 editorial" style={{ margin: 0 }}>
        {title}
      </h2>
    </div>
  );
}

function SummaryBlock({ summary }: { summary: string | null }) {
  if (!summary?.trim()) {
    return <EmptyText message="아직 이 회차의 요약이 정리되지 않았습니다." />;
  }

  return (
    <p className="body-lg" style={{ margin: 0, color: "var(--text-2)", whiteSpace: "pre-wrap" }}>
      {summary}
    </p>
  );
}

function SessionHighlights({ session, mobile = false }: { session: MemberArchiveSessionDetailResponse; mobile?: boolean }) {
  const hasHighlights = session.publicHighlights.length > 0;
  const hasOneLiners = session.clubOneLiners.length > 0;

  if (!hasHighlights && !hasOneLiners) {
    return mobile ? (
      <div className="m-card-quiet">
        <EmptyText message="아직 이 회차에 정리된 하이라이트나 한줄평이 없습니다." />
      </div>
    ) : (
      <EmptyPanel message="아직 이 회차에 정리된 하이라이트나 한줄평이 없습니다." />
    );
  }

  if (mobile) {
    return (
      <div className="rm-mobile-record-list">
        {hasHighlights ? (
          <RecordGroup title="회차 하이라이트" count={session.publicHighlights.length} mobile>
            <HighlightsList highlights={session.publicHighlights} mobile />
          </RecordGroup>
        ) : null}
        {hasOneLiners ? (
          <RecordGroup title="한줄평" count={session.clubOneLiners.length} mobile>
            <OneLinerList oneLiners={session.clubOneLiners} mobile />
          </RecordGroup>
        ) : null}
      </div>
    );
  }

  return (
    <div className="stack" style={{ "--stack": "20px" } as CSSProperties}>
      {hasHighlights ? (
        <RecordGroup title="회차 하이라이트" count={session.publicHighlights.length}>
          <HighlightsList highlights={session.publicHighlights} />
        </RecordGroup>
      ) : null}
      {hasOneLiners ? (
        <RecordGroup title="한줄평" count={session.clubOneLiners.length}>
          <OneLinerList oneLiners={session.clubOneLiners} />
        </RecordGroup>
      ) : null}
    </div>
  );
}

function SessionQuestions({ session, mobile = false }: { session: MemberArchiveSessionDetailResponse; mobile?: boolean }) {
  if (session.clubQuestions.length === 0) {
    return mobile ? (
      <div className="m-card-quiet">
        <EmptyText message="아직 이 회차에 함께 남긴 질문이 없습니다." />
      </div>
    ) : (
      <EmptyPanel message="아직 이 회차에 함께 남긴 질문이 없습니다." />
    );
  }

  if (mobile) {
    return <QuestionList questions={session.clubQuestions} mobile />;
  }

  return <QuestionList questions={session.clubQuestions} />;
}

function RecordGroup({ title, count, mobile = false, children }: { title: string; count?: number; mobile?: boolean; children: ReactNode }) {
  const heading = typeof count === "number" ? `${title} · ${count}` : title;

  return (
    <section style={mobile ? { padding: "2px 0 4px" } : undefined}>
      <h3 className={mobile ? "small mono" : "h4 editorial"} style={{ margin: mobile ? "0 0 10px" : "0 0 10px", color: mobile ? "var(--text-3)" : undefined }}>
        {heading}
      </h3>
      {children}
    </section>
  );
}

function HighlightsList({
  highlights,
  mobile = false,
}: {
  highlights: MemberArchiveSessionDetailResponse["publicHighlights"];
  mobile?: boolean;
}) {
  if (highlights.length === 0) {
    return null;
  }

  return (
    <div className="rm-session-highlight-list">
      <SessionHighlightListStyles />
      {highlights.map((highlight) => (
        <article
          key={`${highlight.sortOrder}-${highlight.text}`}
          className="rm-session-highlight-row"
        >
          <p className="rm-session-highlight-row__quote editorial">{highlight.text}</p>
          {highlight.authorName ? (
            <div className="row rm-session-highlight-row__source">
              <AvatarChip
                name={highlight.authorName}
                fallbackInitial={highlight.authorShortName}
                label={highlight.authorName}
                size={mobile ? 18 : 20}
              />
              <span className="small">{highlight.authorName}</span>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function MemberSessionDetailStyles() {
  return (
    <style>{`
      .rm-session-detail-kicker {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .rm-session-detail-backlink {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        color: var(--text-2);
        font-family: var(--f-sans);
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 0;
        line-height: 1.35;
        text-decoration: none;
        text-transform: none;
        transition:
          color var(--motion-fast) var(--ease-standard-refined),
          background var(--motion-fast) var(--ease-standard-refined);
      }

      .rm-session-detail-backlink:hover {
        color: var(--text);
      }

      .rm-session-detail-section-nav {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 24px;
        padding-top: 16px;
        border-top: 1px solid var(--line-soft);
      }

      .rm-session-detail-section-nav a {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        padding: 0 12px;
        border: 1px solid var(--line);
        border-radius: var(--r-2);
        background: var(--bg-sub);
        color: var(--text-2);
        font-size: 14px;
        font-weight: 600;
        line-height: 1.4;
        text-decoration: none;
        transition:
          background var(--motion-fast) var(--ease-standard-refined),
          border-color var(--motion-fast) var(--ease-standard-refined),
          color var(--motion-fast) var(--ease-standard-refined);
      }

      .rm-session-detail-section-nav a:hover {
        border-color: var(--line-strong);
        background: var(--bg);
        color: var(--text);
      }
    `}</style>
  );
}

function SessionHighlightListStyles() {
  return (
    <style>{`
      .rm-session-highlight-list {
        border-top: 1px solid var(--line);
      }

      .rm-session-highlight-row {
        padding: 24px 0 26px;
        border-bottom: 1px solid var(--line-soft);
      }

      .rm-session-highlight-row__quote {
        position: relative;
        max-width: 920px;
        margin: 0;
        padding-left: 34px;
        color: var(--text);
        font-size: 18px;
        font-weight: 600;
        line-height: 1.45;
        letter-spacing: 0;
      }

      .rm-session-highlight-row__quote::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0.2em;
        width: 3px;
        min-height: 24px;
        height: calc(100% - 0.4em);
        background: var(--accent);
      }

      .rm-session-highlight-row__source {
        gap: 10px;
        margin-top: 10px;
        padding-left: 34px;
        color: var(--text-3);
      }

      @media (max-width: 768px) {
        .rm-session-highlight-row {
          padding: 20px 0 22px;
        }

        .rm-session-highlight-row__quote {
          padding-left: 22px;
          font-size: 16px;
          line-height: 1.48;
        }

        .rm-session-highlight-row__quote::before {
          width: 2px;
        }

        .rm-session-highlight-row__source {
          padding-left: 22px;
        }
      }
    `}</style>
  );
}

function QuestionList({
  questions,
  mobile = false,
}: {
  questions: MemberArchiveQuestionItem[];
  mobile?: boolean;
}) {
  if (questions.length === 0) {
    return null;
  }

  return (
    <div className={mobile ? "rm-mobile-record-list" : "stack"} style={mobile ? undefined : ({ "--stack": "0px" } as CSSProperties)}>
      {questions.map((question, index) => (
        <article
          key={`${question.priority}-${question.authorName}-${question.text}`}
          className={mobile ? "m-card" : undefined}
          style={
            mobile
              ? undefined
              : {
                  padding: "18px 0",
                  borderTop: index === 0 ? "1px solid var(--line)" : "1px solid var(--line-soft)",
                }
          }
        >
          <div className="tiny mono" style={{ color: "var(--text-3)" }}>
            Q{question.priority} · {question.authorName}
          </div>
          <h4 className="body editorial" style={{ fontSize: mobile ? 15 : 17, margin: "6px 0 0", lineHeight: 1.58 }}>
            {question.text}
          </h4>
          {question.draftThought ? (
            <p className="small" style={{ margin: "8px 0 0", color: "var(--text-3)" }}>
              {question.draftThought}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function OneLinerList({ oneLiners, mobile = false }: { oneLiners: MemberArchiveOneLinerItem[]; mobile?: boolean }) {
  if (oneLiners.length === 0) {
    return null;
  }

  return (
    <div className={mobile ? "rm-mobile-record-list" : "stack"} style={mobile ? undefined : ({ "--stack": "8px" } as CSSProperties)}>
      {oneLiners.map((oneLiner) => (
        <article
          key={`${oneLiner.authorName}-${oneLiner.text}`}
          className={mobile ? "m-card-quiet" : "surface-quiet"}
          style={mobile ? undefined : { padding: "16px 18px" }}
        >
          <p className="body editorial" style={{ fontSize: mobile ? 15 : 16, margin: 0 }}>
            {oneLiner.text}
          </p>
          <div className="row tiny" style={{ marginTop: 8, gap: 8, color: "var(--text-3)" }}>
            <AvatarChip
              name={oneLiner.authorName}
              fallbackInitial={oneLiner.authorShortName}
              label={oneLiner.authorName}
              size={22}
            />
            {oneLiner.authorName}
          </div>
        </article>
      ))}
    </div>
  );
}

function FeedbackStatusCard({
  session,
  returnTarget,
  mobile = false,
}: {
  session: MemberArchiveSessionDetailResponse;
  returnTarget: ReadmatesReturnTarget;
  mobile?: boolean;
}) {
  const feedback = session.feedbackDocument;
  const className = mobile ? feedbackDocumentCardClassName({ feedback, compact: true, mobile }) : feedbackRailCardClassName(feedback);
  const style = mobile ? undefined : { padding: 18 };
  const feedbackReturnTarget: ReadmatesReturnTarget = {
    href: appSessionHref(session.sessionId),
    label: "세션으로 돌아가기",
    state: readmatesReturnState(returnTarget),
  };
  const feedbackReturnState = readmatesReturnState(feedbackReturnTarget);

  return (
    <article className={className} style={style}>
      <div className="tiny mono" style={{ color: "var(--text-3)" }}>
        피드백
      </div>
      <div className="h4 editorial" style={{ marginTop: 6 }}>
        {feedbackStatusText(feedback)}
      </div>
      {feedback.uploadedAt ? (
        <div className="tiny mono" style={{ color: "var(--text-3)", marginTop: 8 }}>
          {formatDateOnlyLabel(feedback.uploadedAt)} 등록
        </div>
      ) : null}
      <p className="tiny" style={{ margin: "10px 0 0", color: "var(--text-3)" }}>
        {feedbackAccessCopy(feedback)}
      </p>
      {feedback.available && feedback.readable ? (
        <Link
          to={appFeedbackHref(session.sessionId)}
          state={feedbackReturnState}
          className="btn btn-ghost btn-sm"
          style={{ marginTop: 12 }}
        >
          피드백 보기
        </Link>
      ) : null}
    </article>
  );
}

function RailCard({ title, value }: { title: string; value: string }) {
  return (
    <article className="surface-quiet" style={{ padding: 18 }}>
      <div className="tiny mono" style={{ color: "var(--text-3)" }}>
        {title}
      </div>
      <div className="h4 editorial" style={{ marginTop: 6 }}>
        {value}
      </div>
    </article>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="surface-quiet" style={{ padding: 22 }}>
      <EmptyText message={message} />
    </div>
  );
}

function EmptyText({ message }: { message: string }) {
  return (
    <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
      {message}
    </p>
  );
}
