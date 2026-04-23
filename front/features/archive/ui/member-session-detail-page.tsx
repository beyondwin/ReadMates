import type { CSSProperties, ReactNode } from "react";
import type {
  ArchiveFeedbackDocumentStatus,
  MemberArchiveCheckinItem,
  MemberArchiveLongReview,
  MemberArchiveOneLineReview,
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
  hasClubRecords,
  hasMyRecords,
  myRecordSummary,
  sessionNo,
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
  { key: "club-records", desktopLabel: "회차 기록", mobileLabel: "회차 기록" },
  { key: "my-records", desktopLabel: "내 기록", mobileLabel: "내 기록" },
  { key: "feedback", desktopLabel: "피드백 문서", mobileLabel: "피드백 문서" },
];

export default function MemberSessionDetailPage({
  session,
  returnTarget = archiveSessionsReturnTarget,
}: {
  session: MemberArchiveSessionDetailResponse;
  returnTarget?: ReadmatesReturnTarget;
}) {
  return (
    <main className="rm-member-session-detail-page">
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

  return (
    <>
      <section className="page-header-compact">
        <div className="container">
          <div className="row" style={{ justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
            <nav className="row" style={{ gap: 6, flexWrap: "wrap" }} aria-label="세션 상세 섹션">
              {segmentLinks.map((link) => (
                <a key={link.key} href={`#${link.key}`} className="badge">
                  {link.desktopLabel}
                </a>
              ))}
            </nav>
          </div>
        </div>
      </section>

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
              <p className="eyebrow" style={{ margin: 0 }}>
                아카이브 세션 · {sessionNo(session.sessionNumber)} · {date}
              </p>
              <div style={{ marginTop: 10 }}>
                <SessionIdentity
                  sessionNumber={session.sessionNumber}
                  state={session.state}
                  date={session.date}
                  published={Boolean(session.publicSummary)}
                  feedbackDocumentAvailable={session.feedbackDocument.available}
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
              <DesktopSection id="summary" eyebrow="요약" title="요약">
                <SummaryBlock summary={session.publicSummary} />
              </DesktopSection>

              <DesktopSection id="club-records" eyebrow="회차 기록" title="회차 기록">
                <ClubRecords session={session} />
              </DesktopSection>

              <DesktopSection id="my-records" eyebrow="내 기록" title="내 기록">
                <MyRecords session={session} />
              </DesktopSection>

              <DesktopSection id="feedback" eyebrow="피드백 문서" title="피드백 문서">
                <FeedbackDocumentCard session={session} returnTarget={returnTarget} />
              </DesktopSection>
            </div>

            <aside className="stack" style={{ "--stack": "14px", position: "sticky", top: 86 } as CSSProperties}>
              <RailCard title="내 참석 상태" value={attendanceText(session.myAttendanceStatus)} />
              <RailCard title="내 기록" value={myRecordSummary(session)} />
              <FeedbackRailCard feedback={session.feedbackDocument} />
              {session.isHost ? (
                <Link to={`/app/host/sessions/${encodeURIComponent(session.sessionId)}/edit`} className="btn btn-quiet btn-sm">
                  세션 편집
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
            <div className="tiny mono" style={{ color: "var(--text-3)" }}>
              {sessionNo(session.sessionNumber)} · {date}
            </div>
            <div style={{ marginTop: 6 }}>
              <SessionIdentity
                sessionNumber={session.sessionNumber}
                state={session.state}
                date={session.date}
                published={Boolean(session.publicSummary)}
                feedbackDocumentAvailable={session.feedbackDocument.available}
                compact
              />
            </div>
            <h1 className="h2 editorial" style={{ margin: "6px 0 4px" }}>
              {session.bookTitle}
            </h1>
            <div className="small" style={{ color: "var(--text-2)" }}>
              {session.bookAuthor}
            </div>
            <div className="m-row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <span className="badge">
                참석 {session.attendance}/{session.total}
              </span>
              <span className={feedbackBadgeClass(session.feedbackDocument)}>{feedbackStatusText(session.feedbackDocument)}</span>
            </div>
          </div>
        </div>
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

      <section id="mobile-club-records" className="m-sec">
        <MobileSectionTitle title="회차 기록" />
        <ClubRecords session={session} mobile />
      </section>

      <section id="mobile-my-records" className="m-sec">
        <MobileSectionTitle title="내 기록" />
        <MyRecords session={session} mobile />
      </section>

      <section id="mobile-feedback" className="m-sec">
        <MobileSectionTitle title="피드백 문서" />
        <FeedbackDocumentCard session={session} returnTarget={returnTarget} mobile />
      </section>
    </div>
  );
}

function DesktopSection({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} style={{ scrollMarginTop: 90 }}>
      <p className="eyebrow" style={{ margin: 0 }}>
        {eyebrow}
      </p>
      <h2 className="h2 editorial" style={{ margin: "6px 0 16px" }}>
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

function ClubRecords({ session, mobile = false }: { session: MemberArchiveSessionDetailResponse; mobile?: boolean }) {
  if (!hasClubRecords(session)) {
    return mobile ? (
      <div className="m-card-quiet">
        <EmptyText message="아직 이 회차에 함께 남긴 기록이 없습니다." />
      </div>
    ) : (
      <EmptyPanel message="아직 이 회차에 함께 남긴 기록이 없습니다." />
    );
  }

  if (mobile) {
    return (
      <div className="rm-mobile-record-list">
        {session.publicHighlights.length > 0 ? (
          <RecordGroup title="회차 하이라이트" count={session.publicHighlights.length} mobile>
            <HighlightsList highlights={session.publicHighlights} mobile />
          </RecordGroup>
        ) : null}
        {session.clubQuestions.length > 0 ? (
          <RecordGroup title="함께 남긴 질문" count={session.clubQuestions.length} mobile>
            <QuestionList questions={session.clubQuestions} labelPrefix="함께 남긴 질문" mobile />
          </RecordGroup>
        ) : null}
        {session.clubOneLiners.length > 0 ? (
          <RecordGroup title="함께 남긴 한줄평" count={session.clubOneLiners.length} mobile>
            <OneLinerList oneLiners={session.clubOneLiners} mobile />
          </RecordGroup>
        ) : null}
      </div>
    );
  }

  return (
    <div className="stack" style={{ "--stack": "20px" } as CSSProperties}>
      {session.publicHighlights.length > 0 ? (
        <RecordGroup title="회차 하이라이트" count={session.publicHighlights.length}>
          <HighlightsList highlights={session.publicHighlights} />
        </RecordGroup>
      ) : null}
      {session.clubQuestions.length > 0 ? (
        <RecordGroup title="함께 남긴 질문" count={session.clubQuestions.length}>
          <QuestionList questions={session.clubQuestions} labelPrefix="함께 남긴 질문" />
        </RecordGroup>
      ) : null}
      {session.clubOneLiners.length > 0 ? (
        <RecordGroup title="함께 남긴 한줄평" count={session.clubOneLiners.length}>
          <OneLinerList oneLiners={session.clubOneLiners} />
        </RecordGroup>
      ) : null}
    </div>
  );
}

function MyRecords({ session, mobile = false }: { session: MemberArchiveSessionDetailResponse; mobile?: boolean }) {
  if (!hasMyRecords(session)) {
    return mobile ? (
      <div className="m-card-quiet">
        <EmptyText message="이 회차에 남긴 내 질문이나 서평이 없습니다." />
      </div>
    ) : (
      <EmptyPanel message="이 회차에 남긴 내 질문이나 서평이 없습니다." />
    );
  }

  if (mobile) {
    return (
      <div className="stack" style={{ "--stack": "10px" } as CSSProperties}>
        <QuestionList questions={session.myQuestions} labelPrefix="내 질문" mobile />
        {session.myCheckin ? <ReadingProgressRecord checkin={session.myCheckin} mobile /> : null}
        <ReviewList oneLineReview={session.myOneLineReview} longReview={session.myLongReview} mobile />
      </div>
    );
  }

  return (
    <div className="stack" style={{ "--stack": "20px" } as CSSProperties}>
      {session.myQuestions.length > 0 ? (
        <RecordGroup title="내 질문" count={session.myQuestions.length}>
          <QuestionList questions={session.myQuestions} labelPrefix="내 질문" />
        </RecordGroup>
      ) : null}
      {session.myCheckin ? (
        <RecordGroup title="내 읽기 진행률">
          <ReadingProgressRecord checkin={session.myCheckin} />
        </RecordGroup>
      ) : null}
      {session.myOneLineReview || session.myLongReview ? (
        <RecordGroup title="내 서평" count={(session.myOneLineReview ? 1 : 0) + (session.myLongReview ? 1 : 0)}>
          <ReviewList oneLineReview={session.myOneLineReview} longReview={session.myLongReview} />
        </RecordGroup>
      ) : null}
    </div>
  );
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
    <div className={mobile ? "rm-mobile-record-list" : "stack"} style={mobile ? undefined : ({ "--stack": "0px" } as CSSProperties)}>
      {highlights.map((highlight) => (
        <blockquote
          key={`${highlight.sortOrder}-${highlight.text}`}
          className={mobile ? "m-card-quiet" : "quote"}
          style={mobile ? { margin: 0 } : { margin: 0 }}
        >
          {highlight.text}
        </blockquote>
      ))}
    </div>
  );
}

function QuestionList({
  questions,
  labelPrefix = "저장된 질문",
  mobile = false,
}: {
  questions: MemberArchiveQuestionItem[];
  labelPrefix?: string;
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
          <div className="tiny mono" style={{ color: "var(--accent)" }}>
            {labelPrefix} Q{question.priority} · {question.authorName}
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

function ReadingProgressRecord({ checkin, mobile = false }: { checkin: MemberArchiveCheckinItem; mobile?: boolean }) {
  return (
    <article className={mobile ? "m-card-quiet" : "surface-quiet"} style={mobile ? undefined : { padding: "16px 18px" }}>
      <div className="tiny mono" style={{ color: "var(--text-3)" }}>
        내 읽기 진행률
      </div>
      <div className="h4 editorial" style={{ marginTop: 6 }}>
        {checkin.readingProgress}%
      </div>
    </article>
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

function ReviewList({
  oneLineReview,
  longReview,
  mobile = false,
}: {
  oneLineReview: MemberArchiveOneLineReview | null;
  longReview: MemberArchiveLongReview | null;
  mobile?: boolean;
}) {
  if (!oneLineReview && !longReview) {
    return null;
  }

  return (
    <div className="stack" style={{ "--stack": "10px" } as CSSProperties}>
      {oneLineReview ? (
        <article className={mobile ? "m-card-quiet" : "surface-quiet"} style={mobile ? undefined : { padding: "16px 18px" }}>
          <div className="tiny mono" style={{ color: "var(--text-3)" }}>
            내 한줄평
          </div>
          <p className="body editorial" style={{ fontSize: mobile ? 15 : 16, margin: "6px 0 0" }}>
            {oneLineReview.text}
          </p>
        </article>
      ) : null}
      {longReview ? (
        <article className={mobile ? "m-card" : "surface"} style={mobile ? undefined : { padding: "18px" }}>
          <div className="tiny mono" style={{ color: "var(--text-3)" }}>
            내 장문 서평
          </div>
          <p className="body" style={{ margin: "6px 0 0", color: "var(--text-2)", whiteSpace: "pre-wrap" }}>
            {longReview.body}
          </p>
        </article>
      ) : null}
    </div>
  );
}

function FeedbackDocumentCard({
  session,
  returnTarget,
  compact = false,
  mobile = false,
}: {
  session: MemberArchiveSessionDetailResponse;
  returnTarget: ReadmatesReturnTarget;
  compact?: boolean;
  mobile?: boolean;
}) {
  const feedback = session.feedbackDocument;
  const className = feedbackDocumentCardClassName({ feedback, compact, mobile });
  const style = mobile ? undefined : { padding: compact ? 18 : 22 };
  const feedbackReturnTarget: ReadmatesReturnTarget = {
    href: appSessionHref(session.sessionId, mobile ? "mobile-feedback" : "feedback"),
    label: "세션으로 돌아가기",
    state: readmatesReturnState(returnTarget),
  };
  const feedbackReturnState = readmatesReturnState(feedbackReturnTarget);

  if (!feedback.available) {
    return (
      <article className={className} style={style}>
        <FeedbackCardTitle feedback={feedback} compact={compact} />
        <p className="small" style={{ margin: "12px 0 0", color: "var(--text-2)" }}>
          아직 등록된 피드백 문서가 없습니다.
        </p>
        <p className="tiny" style={{ margin: "6px 0 0", color: "var(--text-3)" }}>
          {feedbackAccessCopy(feedback)}
        </p>
      </article>
    );
  }

  if (!feedback.readable) {
    return (
      <article className={className} style={style}>
        <FeedbackCardTitle feedback={feedback} compact={compact} />
        <p className="small" style={{ margin: "12px 0 0", color: "var(--text-2)" }}>
          피드백 문서는 정식 멤버와 참석자에게만 열립니다.
        </p>
        <p className="tiny" style={{ margin: "6px 0 0", color: "var(--text-3)" }}>
          {feedbackAccessCopy(feedback)}
        </p>
      </article>
    );
  }

  return (
    <article className={className} style={style}>
      <FeedbackCardTitle feedback={feedback} compact={compact} />
      <p className="tiny" style={{ margin: "10px 0 0", color: "var(--text-3)" }}>
        {feedbackAccessCopy(feedback)}
      </p>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: compact ? 12 : 16 }}>
        <Link to={appFeedbackHref(session.sessionId)} state={feedbackReturnState} className="btn btn-ghost btn-sm">
          피드백 문서 열기
        </Link>
        <Link to={appFeedbackHref(session.sessionId, true)} state={feedbackReturnState} className="btn btn-quiet btn-sm">
          PDF 저장
        </Link>
      </div>
    </article>
  );
}

function FeedbackCardTitle({
  feedback,
  compact,
}: {
  feedback: ArchiveFeedbackDocumentStatus;
  compact: boolean;
}) {
  return (
    <div>
      <div className="tiny mono" style={{ color: "var(--text-3)" }}>
        {feedback.uploadedAt ? `${formatDateOnlyLabel(feedback.uploadedAt)} 등록` : "피드백 문서"}
      </div>
      <h3 className={compact ? "h4 editorial" : "h3 editorial"} style={{ margin: "6px 0 0" }}>
        {feedback.title ?? "피드백 문서"}
      </h3>
    </div>
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

function FeedbackRailCard({ feedback }: { feedback: ArchiveFeedbackDocumentStatus }) {
  return (
    <article className={feedbackRailCardClassName(feedback)} style={{ padding: 18 }}>
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
