import { Icon, SaveFeedback } from "@/features/current-session/ui/current-session-primitives";
import { QuestionEditor, type QuestionInput } from "@/features/current-session/ui/current-session-question-editor";
import { MAX_QUESTION_INPUT_COUNT } from "@/features/current-session/model/current-session-form-model";
import type { CurrentSession, RsvpUpdateStatus, SaveState } from "@/features/current-session/ui/current-session-types";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { formatDateLabel, formatDeadlineLabel, rsvpLabel } from "@/shared/ui/readmates-display";

const rsvpOptions: Array<{ status: RsvpUpdateStatus; label: string }> = [
  { status: "GOING", label: "참석" },
  { status: "MAYBE", label: "아직 미정" },
  { status: "DECLINED", label: "불참" },
];

function activeAttendees(session: CurrentSession) {
  return session.attendees.filter((attendee) => (attendee.participationStatus ?? "ACTIVE") === "ACTIVE");
}

function goingCount(session: CurrentSession) {
  return activeAttendees(session).filter((attendee) => attendee.rsvpStatus === "GOING").length;
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

export function MobileViewerPrepSegment({
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
            기록은 읽을 수 있고, 새 참여 기록은 정식 멤버만 남길 수 있습니다
          </div>
          <p className="small" style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
            둘러보기 멤버는 기존 기록과 공동 보드를 읽기 전용으로 확인합니다.
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

export function MobilePrepSegment({
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
      ok: writtenQuestionCount > 0,
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
              녹음을 원하지 않으면 모임 중 언제든 알려 주세요.
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
                <AvatarChip name={member.displayName} fallbackInitial={member.displayName} label={member.displayName} rsvpStatus={member.rsvpStatus} size={24} />
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
