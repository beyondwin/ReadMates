import { type CSSProperties } from "react";
import { Icon, SaveFeedback } from "@/features/current-session/components/current-session-primitives";
import type {
  BoardCheckin,
  BoardHighlight,
  BoardQuestion,
  CurrentSession,
  RsvpUpdateStatus,
  SaveState,
} from "@/features/current-session/components/current-session-types";
import { safeExternalHttpsUrl } from "@/shared/security/safe-external-url";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { formatDateLabel, rsvpLabel } from "@/shared/ui/readmates-display";

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

export function RsvpPanel({
  rsvp,
  onRsvp,
}: {
  rsvp: CurrentSession["myRsvpStatus"];
  onRsvp: (status: RsvpUpdateStatus) => void;
}) {
  return (
    <section className="surface" style={{ padding: "28px" }}>
      <div className="row-between" style={{ alignItems: "flex-start", marginBottom: "16px" }}>
        <div>
          <div className="eyebrow">
            RSVP
          </div>
          <div className="h4 editorial" style={{ marginTop: "6px" }}>
            이번 모임에 참석하시나요?
          </div>
        </div>
        <span className="tiny mono">변경 가능 · 모임 당일까지</span>
      </div>
      <div className="row" style={{ gap: "8px", flexWrap: "wrap" }}>
        {rsvpOptions.map((option) => (
          <button
            key={option.status}
            type="button"
            onClick={() => onRsvp(option.status)}
            style={{
              height: "40px",
              padding: "0 18px",
              borderRadius: "8px",
              fontSize: "14px",
              border: `1px solid ${rsvp === option.status ? "var(--accent)" : "var(--line)"}`,
              background: rsvp === option.status ? "var(--accent-soft)" : "var(--bg)",
              color: rsvp === option.status ? "var(--accent)" : "var(--text-2)",
              fontWeight: rsvp === option.status ? 500 : 400,
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}

export function CheckinPanel({
  readingProgress,
  checkinNote,
  saveStatus,
  onReadingProgressChange,
  onCheckinNoteChange,
  onSave,
}: {
  readingProgress: number;
  checkinNote: string;
  saveStatus: SaveState;
  onReadingProgressChange: (value: number) => void;
  onCheckinNoteChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <section className="surface" style={{ padding: "28px" }}>
      <div className="row-between" style={{ alignItems: "flex-start", marginBottom: "16px" }}>
        <div>
          <div className="eyebrow">
            읽기 체크인
          </div>
          <div className="h4 editorial" style={{ marginTop: "6px" }}>
            어디까지 읽으셨어요?
          </div>
        </div>
        <div className="mono tiny" style={{ color: "var(--text-3)" }}>
          {readingProgress}%
        </div>
      </div>
      <input
        aria-label="읽기 진행률"
        type="range"
        min={0}
        max={100}
        value={readingProgress}
        onChange={(event) => onReadingProgressChange(Number(event.target.value))}
        style={{ width: "100%", accentColor: "var(--accent)" }}
      />
      <textarea
        aria-label="체크인 메모"
        className="textarea"
        rows={3}
        value={checkinNote}
        onChange={(event) => onCheckinNoteChange(event.target.value)}
        placeholder="멈춘 장면이나 떠오른 질문이 있다면 짧게 기록해 주세요."
        style={{ marginTop: "14px" }}
      />
      <div className="row-between" style={{ marginTop: "12px" }}>
        <p className="marginalia" style={{ margin: 0 }}>
          ※ 체크인은 다른 멤버에게도 보입니다.
        </p>
        <div className="row" style={{ gap: "10px", justifyContent: "flex-end" }}>
          <SaveFeedback scope="checkin" status={saveStatus} />
          <button type="button" className="btn btn-primary btn-sm" disabled={saveStatus === "saving"} onClick={onSave}>
            체크인 저장
          </button>
        </div>
      </div>
    </section>
  );
}

export function OneLineReviewPanel({
  oneLineReview,
  saveStatus,
  onChange,
  onSave,
}: {
  oneLineReview: string;
  saveStatus: SaveState;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <section className="surface" style={{ padding: "24px" }}>
      <div className="row-between" style={{ alignItems: "flex-start", marginBottom: "14px" }}>
        <div>
          <div className="eyebrow">한줄평</div>
          <h2 className="h4 editorial" style={{ margin: "4px 0 0" }}>
            이 책을 한 문장으로
          </h2>
        </div>
        <span className="badge">언제든 작성 가능</span>
      </div>
      <input
        aria-label="한줄평 내용"
        className="input"
        value={oneLineReview}
        onChange={(event) => onChange(event.target.value)}
        placeholder="예: 떠난 자리에 남은 온기를 만지는 책."
      />
      <div className="row-between" style={{ marginTop: "10px" }}>
        <div className="tiny" style={{ color: "var(--text-3)" }}>
          모임 종료 후 공개 · 이전까지는 본인만 볼 수 있어요
        </div>
        <div className="row" style={{ gap: "10px", justifyContent: "flex-end" }}>
          <SaveFeedback scope="oneLineReview" status={saveStatus} />
          <button type="button" className="btn btn-primary btn-sm" disabled={saveStatus === "saving"} onClick={onSave}>
            한줄평 저장
          </button>
        </div>
      </div>
    </section>
  );
}

export function LongReviewPanel({
  longReview,
  saveStatus,
  onChange,
  onSave,
}: {
  longReview: string;
  saveStatus: SaveState;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <section className="surface" style={{ padding: "28px" }}>
      <div className="row-between" style={{ alignItems: "flex-start", marginBottom: "14px" }}>
        <div>
          <div className="eyebrow">모임 이후 · 서평</div>
          <h2 className="h4 editorial" style={{ margin: "4px 0 0" }}>
            이 책에 남기고 싶은 글
          </h2>
        </div>
        <span className="badge">언제든 작성 가능</span>
      </div>
      <textarea
        aria-label="서평 내용"
        className="textarea"
        rows={4}
        value={longReview}
        onChange={(event) => onChange(event.target.value)}
        placeholder="완독 후든, 모임 이후든, 시간이 흐른 뒤에라도 — 이 책에 대해 남기고 싶은 문장을 천천히 적어 주세요."
      />
      <div className="row-between" style={{ marginTop: "12px" }}>
        <div className="small" style={{ color: "var(--text-3)" }}>
          저장하면 아카이브에서 이어 쓸 수 있어요
        </div>
        <div className="row" style={{ gap: "10px", justifyContent: "flex-end" }}>
          <SaveFeedback scope="longReview" status={saveStatus} />
          <button type="button" className="btn btn-primary btn-sm" disabled={saveStatus === "saving"} onClick={onSave}>
            서평 저장
          </button>
        </div>
      </div>
    </section>
  );
}

export function MyStatusCard({
  rsvp,
  readingProgress,
  writtenQuestionCount,
}: {
  rsvp: CurrentSession["myRsvpStatus"];
  readingProgress: number;
  writtenQuestionCount: number;
}) {
  const items = [
    { label: "RSVP", value: rsvpLabel(rsvp), ok: rsvp === "GOING" },
    { label: "읽기", value: readingProgress >= 100 ? "완독" : `${readingProgress}%`, ok: readingProgress >= 100 },
    { label: "질문", value: `${writtenQuestionCount}/5`, ok: writtenQuestionCount >= 2 },
  ];

  return (
    <div className="surface" style={{ padding: "22px" }}>
      <div className="eyebrow" style={{ marginBottom: "14px" }}>
        내 상태
      </div>
      <div className="stack" style={{ "--stack": "12px" } as CSSProperties}>
        {items.map((item) => (
          <div key={item.label} className="row-between">
            <span className="small">{item.label}</span>
            <span className="row" style={{ gap: "8px" }}>
              <span className="body" style={{ fontSize: "14px", fontWeight: 500, color: item.ok ? "var(--ok)" : "var(--text)" }}>
                {item.value}
              </span>
              <span
                aria-hidden="true"
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "999px",
                  background: item.ok ? "var(--ok)" : "var(--text-4)",
                }}
              />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SessionMeta({ session }: { session: CurrentSession }) {
  const meetingUrl = safeExternalHttpsUrl(session.meetingUrl);

  return (
    <div className="surface-quiet" style={{ padding: "22px" }}>
      <div className="eyebrow" style={{ marginBottom: "14px" }}>
        세션 정보
      </div>
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          columnGap: "14px",
          rowGap: "8px",
          margin: 0,
        }}
      >
        <dt className="eyebrow">날짜</dt>
        <dd style={{ margin: 0 }}>{formatDateLabel(session.date)}</dd>
        <dt className="eyebrow">시간</dt>
        <dd style={{ margin: 0 }}>
          {session.startTime} – {session.endTime}
        </dd>
        <dt className="eyebrow">장소</dt>
        <dd style={{ margin: 0 }}>{session.locationLabel}</dd>
        {meetingUrl ? (
          <>
            <dt className="eyebrow">모임 링크</dt>
            <dd style={{ margin: 0 }}>
              <a className="btn btn-ghost btn-sm" href={meetingUrl} target="_blank" rel="noreferrer">
                미팅 입장
              </a>
              {session.meetingPasscode ? (
                <div className="tiny mono" style={{ marginTop: "6px" }}>
                  Passcode {session.meetingPasscode}
                </div>
              ) : null}
            </dd>
          </>
        ) : null}
        <dt className="eyebrow">기록</dt>
        <dd style={{ margin: 0 }}>음성만 · 자동 정리 참고용</dd>
      </dl>
      <hr className="divider-soft" style={{ margin: "14px 0" }} />
      <div className="row" style={{ gap: "8px" }}>
        <Icon name="mic" size={14} style={{ color: "var(--text-3)" }} />
        <span className="tiny" style={{ color: "var(--text-3)" }}>
          원치 않으시면 모임 중 언제든 말씀해 주세요.
        </span>
      </div>
    </div>
  );
}

export function RosterList({ session }: { session: CurrentSession }) {
  const attendees = activeAttendees(session);

  return (
    <section className="surface" style={{ padding: "22px" }}>
      <div className="row-between" style={{ marginBottom: "12px" }}>
        <div className="eyebrow">
          참석자 · {goingCount(session)}/{attendees.length}
        </div>
      </div>
      <div className="stack" style={{ "--stack": "10px" } as CSSProperties}>
        {attendees.map((member) => (
          <div
            key={member.membershipId}
            className="row-between"
            style={{ opacity: member.rsvpStatus === "NO_RESPONSE" ? 0.55 : 1 }}
          >
            <span className="row" style={{ gap: "10px" }}>
              <AvatarChip name={member.displayName} fallbackInitial={member.shortName} label={member.displayName} rsvpStatus={member.rsvpStatus} size={24} />
              <span className="body" style={{ fontSize: "13.5px" }}>
                {member.displayName}
                {member.role === "HOST" ? (
                  <span className="tiny mono" style={{ marginLeft: "6px" }}>
                    호스트
                  </span>
                ) : null}
              </span>
            </span>
            <span className="tiny" style={{ color: member.rsvpStatus === "GOING" ? "var(--ok)" : "var(--text-3)" }}>
              {rsvpLabel(member.rsvpStatus)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyBoardState() {
  return (
    <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
      아직 공유된 기록이 없습니다.
    </p>
  );
}

export function BoardQuestions({ questions }: { questions: BoardQuestion[] }) {
  if (questions.length === 0) {
    return <EmptyBoardState />;
  }

  return (
    <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
      {questions.map((question, index) => (
        <article
          key={`${question.priority}-${question.authorName}-${question.text}`}
          style={{
            padding: "26px 28px",
            background: "var(--bg)",
            borderTop: index === 0 ? "1px solid var(--line)" : "1px solid var(--line-soft)",
            borderLeft: "1px solid var(--line)",
            borderRight: "1px solid var(--line)",
            borderBottom: index === questions.length - 1 ? "1px solid var(--line)" : "none",
            borderRadius: index === 0 ? "10px 10px 0 0" : index === questions.length - 1 ? "0 0 10px 10px" : 0,
          }}
        >
          <div className="row-between" style={{ alignItems: "flex-start", marginBottom: "12px" }}>
            <div className="row" style={{ gap: "10px", flexWrap: "wrap" }}>
              <AvatarChip name={question.authorName} fallbackInitial={question.authorShortName} label={question.authorName} size={24} />
              <span className="body" style={{ fontSize: "14px", fontWeight: 500 }}>
                {question.authorName}
              </span>
            </div>
            <span className="badge badge-accent">Q{question.priority}</span>
          </div>
          <div className="body editorial" style={{ fontSize: "18px", lineHeight: 1.5, color: "var(--text)" }}>
            {question.text}
          </div>
          {question.draftThought ? (
            <details style={{ marginTop: "14px" }}>
              <summary style={{ listStyle: "none", cursor: "pointer" }}>
                <span className="small row" style={{ color: "var(--accent)", gap: "4px", display: "inline-flex" }}>
                  초안 생각 펼치기 <Icon name="chevron-down" size={12} />
                </span>
              </summary>
              <div
                style={{
                  marginTop: "10px",
                  padding: "12px 14px",
                  background: "var(--bg-sub)",
                  borderLeft: "2px solid var(--accent)",
                }}
              >
                <span className="small" style={{ color: "var(--text-2)" }}>
                  {question.draftThought}
                </span>
              </div>
            </details>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function BoardCheckins({ checkins }: { checkins: BoardCheckin[] }) {
  if (checkins.length === 0) {
    return <EmptyBoardState />;
  }

  return (
    <div className="grid-2">
      {checkins.map((checkin) => (
        <article
          key={`${checkin.authorName}-${checkin.note}`}
          style={{ padding: "22px", background: "var(--bg)", border: "1px solid var(--line-soft)", borderRadius: "10px" }}
        >
          <div className="row-between" style={{ alignItems: "flex-start", marginBottom: "12px" }}>
            <div className="row" style={{ gap: "10px" }}>
              <AvatarChip name={checkin.authorName} fallbackInitial={checkin.authorShortName} label={checkin.authorName} size={22} />
              <span className="body" style={{ fontSize: "13.5px", fontWeight: 500 }}>
                {checkin.authorName}
              </span>
            </div>
          </div>
          <div className="row" style={{ gap: "12px", marginBottom: "10px", alignItems: "center" }}>
            <span className="mono" style={{ fontSize: "20px", fontWeight: 500, letterSpacing: "-0.02em", width: "60px" }}>
              {checkin.readingProgress}%
            </span>
            <span
              aria-hidden
              style={{
                height: "6px",
                flex: 1,
                borderRadius: "999px",
                background: "var(--line-soft)",
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  display: "block",
                  width: `${checkin.readingProgress}%`,
                  height: "100%",
                  background: checkin.readingProgress >= 100 ? "var(--ok)" : "var(--accent)",
                }}
              />
            </span>
          </div>
          <div className="small" style={{ color: "var(--text-2)" }}>
            {checkin.note}
          </div>
        </article>
      ))}
    </div>
  );
}

export function BoardHighlights({ highlights }: { highlights: BoardHighlight[] }) {
  if (highlights.length === 0) {
    return <EmptyBoardState />;
  }

  return (
    <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
      {highlights.map((highlight, index) => (
        <article
          key={`${highlight.sortOrder}-${highlight.text}`}
          style={{ padding: "28px 0", borderTop: index === 0 ? "1px solid var(--line)" : "1px solid var(--line-soft)" }}
        >
          <div className="quote editorial" style={{ fontSize: "20px", maxWidth: "780px" }}>
            {highlight.text}
          </div>
          <div className="row" style={{ marginTop: "12px", gap: "10px" }}>
            <span className="small mono">#{highlight.sortOrder}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
