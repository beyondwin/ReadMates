import { type FormEvent, useId, useMemo, useState } from "react";
import {
  applyScheduleDefaults,
  scheduleTimeHint,
  type HostScheduleFormValues,
  type HostSessionScheduleDefaults,
} from "@/features/host/model/host-schedule-defaults-model";
import {
  DEFAULT_UPCOMING_ACCESS_SCOPE,
  draftsByDate,
  memberVisibilityLabel,
  type UpcomingBookCreateInput,
  type UpcomingBookListItem,
} from "@/features/host/model/upcoming-book-list-model";
import type { SessionAccessScope } from "@/features/host/model/session-exposure-model";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";

export type UpcomingBookListProps = {
  items: readonly UpcomingBookListItem[];
  onSaveAccessScope: (input: { sessionId: string; accessScope: SessionAccessScope }) => void | Promise<void>;
  onCreateSession: (input: UpcomingBookCreateInput) => void | Promise<void>;
  pending?: boolean;
  defaultAccessScope?: SessionAccessScope;
  scheduleDefaults?: HostSessionScheduleDefaults | null;
  compact?: boolean;
};

function blankForm(accessScope: SessionAccessScope): HostScheduleFormValues {
  return {
    bookTitle: "",
    bookAuthor: "",
    date: "",
    startTime: "",
    endTime: "",
    locationLabel: "",
    meetingUrl: "",
    meetingPasscode: "",
    accessScope,
  };
}

export function UpcomingBookList({
  items,
  onSaveAccessScope,
  onCreateSession,
  pending = false,
  defaultAccessScope = DEFAULT_UPCOMING_ACCESS_SCOPE,
  scheduleDefaults = null,
  compact = false,
}: UpcomingBookListProps) {
  const headingId = useId();
  const titleId = useId();
  const authorId = useId();
  const dateId = useId();
  const timeId = useId();
  const visibilityId = useId();
  const drafts = draftsByDate(items);
  const [expanded, setExpanded] = useState(false);
  const [accessScopeTouched, setAccessScopeTouched] = useState(false);
  const [draft, setDraft] = useState<HostScheduleFormValues>(() => blankForm(defaultAccessScope));
  const [error, setError] = useState<string | null>(null);
  const timeHint = scheduleDefaults ? scheduleTimeHint(scheduleDefaults) : null;
  const form = useMemo(() => {
    if (!scheduleDefaults) {
      return draft;
    }
    return {
      ...applyScheduleDefaults(draft, scheduleDefaults),
      accessScope: accessScopeTouched ? draft.accessScope : scheduleDefaults.accessScope,
    };
  }, [accessScopeTouched, draft, scheduleDefaults]);

  function expandForm() {
    setError(null);
    setAccessScopeTouched(false);
    setDraft(blankForm(scheduleDefaults?.accessScope ?? defaultAccessScope));
    setExpanded((open) => !open);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const bookTitle = form.bookTitle.trim();
    const bookAuthor = form.bookAuthor.trim();
    if (!bookTitle || !bookAuthor || !form.date) {
      return;
    }
    setError(null);
    try {
      await onCreateSession({
        bookTitle,
        bookAuthor,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        locationLabel: form.locationLabel,
        meetingUrl: form.meetingUrl,
        meetingPasscode: form.meetingPasscode,
        accessScope: form.accessScope,
        questionDeadlineOffsetDays: scheduleDefaults?.questionDeadlineOffsetDays ?? 1,
      });
      setExpanded(false);
      setAccessScopeTouched(false);
      setDraft(blankForm(scheduleDefaults?.accessScope ?? defaultAccessScope));
    } catch {
      setError("모임을 넣지 못했습니다.");
    }
  }

  return (
    <section
      className={`rm-upcoming-book-list${compact ? " rm-upcoming-book-list--compact" : ""}`}
      aria-labelledby={headingId}
    >
      <div className="container">
        <div className="rm-upcoming-book-list__header">
          <p className="eyebrow" style={{ margin: 0 }}>다음</p>
          <h2 id={headingId} className="h3 editorial" style={{ margin: "8px 0 0" }}>
            다음에 읽을 책
          </h2>
        </div>

        <ul className="rm-upcoming-book-list__items" aria-labelledby={headingId}>
          {drafts.map((item) => {
            const visibleToMembers = item.accessScope === "GUEST_READABLE";
            return (
              <li key={item.sessionId} className="rm-upcoming-book-list__row">
                <div className="rm-upcoming-book-list__copy">
                  <div className="body editorial">{item.bookTitle}</div>
                  <div className="tiny" style={{ marginTop: 4 }}>
                    <time dateTime={item.date}>{formatDateOnlyLabel(item.date)}</time>
                  </div>
                </div>
                <label className="rm-upcoming-book-list__visibility">
                  <span className="tiny">{memberVisibilityLabel(item.accessScope)}</span>
                  <span className="rm-upcoming-book-list__switch">
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label={`${item.bookTitle} 멤버에게 보이기`}
                      checked={visibleToMembers}
                      disabled={pending}
                      onChange={(event) => {
                        void onSaveAccessScope({
                          sessionId: item.sessionId,
                          accessScope: event.currentTarget.checked ? "GUEST_READABLE" : "HOST_ONLY",
                        });
                      }}
                    />
                    <span className="rm-upcoming-book-list__track" aria-hidden="true">
                      <span className="rm-upcoming-book-list__thumb" />
                    </span>
                  </span>
                  <span>멤버에게 보이기</span>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="rm-upcoming-book-list__footer">
          <button
            type="button"
            className="btn btn-primary"
            aria-expanded={expanded}
            disabled={pending}
            onClick={expandForm}
          >
            모임 하나 더
          </button>

          {expanded ? (
            <form className="rm-upcoming-book-list__form" onSubmit={(event) => void handleCreate(event)}>
              <div className="grid-2">
                <div>
                  <label className="label" htmlFor={titleId}>책 제목</label>
                  <input
                    id={titleId}
                    className="input"
                    value={form.bookTitle}
                    required
                    autoComplete="off"
                    disabled={pending}
                    onChange={(event) => setDraft((current) => ({ ...current, bookTitle: event.target.value }))}
                  />
                </div>
                <div>
                  <label className="label" htmlFor={authorId}>저자</label>
                  <input
                    id={authorId}
                    className="input"
                    value={form.bookAuthor}
                    required
                    autoComplete="off"
                    disabled={pending}
                    onChange={(event) => setDraft((current) => ({ ...current, bookAuthor: event.target.value }))}
                  />
                </div>
              </div>
              <div className="grid-2">
                <div>
                  <label className="label" htmlFor={dateId}>모임 날짜</label>
                  <input
                    id={dateId}
                    className="input"
                    type="date"
                    value={form.date}
                    required
                    disabled={pending}
                    onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
                  />
                </div>
                <div>
                  <label className="label" htmlFor={timeId}>시작 시간</label>
                  <input
                    id={timeId}
                    className="input"
                    type="time"
                    value={form.startTime}
                    disabled={pending}
                    onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))}
                  />
                  {timeHint ? (
                    <p className="tiny" style={{ marginTop: "6px", color: "var(--text-3)" }}>
                      {timeHint}
                    </p>
                  ) : null}
                </div>
              </div>
              <label className="rm-upcoming-book-list__visibility" htmlFor={visibilityId}>
                <span>멤버에게 보이기</span>
                <span className="rm-upcoming-book-list__switch">
                  <input
                    id={visibilityId}
                    type="checkbox"
                    role="switch"
                    aria-label="새 모임 멤버에게 보이기"
                    checked={form.accessScope === "GUEST_READABLE"}
                    disabled={pending}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setAccessScopeTouched(true);
                      setDraft((current) => ({
                        ...current,
                        accessScope: checked ? "GUEST_READABLE" : "HOST_ONLY",
                      }));
                    }}
                  />
                  <span className="rm-upcoming-book-list__track" aria-hidden="true">
                    <span className="rm-upcoming-book-list__thumb" />
                  </span>
                </span>
              </label>
              {error ? (
                <p className="small" role="alert" style={{ margin: 0, color: "var(--danger)" }}>
                  {error}
                </p>
              ) : null}
              <div>
                <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
                  목록에 넣기
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </section>
  );
}
