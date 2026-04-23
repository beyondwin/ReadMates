import type { KeyboardEvent, ReactNode } from "react";
import { Icon, SaveFeedback } from "@/features/current-session/ui/current-session-primitives";
import { QuestionEditor, type QuestionInput } from "@/features/current-session/ui/current-session-question-editor";
import {
  MAX_QUESTION_INPUT_COUNT,
  MIN_QUESTION_INPUT_COUNT,
} from "@/features/current-session/model/current-session-form-model";
import type {
  BoardHighlight,
  BoardOneLineReview,
  BoardQuestion,
  CurrentSession,
  CurrentSessionInternalLinkProps,
  InternalLinkComponent,
  RsvpUpdateStatus,
  SaveState,
} from "@/features/current-session/ui/current-session-types";
import type { getCurrentSessionMemberNotice } from "@/features/current-session/model/current-session-view-model";
import { safeExternalHttpsUrl } from "@/shared/security/safe-external-url";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { BookCover } from "@/shared/ui/book-cover";
import { formatDateLabel, formatDeadlineLabel, formatSessionKicker, rsvpLabel } from "@/shared/ui/readmates-display";

export type MobileSessionTab = "prep" | "board" | "after";

const rsvpOptions: Array<{ status: RsvpUpdateStatus; label: string }> = [
  { status: "GOING", label: "참석" },
  { status: "MAYBE", label: "아직 미정" },
  { status: "DECLINED", label: "불참" },
];

function AnchorInternalLink({ href, children, ...props }: CurrentSessionInternalLinkProps) {
  return (
    <a {...props} href={href}>
      {children}
    </a>
  );
}

function focusMobileSessionTab(tab: MobileSessionTab) {
  globalThis.setTimeout(() => {
    document.getElementById(`mobile-session-tab-${tab}`)?.focus();
  }, 0);
}

function handleMobileSessionTabKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  activeTab: MobileSessionTab,
  onMobileTabChange: (tab: MobileSessionTab) => void,
  tabs: Array<{ key: MobileSessionTab; label: string }>,
) {
  const keys = tabs.map((tab) => tab.key);
  const currentIndex = keys.indexOf(activeTab);
  const lastIndex = keys.length - 1;
  const nextIndex =
    event.key === "ArrowRight"
      ? (currentIndex + 1) % keys.length
      : event.key === "ArrowLeft"
        ? (currentIndex - 1 + keys.length) % keys.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? lastIndex
            : -1;

  if (nextIndex < 0) {
    return;
  }

  event.preventDefault();
  const nextTab = keys[nextIndex];
  onMobileTabChange(nextTab);
  focusMobileSessionTab(nextTab);
}

function goingCount(session: CurrentSession) {
  return activeAttendees(session).filter((attendee) => attendee.rsvpStatus === "GOING").length;
}

function activeAttendees(session: CurrentSession) {
  return session.attendees.filter((attendee) => (attendee.participationStatus ?? "ACTIVE") === "ACTIVE");
}

export function MobileCurrentSessionBoard({
  session,
  rsvp,
  readingProgress,
  onReadingProgressChange,
  questionInputs,
  questionValidationMessage,
  onQuestionChange,
  onAddQuestion,
  onRemoveQuestion,
  onSaveQuestions,
  writtenQuestionCount,
  longReview,
  onLongReviewChange,
  oneLineReview,
  checkinSaveStatus,
  questionSaveStatus,
  longReviewSaveStatus,
  rsvpSaveStatus,
  onRsvpChange,
  mobileTab,
  onMobileTabChange,
  onSaveCheckin,
  onSaveLongReview,
  isViewer,
  memberNotice,
  isHost,
  canWrite,
  internalLinkComponent: InternalLink = AnchorInternalLink,
}: {
  session: CurrentSession;
  rsvp: CurrentSession["myRsvpStatus"];
  readingProgress: number;
  onReadingProgressChange: (value: number) => void;
  questionInputs: QuestionInput[];
  questionValidationMessage: string;
  onQuestionChange: (index: number, value: string) => void;
  onAddQuestion: () => void;
  onRemoveQuestion: (index: number) => void;
  onSaveQuestions: () => void;
  writtenQuestionCount: number;
  longReview: string;
  onLongReviewChange: (value: string) => void;
  oneLineReview: string;
  checkinSaveStatus: SaveState;
  questionSaveStatus: SaveState;
  longReviewSaveStatus: SaveState;
  rsvpSaveStatus: SaveState;
  onRsvpChange: (status: RsvpUpdateStatus) => void;
  mobileTab: MobileSessionTab;
  onMobileTabChange: (tab: MobileSessionTab) => void;
  onSaveCheckin: () => void;
  onSaveLongReview: () => void;
  isViewer: boolean;
  memberNotice: ReturnType<typeof getCurrentSessionMemberNotice>;
  isHost: boolean;
  canWrite: boolean;
  internalLinkComponent?: InternalLinkComponent;
}) {
  const tabs: Array<{ key: MobileSessionTab; label: string }> = [
    { key: "prep", label: "내 준비" },
    { key: "after", label: "내 기록" },
    { key: "board", label: "공동 보드" },
  ];
  const meetingUrl = safeExternalHttpsUrl(session.meetingUrl);

  return (
    <main className="mobile-only rm-current-session-mobile m-body" data-testid="current-session-mobile">
      <section className="rm-current-session-mobile__hero">
        <div className="m-row rm-current-session-mobile__hero-row">
          <div className="rm-current-session-mobile__hero-copy">
            <div className="eyebrow">{formatSessionKicker(session.sessionNumber, session.date)}</div>
            <h1 className="h2 editorial rm-current-session-mobile__title">{session.bookTitle}</h1>
            <div className="tiny" style={{ color: "var(--text-2)" }}>
              {session.bookAuthor}
            </div>
            <div className="tiny mono rm-current-session-mobile__meta-line">
              {formatDateLabel(session.date)} · {session.startTime} – {session.endTime} · {session.locationLabel}
            </div>
          </div>
          <BookCover title={session.bookTitle} author={session.bookAuthor} imageUrl={session.bookImageUrl} width={68} />
        </div>
        {meetingUrl ? (
          <a className="rm-current-session-mobile__meeting" href={meetingUrl} target="_blank" rel="noreferrer">
            <span className="m-row" style={{ gap: 6 }}>
              <Icon name="arrow-up-right" size={14} />
              모임 링크 열기
            </span>
            {session.meetingPasscode ? (
              <span className="tiny mono" style={{ color: "var(--text-3)" }}>
                Passcode {session.meetingPasscode}
              </span>
            ) : null}
          </a>
        ) : null}
        {isHost ? (
          <InternalLink href={`/app/host/sessions/${session.sessionId}/edit`} className="rm-current-session-mobile__host-link">
            세션 운영으로
          </InternalLink>
        ) : null}
      </section>

      <div className="rm-current-session-mobile__seg-wrap">
        <div
          className="m-seg"
          role="group"
          aria-label="세션 보기"
          onKeyDown={(event) => handleMobileSessionTabKeyDown(event, mobileTab, onMobileTabChange, tabs)}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              id={`mobile-session-tab-${tab.key}`}
              type="button"
              className="m-seg-btn"
              aria-pressed={mobileTab === tab.key}
              onClick={() => onMobileTabChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {memberNotice?.kind === "suspended" ? <MobileSuspendedMemberNotice message={memberNotice.message} /> : null}
      {memberNotice?.kind === "viewer" ? <MobileViewerMemberNotice /> : null}

      {mobileTab === "prep" && isViewer ? (
        <MobileViewerPrepSegment
          session={session}
          rsvp={rsvp}
          readingProgress={readingProgress}
          writtenQuestionCount={writtenQuestionCount}
        />
      ) : null}
      {mobileTab === "prep" && !isViewer ? (
        <SuspendedFieldset disabled={!canWrite}>
          <MobilePrepSegment
            session={session}
            rsvp={rsvp}
            readingProgress={readingProgress}
            onReadingProgressChange={onReadingProgressChange}
            questionInputs={questionInputs}
            questionValidationMessage={questionValidationMessage}
            onQuestionChange={onQuestionChange}
            onAddQuestion={onAddQuestion}
            onRemoveQuestion={onRemoveQuestion}
            onSaveQuestions={onSaveQuestions}
            writtenQuestionCount={writtenQuestionCount}
            checkinSaveStatus={checkinSaveStatus}
            questionSaveStatus={questionSaveStatus}
            rsvpSaveStatus={rsvpSaveStatus}
            onRsvpChange={onRsvpChange}
            onSaveCheckin={onSaveCheckin}
            canWrite={canWrite}
          />
        </SuspendedFieldset>
      ) : null}
      {mobileTab === "board" ? <MobileBoardSegment session={session} /> : null}
      {mobileTab === "after" && isViewer ? (
        <MobileViewerRecordsSegment longReview={longReview} oneLineReview={oneLineReview} />
      ) : null}
      {mobileTab === "after" && !isViewer ? (
        <SuspendedFieldset disabled={!canWrite}>
          <MobileRecordsSegment
            longReview={longReview}
            onLongReviewChange={onLongReviewChange}
            longReviewSaveStatus={longReviewSaveStatus}
            onSaveLongReview={onSaveLongReview}
            canWrite={canWrite}
          />
        </SuspendedFieldset>
      ) : null}
    </main>
  );
}

function SuspendedFieldset({ disabled, children }: { disabled: boolean; children: ReactNode }) {
  return (
    <fieldset disabled={disabled} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      {children}
    </fieldset>
  );
}

function MobileSuspendedMemberNotice({ message }: { message: string }) {
  return (
    <section className="m-sec">
      <div className="m-card-quiet" role="note" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
        <p className="small" style={{ margin: 0 }}>
          {message}
        </p>
      </div>
    </section>
  );
}

function MobileViewerMemberNotice() {
  return (
    <section className="m-sec">
      <div className="m-card-quiet" role="note">
        <div className="eyebrow">둘러보기 멤버</div>
        <p className="small" style={{ margin: "6px 0 0" }}>
          세션 기록은 읽을 수 있어요. RSVP, 진행률, 질문, 서평 저장은 정식 멤버에게 열립니다.
        </p>
      </div>
    </section>
  );
}

function MobileViewerPrepSegment({
  session,
  rsvp,
  readingProgress,
  writtenQuestionCount,
}: {
  session: CurrentSession;
  rsvp: CurrentSession["myRsvpStatus"];
  readingProgress: number;
  writtenQuestionCount: number;
}) {
  return (
    <>
      <section className="m-sec">
        <div className="m-card">
          <div className="eyebrow">읽기 전용 세션 상세</div>
          <div className="h4 editorial" style={{ marginTop: 6 }}>
            기록은 볼 수 있고, 새 참여 기록은 정식 멤버에게 열립니다
          </div>
          <p className="small" style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
            둘러보기 멤버는 쓰기 기능 없이 기존 기록과 공동 보드를 확인합니다.
          </p>
          <div className="rm-current-session-mobile__meta-grid" style={{ marginTop: 14 }}>
            <MobileReadOnlyStat label="RSVP" value={rsvpLabel(rsvp)} />
            <MobileReadOnlyStat label="읽기 진행률" value={`${readingProgress}%`} />
            <MobileReadOnlyStat label="토론 질문" value={`${writtenQuestionCount}/${MAX_QUESTION_INPUT_COUNT}`} />
            <MobileReadOnlyStat label="피드백 문서" value="정식 멤버 전환 후" />
          </div>
        </div>
      </section>

      <section className="m-sec">
        <div className="m-card-quiet">
          <div className="eyebrow">읽기 진행률</div>
          <div className="h4 editorial" style={{ marginTop: 6 }}>
            {readingProgress}%
          </div>
          <p className="small" style={{ color: "var(--text-2)", margin: "8px 0 0", whiteSpace: "pre-wrap" }}>
            진행률은 내 준비 상태와 호스트 운영 확인에 사용됩니다.
          </p>
        </div>
      </section>

      <MobilePrepMeta session={session} rsvp={rsvp} readingProgress={readingProgress} writtenQuestionCount={writtenQuestionCount} />
    </>
  );
}

function MobileReadOnlyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="m-card-quiet">
      <div className="tiny mono" style={{ color: "var(--text-3)", marginBottom: 6 }}>
        {label}
      </div>
      <div className="body" style={{ fontSize: 14, fontWeight: 500 }}>
        {value}
      </div>
    </div>
  );
}

function MobilePrepSegment({
  session,
  rsvp,
  readingProgress,
  onReadingProgressChange,
  questionInputs,
  questionValidationMessage,
  onQuestionChange,
  onAddQuestion,
  onRemoveQuestion,
  onSaveQuestions,
  writtenQuestionCount,
  checkinSaveStatus,
  questionSaveStatus,
  rsvpSaveStatus,
  onRsvpChange,
  onSaveCheckin,
  canWrite,
}: {
  session: CurrentSession;
  rsvp: CurrentSession["myRsvpStatus"];
  readingProgress: number;
  onReadingProgressChange: (value: number) => void;
  questionInputs: QuestionInput[];
  questionValidationMessage: string;
  onQuestionChange: (index: number, value: string) => void;
  onAddQuestion: () => void;
  onRemoveQuestion: (index: number) => void;
  onSaveQuestions: () => void;
  writtenQuestionCount: number;
  checkinSaveStatus: SaveState;
  questionSaveStatus: SaveState;
  rsvpSaveStatus: SaveState;
  onRsvpChange: (status: RsvpUpdateStatus) => void;
  onSaveCheckin: () => void;
  canWrite: boolean;
}) {
  return (
    <>
      <section className="m-sec">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          RSVP
        </div>
        <div className="m-card">
          <div className="h4 editorial" style={{ marginBottom: 12 }}>
            이번 모임에 참석하시나요?
          </div>
          <div className="m-chips">
            {rsvpOptions.map((option) => {
              const selected = rsvp === option.status;

              return (
                <button
                  key={option.status}
                  type="button"
                  className={`m-chip${selected ? " is-on" : ""}`}
                  disabled={!canWrite || rsvpSaveStatus === "saving"}
                  aria-disabled={!canWrite || rsvpSaveStatus === "saving"}
                  onClick={() => onRsvpChange(option.status)}
                  style={{
                    minHeight: 32,
                    height: 32,
                    padding: "0 14px",
                    fontSize: 13,
                    borderColor: selected ? "var(--text)" : "var(--line)",
                    background: selected ? "var(--text)" : "transparent",
                    color: selected ? "var(--bg)" : "var(--text-2)",
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <div className="rm-current-session-mobile__save-row">
            <div className="tiny" style={{ color: "var(--text-3)" }}>
              현재 {rsvpLabel(rsvp)} · 질문 제출 마감 {formatDeadlineLabel(session.questionDeadlineAt)}
            </div>
            <SaveFeedback scope="rsvp" status={rsvpSaveStatus} />
          </div>
        </div>
      </section>

      <section className="m-sec">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          읽기 진행률
        </div>
        <div className="m-card">
          <div className="m-row-between">
            <div className="editorial rm-current-session-mobile__progress-value">
              {readingProgress}
              <span className="small" style={{ color: "var(--text-3)", marginLeft: 2 }}>
                %
              </span>
            </div>
            <span className="tiny mono" style={{ color: "var(--text-3)" }}>
              운영 확인용
            </span>
          </div>
          <label className="label" htmlFor="mobile-checkin-progress" style={{ marginTop: 12 }}>
            읽기 진행률
          </label>
          <input
            id="mobile-checkin-progress"
            type="range"
            min={0}
            max={100}
            value={readingProgress}
            className="m-range"
            disabled={!canWrite}
            onChange={(event) => onReadingProgressChange(Number(event.target.value))}
            style={{ marginTop: 14 }}
          />
          <div className="rm-current-session-mobile__save-row">
            <span className="tiny" style={{ color: "var(--text-3)" }}>
              내 준비 상태와 호스트 운영 확인에 사용됩니다.
            </span>
            <SaveFeedback scope="checkin" status={checkinSaveStatus} />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!canWrite || checkinSaveStatus === "saving"}
              aria-disabled={!canWrite || checkinSaveStatus === "saving"}
              onClick={onSaveCheckin}
            >
              진행률 저장
            </button>
          </div>
        </div>
      </section>

      <QuestionEditor
        variant="mobile"
        questionInputs={questionInputs}
        writtenQuestionCount={writtenQuestionCount}
        validationMessage={questionValidationMessage}
        saveStatus={questionSaveStatus}
        onChangeQuestion={onQuestionChange}
        onAddQuestion={onAddQuestion}
        onRemoveQuestion={onRemoveQuestion}
        onSaveQuestions={onSaveQuestions}
      />

      <MobilePrepMeta session={session} rsvp={rsvp} readingProgress={readingProgress} writtenQuestionCount={writtenQuestionCount} />
    </>
  );
}

function MobilePrepMeta({
  session,
  rsvp,
  readingProgress,
  writtenQuestionCount,
}: {
  session: CurrentSession;
  rsvp: CurrentSession["myRsvpStatus"];
  readingProgress: number;
  writtenQuestionCount: number;
}) {
  const attendees = activeAttendees(session);
  const statusItems = [
    { label: "RSVP", value: rsvpLabel(rsvp), ok: rsvp === "GOING" },
    { label: "읽기", value: readingProgress >= 100 ? "완독" : `${readingProgress}%`, ok: readingProgress >= 100 },
    {
      label: "질문",
      value: `${writtenQuestionCount}/${MAX_QUESTION_INPUT_COUNT}`,
      ok: writtenQuestionCount >= MIN_QUESTION_INPUT_COUNT,
    },
  ];

  return (
    <section className="m-sec">
      <div className="m-eyebrow-row">
        <span className="eyebrow">내 상태</span>
        <span className="tiny mono" style={{ color: "var(--text-3)" }}>
          세션 정보
        </span>
      </div>
      <div className="rm-current-session-mobile__meta-grid">
        <div className="m-card-quiet">
          {statusItems.map((item) => (
            <div key={item.label} className="m-row-between rm-current-session-mobile__status-row">
              <span className="small" style={{ color: "var(--text-2)" }}>
                {item.label}
              </span>
              <span className="m-row" style={{ gap: 8 }}>
                <span className="body" style={{ fontSize: 14, fontWeight: 500, color: item.ok ? "var(--ok)" : "var(--text)" }}>
                  {item.value}
                </span>
                <span
                  aria-hidden="true"
                  className="rm-current-session-mobile__status-dot"
                  style={{ background: item.ok ? "var(--ok)" : "var(--text-4)" }}
                />
              </span>
            </div>
          ))}
        </div>

        <div className="m-card-quiet">
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            세션 정보
          </div>
          <dl className="rm-current-session-mobile__details">
            <dt>날짜</dt>
            <dd>{formatDateLabel(session.date)}</dd>
            <dt>시간</dt>
            <dd>
              {session.startTime} – {session.endTime}
            </dd>
            <dt>장소</dt>
            <dd>{session.locationLabel}</dd>
            {session.meetingPasscode ? (
              <>
                <dt>Passcode</dt>
                <dd>{session.meetingPasscode}</dd>
              </>
            ) : null}
          </dl>
          <hr className="divider-soft" style={{ margin: "14px 0" }} />
          <div className="m-row" style={{ gap: 8 }}>
            <Icon name="mic" size={14} style={{ color: "var(--text-3)" }} />
            <span className="tiny" style={{ color: "var(--text-3)" }}>
              원치 않으시면 모임 중 언제든 말씀해 주세요.
            </span>
          </div>
        </div>
      </div>

      <div className="m-card rm-current-session-mobile__roster">
        <div className="m-row-between" style={{ marginBottom: 12 }}>
          <span className="eyebrow">
            참석자 · {goingCount(session)}/{attendees.length}
          </span>
        </div>
        <div className="rm-current-session-mobile__member-list">
          {attendees.map((member) => (
            <div key={member.membershipId} className="m-row-between">
              <span className="m-row" style={{ gap: 10 }}>
                <AvatarChip name={member.displayName} fallbackInitial={member.shortName} label={member.displayName} rsvpStatus={member.rsvpStatus} size={24} />
                <span className="body" style={{ fontSize: 13.5 }}>
                  {member.displayName}
                </span>
              </span>
              <span className="tiny" style={{ color: member.rsvpStatus === "GOING" ? "var(--ok)" : "var(--text-3)" }}>
                {rsvpLabel(member.rsvpStatus)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MobileBoardSegment({ session }: { session: CurrentSession }) {
  return (
    <>
      <section className="m-sec">
        <div className="m-eyebrow-row">
          <span className="eyebrow">질문</span>
          <span className="tiny mono" style={{ color: "var(--text-3)" }}>
            {session.board.questions.length}
          </span>
        </div>
        <MobileQuestionList questions={session.board.questions} />
      </section>

      <section className="m-sec">
        <div className="m-eyebrow-row">
          <span className="eyebrow">한줄평</span>
          <span className="tiny mono" style={{ color: "var(--text-3)" }}>
            {session.board.oneLineReviews.length}
          </span>
        </div>
        <MobileOneLineReviewList oneLineReviews={session.board.oneLineReviews} />
      </section>

      <section className="m-sec">
        <div className="m-eyebrow-row">
          <span className="eyebrow">하이라이트</span>
          <span className="tiny mono" style={{ color: "var(--text-3)" }}>
            {session.board.highlights.length}
          </span>
        </div>
        <MobileHighlightList highlights={session.board.highlights} />
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

function MobileOneLineReviewList({ oneLineReviews }: { oneLineReviews: BoardOneLineReview[] }) {
  if (oneLineReviews.length === 0) {
    return <MobileEmptyBoardState />;
  }

  return (
    <div className="rm-current-session-mobile__card-stack">
      {oneLineReviews.map((review) => (
        <article key={`${review.authorName}-${review.text}`} className="m-card">
          <div className="body editorial rm-current-session-mobile__board-text">{review.text}</div>
          <div className="m-row" style={{ gap: 8, marginTop: 10, color: "var(--text-3)" }}>
            <AvatarChip name={review.authorName} fallbackInitial={review.authorShortName} label={review.authorName} size={24} />
            <span className="tiny">{review.authorName}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function MobileHighlightList({ highlights }: { highlights: BoardHighlight[] }) {
  if (highlights.length === 0) {
    return <MobileEmptyBoardState />;
  }

  return (
    <div className="rm-current-session-mobile__card-stack">
      {highlights.map((highlight) => (
        <article key={`${highlight.sortOrder}-${highlight.text}`} className="m-card-quiet">
          <div className="body editorial rm-current-session-mobile__board-text">{highlight.text}</div>
          <div className="tiny mono" style={{ color: "var(--text-3)", marginTop: 10 }}>
            #{highlight.sortOrder}
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

function MobileRecordsSegment({
  longReview,
  onLongReviewChange,
  longReviewSaveStatus,
  onSaveLongReview,
  canWrite,
}: {
  longReview: string;
  onLongReviewChange: (value: string) => void;
  longReviewSaveStatus: SaveState;
  onSaveLongReview: () => void;
  canWrite: boolean;
}) {
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
          <label className="label" htmlFor="mobile-long-review">
            서평 내용
          </label>
          <p className="tiny" style={{ color: "var(--text-3)", margin: "0 0 8px" }}>
            긴 기록은 아카이브에서 이어 쓸 수 있습니다.
          </p>
          <textarea
            id="mobile-long-review"
            className="m-textarea"
            rows={5}
            value={longReview}
            disabled={!canWrite}
            onChange={(event) => onLongReviewChange(event.target.value)}
            placeholder="완독 후든, 모임 이후든, 시간이 흐른 뒤에라도 이 책에 대해 남기고 싶은 문장을 천천히 적어 주세요."
          />
          <div className="rm-current-session-mobile__save-row">
            <span className="tiny" style={{ color: "var(--text-3)" }}>
              아카이브에서 이어 쓰기
            </span>
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
            {canWrite
              ? "세션 후 호스트가 피드백 문서를 업로드하면 참석자에게 열립니다."
              : "둘러보기 멤버는 피드백 문서를 읽을 수 없습니다."}
          </p>
        </div>
      </section>
    </>
  );
}

function MobileViewerRecordsSegment({ longReview, oneLineReview }: { longReview: string; oneLineReview: string }) {
  return (
    <>
      <section className="m-sec">
        <div className="m-card">
          <div className="eyebrow">보존된 서평</div>
          <div className="h4 editorial" style={{ marginTop: 6 }}>
            내 기록은 읽기 전용입니다
          </div>
          <p className="small" style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
            정식 멤버가 되면 한줄평과 서평을 새로 저장하거나 이어 쓸 수 있습니다.
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
            피드백 문서는 참석한 정식 멤버에게 열립니다. 둘러보기 상태에서는 업로드 여부와 접근 제한만 확인할 수 있어요.
          </p>
        </div>
      </section>
    </>
  );
}
