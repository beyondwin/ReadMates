import type { ReactNode } from "react";
import { Icon, SaveFeedback } from "@/features/current-session/components/current-session-primitives";
import { QuestionEditor, type QuestionInput } from "@/features/current-session/components/current-session-question-editor";
import type {
  BoardCheckin,
  BoardHighlight,
  BoardQuestion,
  CurrentSession,
  RsvpUpdateStatus,
  SaveState,
} from "@/features/current-session/components/current-session-types";
import { SUSPENDED_MEMBER_NOTICE } from "@/features/current-session/components/current-session-types";
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
  checkinNote,
  onCheckinNoteChange,
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
  onOneLineReviewChange,
  checkinSaveStatus,
  questionSaveStatus,
  longReviewSaveStatus,
  oneLineReviewSaveStatus,
  onRsvpChange,
  mobileTab,
  onMobileTabChange,
  onSaveCheckin,
  onSaveLongReview,
  onSaveOneLineReview,
  isSuspended,
  isViewer,
  canWrite,
}: {
  session: CurrentSession;
  rsvp: CurrentSession["myRsvpStatus"];
  readingProgress: number;
  onReadingProgressChange: (value: number) => void;
  checkinNote: string;
  onCheckinNoteChange: (value: string) => void;
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
  onOneLineReviewChange: (value: string) => void;
  checkinSaveStatus: SaveState;
  questionSaveStatus: SaveState;
  longReviewSaveStatus: SaveState;
  oneLineReviewSaveStatus: SaveState;
  onRsvpChange: (status: RsvpUpdateStatus) => void;
  mobileTab: MobileSessionTab;
  onMobileTabChange: (tab: MobileSessionTab) => void;
  onSaveCheckin: () => void;
  onSaveLongReview: () => void;
  onSaveOneLineReview: () => void;
  isSuspended: boolean;
  isViewer: boolean;
  canWrite: boolean;
}) {
  const tabs: Array<{ key: MobileSessionTab; label: string }> = [
    { key: "prep", label: "내 준비" },
    { key: "board", label: "공동 보드" },
    { key: "after", label: "내 기록" },
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
      </section>

      <div className="rm-current-session-mobile__seg-wrap">
        <div className="m-seg" aria-label="세션 보기">
          {tabs.map((tab) => (
            <button
              key={tab.key}
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

      {isSuspended ? <MobileSuspendedMemberNotice /> : null}
      {isViewer ? <MobileViewerMemberNotice /> : null}

      {mobileTab === "prep" ? (
        <SuspendedFieldset disabled={!canWrite}>
          <MobilePrepSegment
            session={session}
            rsvp={rsvp}
            readingProgress={readingProgress}
            onReadingProgressChange={onReadingProgressChange}
            checkinNote={checkinNote}
            onCheckinNoteChange={onCheckinNoteChange}
            questionInputs={questionInputs}
            questionValidationMessage={questionValidationMessage}
            onQuestionChange={onQuestionChange}
            onAddQuestion={onAddQuestion}
            onRemoveQuestion={onRemoveQuestion}
            onSaveQuestions={onSaveQuestions}
            writtenQuestionCount={writtenQuestionCount}
            checkinSaveStatus={checkinSaveStatus}
            questionSaveStatus={questionSaveStatus}
            onRsvpChange={onRsvpChange}
            onSaveCheckin={onSaveCheckin}
            canWrite={canWrite}
          />
        </SuspendedFieldset>
      ) : null}
      {mobileTab === "board" ? <MobileBoardSegment session={session} /> : null}
      {mobileTab === "after" ? (
        <SuspendedFieldset disabled={!canWrite}>
          <MobileRecordsSegment
            longReview={longReview}
            onLongReviewChange={onLongReviewChange}
            oneLineReview={oneLineReview}
            onOneLineReviewChange={onOneLineReviewChange}
            longReviewSaveStatus={longReviewSaveStatus}
            oneLineReviewSaveStatus={oneLineReviewSaveStatus}
            onSaveLongReview={onSaveLongReview}
            onSaveOneLineReview={onSaveOneLineReview}
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

function MobileSuspendedMemberNotice() {
  return (
    <section className="m-sec">
      <div className="m-card-quiet" role="note" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
        <p className="small" style={{ margin: 0 }}>
          {SUSPENDED_MEMBER_NOTICE}
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
          전체 세션은 읽을 수 있어요. 참여와 피드백 문서는 정식 멤버에게 열립니다.
        </p>
      </div>
    </section>
  );
}

function MobilePrepSegment({
  session,
  rsvp,
  readingProgress,
  onReadingProgressChange,
  checkinNote,
  onCheckinNoteChange,
  questionInputs,
  questionValidationMessage,
  onQuestionChange,
  onAddQuestion,
  onRemoveQuestion,
  onSaveQuestions,
  writtenQuestionCount,
  checkinSaveStatus,
  questionSaveStatus,
  onRsvpChange,
  onSaveCheckin,
  canWrite,
}: {
  session: CurrentSession;
  rsvp: CurrentSession["myRsvpStatus"];
  readingProgress: number;
  onReadingProgressChange: (value: number) => void;
  checkinNote: string;
  onCheckinNoteChange: (value: string) => void;
  questionInputs: QuestionInput[];
  questionValidationMessage: string;
  onQuestionChange: (index: number, value: string) => void;
  onAddQuestion: () => void;
  onRemoveQuestion: (index: number) => void;
  onSaveQuestions: () => void;
  writtenQuestionCount: number;
  checkinSaveStatus: SaveState;
  questionSaveStatus: SaveState;
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
            {rsvpOptions.map((option) => (
              <button
                key={option.status}
                type="button"
                className={`m-chip${rsvp === option.status ? " is-on" : ""}`}
                disabled={!canWrite}
                aria-disabled={!canWrite}
                onClick={() => onRsvpChange(option.status)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="tiny" style={{ color: "var(--text-3)", marginTop: 12 }}>
            {rsvpLabel(rsvp)} · 질문 제출 마감 {formatDeadlineLabel(session.questionDeadlineAt)}
          </div>
        </div>
      </section>

      <section className="m-sec">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          읽기 체크인
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
              다른 멤버에게도 보여요
            </span>
          </div>
          <input
            aria-label="읽기 진행률"
            type="range"
            min={0}
            max={100}
            value={readingProgress}
            className="m-range"
            disabled={!canWrite}
            onChange={(event) => onReadingProgressChange(Number(event.target.value))}
            style={{ marginTop: 14 }}
          />
          <textarea
            aria-label="체크인 메모"
            className="m-textarea"
            rows={3}
            value={checkinNote}
            disabled={!canWrite}
            onChange={(event) => onCheckinNoteChange(event.target.value)}
            placeholder="멈춘 장면이나 떠오른 질문이 있다면 짧게 기록해 주세요."
            style={{ marginTop: 14 }}
          />
          <div className="rm-current-session-mobile__save-row">
            <SaveFeedback scope="checkin" status={checkinSaveStatus} />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!canWrite || checkinSaveStatus === "saving"}
              aria-disabled={!canWrite || checkinSaveStatus === "saving"}
              onClick={onSaveCheckin}
            >
              체크인 저장
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
    { label: "질문", value: `${writtenQuestionCount}/5`, ok: writtenQuestionCount >= 2 },
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
            <div key={member.membershipId} className="m-row-between" style={{ opacity: member.rsvpStatus === "NO_RESPONSE" ? 0.55 : 1 }}>
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
          <span className="eyebrow">읽기 흔적</span>
          <span className="tiny mono" style={{ color: "var(--text-3)" }}>
            {session.board.checkins.length}
          </span>
        </div>
        <MobileCheckinList checkins={session.board.checkins} />
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

function MobileCheckinList({ checkins }: { checkins: BoardCheckin[] }) {
  if (checkins.length === 0) {
    return <MobileEmptyBoardState />;
  }

  return (
    <div className="m-list">
      {checkins.map((checkin) => (
        <div key={`${checkin.authorName}-${checkin.note}`} className="m-list-row rm-current-session-mobile__checkin-row">
          <AvatarChip name={checkin.authorName} fallbackInitial={checkin.authorShortName} label={checkin.authorName} size={28} />
          <div style={{ minWidth: 0 }}>
            <div className="m-row-between" style={{ gap: 10 }}>
              <span className="body" style={{ fontSize: 14, fontWeight: 500 }}>
                {checkin.authorName}
              </span>
              <span className="tiny mono" style={{ color: "var(--text-3)" }}>
                {checkin.readingProgress}%
              </span>
            </div>
            <div className="m-progress" style={{ marginTop: 7 }}>
              <span style={{ width: `${checkin.readingProgress}%` }} />
            </div>
            <div className="tiny rm-current-session-mobile__line-clamp">{checkin.note}</div>
          </div>
        </div>
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
  oneLineReview,
  onOneLineReviewChange,
  longReviewSaveStatus,
  oneLineReviewSaveStatus,
  onSaveLongReview,
  onSaveOneLineReview,
  canWrite,
}: {
  longReview: string;
  onLongReviewChange: (value: string) => void;
  oneLineReview: string;
  onOneLineReviewChange: (value: string) => void;
  longReviewSaveStatus: SaveState;
  oneLineReviewSaveStatus: SaveState;
  onSaveLongReview: () => void;
  onSaveOneLineReview: () => void;
  canWrite: boolean;
}) {
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
          <input
            aria-label="한줄평 내용"
            className="m-input"
            value={oneLineReview}
            disabled={!canWrite}
            onChange={(event) => onOneLineReviewChange(event.target.value)}
            placeholder="예: 떠난 자리에 남은 온기를 만지는 책."
          />
          <div className="rm-current-session-mobile__save-row">
            <span className="tiny" style={{ color: "var(--text-3)" }}>
              모임 종료 후 공개 · 이전까지는 본인만
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
          <textarea
            aria-label="서평 내용"
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
    </>
  );
}
