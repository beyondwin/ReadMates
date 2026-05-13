import type { KeyboardEvent, ReactNode } from "react";
import { Icon } from "@/features/current-session/ui/current-session-primitives";
import type { QuestionInput } from "@/features/current-session/ui/current-session-question-editor";
import type { CurrentSession, RsvpUpdateStatus, SaveState } from "@/features/current-session/ui/current-session-types";
import type { getCurrentSessionMemberNotice } from "@/features/current-session/model/current-session-view-model";
import { safeExternalHttpsUrl } from "@/shared/security/safe-external-url";
import { BookCover } from "@/shared/ui/book-cover";
import { formatDateLabel } from "@/shared/ui/readmates-display";
import { SessionTimingIdentity } from "@/shared/ui/session-identity";
import { MobileBoardSegment } from "./mobile-board-segment";
import { MobilePrepSegment, MobileViewerPrepSegment } from "./mobile-prep-segment";
import { MobileRecordsSegment, MobileViewerRecordsSegment } from "./mobile-records-segment";
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
          세션 기록은 읽을 수 있어요. RSVP, 진행률, 질문, 서평 작성은 정식 멤버에게 열립니다.
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
  canWrite: boolean;
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
            isSuspended={isSuspended}
            canWrite={canWrite}
          />
        </SuspendedFieldset>
      ) : null}
    </main>
  );
}
