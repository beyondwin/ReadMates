import type { KeyboardEvent, ReactNode } from "react";
import { Icon } from "@/features/current-session/ui/current-session-primitives";
import type { QuestionInput } from "@/features/current-session/ui/current-session-question-editor";
import type { CurrentSession, RsvpStatus, RsvpUpdateStatus, SaveState } from "@/features/current-session/ui/current-session-types";
import type {
  CurrentSessionReadingLoopSummary,
  getCurrentSessionMemberNotice,
} from "@/features/current-session/model/current-session-view-model";
import { safeExternalHttpsUrl } from "@/shared/security/safe-external-url";
import { BookCover } from "@/shared/ui/book-cover";
import { formatDateLabel } from "@/shared/ui/readmates-display";
import { SessionTimingIdentity } from "@/shared/ui/session-identity";
import { MobileBoardSegment } from "./mobile-board-segment";
import { MobilePrepSegment } from "./mobile-prep-segment";
import { MobileRecordsSegment } from "./mobile-records-segment";
import type { MobileSessionTab } from "./mobile-session-tabs";

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

function ReadOnlyFieldset({ disabled, children }: { disabled: boolean; children: ReactNode }) {
  return (
    <fieldset
      disabled={disabled}
      aria-describedby={disabled ? "mobile-current-session-read-only-note" : undefined}
      style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
    >
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

function MobileReadOnlyNotice({ message }: { message: string }) {
  return (
    <section className="m-sec">
      <div className="m-card-quiet" role="note" id="mobile-current-session-read-only-note">
        <div className="eyebrow">읽기 전용</div>
        <p className="small" style={{ margin: "6px 0 0" }}>
          {message}
        </p>
      </div>
    </section>
  );
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
  onOneLineReviewChange,
  checkinSaveStatus,
  questionSaveStatus,
  longReviewSaveStatus,
  oneLineReviewSaveStatus,
  rsvpSaveStatus,
  onRsvpChange,
  mobileTab,
  onMobileTabChange,
  onSaveCheckin,
  onSaveLongReview,
  onSaveOneLineReview,
  memberNotice,
  canWrite,
  canReadFeedback,
  isViewer,
  readingLoopSummary,
}: {
  session: CurrentSession;
  rsvp: RsvpStatus;
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
  onOneLineReviewChange: (value: string) => void;
  checkinSaveStatus: SaveState;
  questionSaveStatus: SaveState;
  longReviewSaveStatus: SaveState;
  oneLineReviewSaveStatus: SaveState;
  rsvpSaveStatus: SaveState;
  onRsvpChange: (status: RsvpUpdateStatus) => void;
  mobileTab: MobileSessionTab;
  onMobileTabChange: (tab: MobileSessionTab) => void;
  onSaveCheckin: () => void;
  onSaveLongReview: () => void;
  onSaveOneLineReview: () => void;
  memberNotice: ReturnType<typeof getCurrentSessionMemberNotice>;
  canWrite: boolean;
  canReadFeedback: boolean;
  isViewer: boolean;
  readingLoopSummary: CurrentSessionReadingLoopSummary;
}) {
  const tabs: Array<{ key: MobileSessionTab; label: string }> = [
    { key: "prep", label: "내 준비" },
    { key: "after", label: "내 기록" },
    { key: "board", label: "공동 보드" },
  ];
  const meetingUrl = safeExternalHttpsUrl(session.meetingUrl);
  const isSuspended = memberNotice?.kind === "suspended";

  return (
    <main className="mobile-only rm-current-session-mobile m-body" data-testid="current-session-mobile">
      <section className="rm-current-session-mobile__hero">
        <div className="m-row rm-current-session-mobile__hero-row">
          <div className="rm-current-session-mobile__hero-copy">
            <SessionTimingIdentity sessionNumber={session.sessionNumber} date={session.date} phaseLabel="이번 세션" />
            <h1 className="h2 editorial rm-current-session-mobile__title">{session.bookTitle}</h1>
            <div className="tiny" style={{ color: "var(--text-2)" }}>
              {session.bookAuthor}
            </div>
            <div className="tiny mono rm-current-session-mobile__meta-line">
              {formatDateLabel(session.date)} · {session.startTime} – {session.endTime}
              {session.locationLabel ? ` · ${session.locationLabel}` : ""}
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

      <section className="m-sec" role="status">
        <div className="m-card-quiet">
          <div className="eyebrow">{readingLoopSummary.label}</div>
          <p className="small" style={{ color: "var(--text-2)", margin: "6px 0 0" }}>
            {readingLoopSummary.body}
          </p>
        </div>
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
      {!canWrite ? <MobileReadOnlyNotice message={memberNotice?.message ?? "현재 세션은 읽기 전용입니다."} /> : null}

      {mobileTab === "prep" ? (
        <ReadOnlyFieldset disabled={!canWrite}>
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
        </ReadOnlyFieldset>
      ) : null}
      {mobileTab === "board" ? <MobileBoardSegment session={session} /> : null}
      {mobileTab === "after" ? (
        <ReadOnlyFieldset disabled={!canWrite}>
          <MobileRecordsSegment
            longReview={longReview}
            onLongReviewChange={onLongReviewChange}
            oneLineReview={oneLineReview}
            onOneLineReviewChange={onOneLineReviewChange}
            longReviewSaveStatus={longReviewSaveStatus}
            oneLineReviewSaveStatus={oneLineReviewSaveStatus}
            onSaveLongReview={onSaveLongReview}
            onSaveOneLineReview={onSaveOneLineReview}
            isViewer={isViewer}
            isSuspended={isSuspended}
            canWrite={canWrite}
            canReadFeedback={canReadFeedback}
          />
        </ReadOnlyFieldset>
      ) : null}
    </main>
  );
}
