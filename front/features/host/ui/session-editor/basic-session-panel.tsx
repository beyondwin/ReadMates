import { memo, useRef, useState, type CSSProperties } from "react";
import type { PreviousOnlineMeeting } from "@/features/host/model/host-schedule-defaults-model";
import { BookCover } from "@/shared/ui/book-cover";
import { PreviousOnlineMeetingDialog } from "./previous-online-meeting-dialog";

export type BasicSessionPanelField =
  | "title"
  | "bookTitle"
  | "bookAuthor"
  | "date"
  | "time"
  | "locationLabel"
  | "meetingUrl"
  | "meetingPasscode";

export const BasicSessionPanel = memo(function BasicSessionPanel({
  title,
  bookTitle,
  bookAuthor,
  bookLink,
  bookImageUrl,
  date,
  time,
  deadline,
  timeHint,
  locationLabel,
  meetingUrl,
  meetingPasscode,
  onTitleChange,
  onBookTitleChange,
  onBookAuthorChange,
  onBookLinkChange,
  onBookImageUrlChange,
  onDateChange,
  onTimeChange,
  onLocationLabelChange,
  onMeetingUrlChange,
  onMeetingPasscodeChange,
  previousOnlineMeeting = null,
  scheduleDefaultsStatus = "ready",
  scheduleDefaultsWarning = null,
  onRetryScheduleDefaults,
  onAdoptPreviousOnlineMeeting,
  fieldErrors = {},
  disabled = false,
  showBookAssets = true,
  showDeadline = true,
  bookSectionId = "host-editor-panel-basic-info",
  scheduleSectionId = "host-editor-panel-basic-schedule",
  meetingVisibilityHint = "저장 즉시 멤버의 홈과 모임 화면에 링크가 노출됩니다.",
  scheduleVisibilityHint = "일정과 링크는 저장 즉시 멤버 홈과 현재 모임 화면에 반영됩니다. 자동 안내 발송은 아직 연결되지 않았습니다.",
}: {
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookLink: string;
  bookImageUrl: string;
  date: string;
  time: string;
  deadline: string;
  timeHint?: string | null;
  locationLabel: string;
  meetingUrl: string;
  meetingPasscode: string;
  onTitleChange: (value: string) => void;
  onBookTitleChange: (value: string) => void;
  onBookAuthorChange: (value: string) => void;
  onBookLinkChange: (value: string) => void;
  onBookImageUrlChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onLocationLabelChange: (value: string) => void;
  onMeetingUrlChange: (value: string) => void;
  onMeetingPasscodeChange: (value: string) => void;
  previousOnlineMeeting?: PreviousOnlineMeeting | null;
  scheduleDefaultsStatus?: "loading" | "ready" | "warning";
  scheduleDefaultsWarning?: string | null;
  onRetryScheduleDefaults?: () => void;
  onAdoptPreviousOnlineMeeting?: (next: { meetingUrl: string; meetingPasscode: string }) => void;
  fieldErrors?: Partial<Record<BasicSessionPanelField, string>>;
  disabled?: boolean;
  showBookAssets?: boolean;
  showDeadline?: boolean;
  bookSectionId?: string;
  scheduleSectionId?: string;
  meetingVisibilityHint?: string;
  scheduleVisibilityHint?: string;
}) {
  const [previousMeetingOpen, setPreviousMeetingOpen] = useState(false);
  const previousMeetingTriggerRef = useRef<HTMLButtonElement>(null);
  const previousMeetingRestoreFocusRef = useRef<HTMLElement | null>(null);
  return (
    <>
      <section id={bookSectionId} className="stack" style={{ "--stack": "14px" } as CSSProperties}>
        <div>
          <div className="eyebrow">도서 정보</div>
          <h2 className="h3 editorial" style={{ margin: "6px 0 0" }}>읽을 책</h2>
        </div>
        <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
          <div>
            <label className="label" htmlFor="session-title">
              모임 제목
            </label>
            <input
              id="session-title"
              className="input"
              value={title}
              disabled={disabled}
              aria-invalid={Boolean(fieldErrors.title)}
              aria-describedby={fieldErrors.title ? "session-title-error" : undefined}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="예: No.8 모임 · 물고기는 존재하지 않는다"
            />
            {fieldErrors.title ? <p id="session-title-error" className="tiny field-error">{fieldErrors.title}</p> : null}
          </div>
          <div className="grid-2">
            <div>
              <label className="label" htmlFor="book-title">
                책 제목
              </label>
              <input
                id="book-title"
                className="input"
                value={bookTitle}
                disabled={disabled}
                aria-invalid={Boolean(fieldErrors.bookTitle)}
                aria-describedby={fieldErrors.bookTitle ? "book-title-error" : undefined}
                onChange={(event) => onBookTitleChange(event.target.value)}
                placeholder="예: 물고기는 존재하지 않는다"
              />
              {fieldErrors.bookTitle ? <p id="book-title-error" className="tiny field-error">{fieldErrors.bookTitle}</p> : null}
            </div>
            <div>
              <label className="label" htmlFor="book-author">
                저자
              </label>
              <input
                id="book-author"
                className="input"
                value={bookAuthor}
                disabled={disabled}
                aria-invalid={Boolean(fieldErrors.bookAuthor)}
                aria-describedby={fieldErrors.bookAuthor ? "book-author-error" : undefined}
                onChange={(event) => onBookAuthorChange(event.target.value)}
                placeholder="예: 룰루 밀러"
              />
              {fieldErrors.bookAuthor ? <p id="book-author-error" className="tiny field-error">{fieldErrors.bookAuthor}</p> : null}
            </div>
          </div>
          {showBookAssets ? <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "18px", alignItems: "end" }}>
            <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
              <div>
                <label className="label" htmlFor="book-link">
                  책 링크
                </label>
                <input
                  id="book-link"
                  className="input"
                  value={bookLink}
                  disabled={disabled}
                  onChange={(event) => onBookLinkChange(event.target.value)}
                  placeholder="https://product.kyobobook.co.kr/..."
                />
                <div className="tiny" style={{ marginTop: "6px", color: "var(--text-3)" }}>
                  교보·알라딘·예스24·출판사 페이지 등 어디든 괜찮아요. 공개/멤버 페이지에 “책 정보 보기”로
                  노출돼요.
                </div>
              </div>
              <div>
                <label className="label" htmlFor="book-image-url">
                  책 이미지 URL
                </label>
                <input
                  id="book-image-url"
                  className="input"
                  value={bookImageUrl}
                  disabled={disabled}
                  onChange={(event) => onBookImageUrlChange(event.target.value)}
                  placeholder="https://image.example.com/book-cover.jpg"
                />
              </div>
            </div>
            <BookCover title={bookTitle} author={bookAuthor} imageUrl={bookImageUrl} width={96} />
          </div> : null}
        </div>
      </section>

      <section id={scheduleSectionId} className="stack" style={{ "--stack": "14px" } as CSSProperties}>
        <div>
          <div className="eyebrow">일정 정보</div>
          <h2 className="h3 editorial" style={{ margin: "6px 0 0" }}>모임 일정과 접속 정보</h2>
        </div>
        <div className="grid-3">
          <div>
            <label className="label" htmlFor="session-date">
              모임 날짜
            </label>
            <input
              id="session-date"
              className="input"
              type="date"
              value={date}
              disabled={disabled}
              aria-invalid={Boolean(fieldErrors.date)}
              aria-describedby={fieldErrors.date ? "session-date-error" : undefined}
              onChange={(event) => onDateChange(event.target.value)}
            />
            {fieldErrors.date ? <p id="session-date-error" className="tiny field-error">{fieldErrors.date}</p> : null}
          </div>
          <div>
            <label className="label" htmlFor="session-time">
              시작 시간
            </label>
            <input
              id="session-time"
              className="input"
              type="time"
              value={time}
              disabled={disabled}
              aria-invalid={Boolean(fieldErrors.time)}
              aria-describedby={fieldErrors.time ? "session-time-error" : undefined}
              onChange={(event) => onTimeChange(event.target.value)}
            />
            {fieldErrors.time ? <p id="session-time-error" className="tiny field-error">{fieldErrors.time}</p> : null}
            {timeHint ? (
              <p className="tiny" style={{ marginTop: "6px", color: "var(--text-3)" }}>
                {timeHint}
              </p>
            ) : null}
          </div>
          {showDeadline ? <div>
            <label className="label" htmlFor="question-deadline">
              질문 제출 마감
            </label>
            <input
              id="question-deadline"
              className="input"
              value={deadline}
              readOnly
            />
          </div> : null}
        </div>
        <div style={{ marginTop: "14px" }}>
          <label className="label" htmlFor="session-location">
            장소
          </label>
          <input
            id="session-location"
            className="input"
            value={locationLabel}
            disabled={disabled}
            aria-invalid={Boolean(fieldErrors.locationLabel)}
            aria-describedby={fieldErrors.locationLabel ? "session-location-error" : undefined}
            onChange={(event) => onLocationLabelChange(event.target.value)}
          />
          {fieldErrors.locationLabel ? <p id="session-location-error" className="tiny field-error">{fieldErrors.locationLabel}</p> : null}
        </div>
        {scheduleDefaultsStatus === "loading" ? (
          <p className="small" role="status" style={{ margin: "14px 0 0" }}>
            기본 일정을 불러오는 중입니다.
          </p>
        ) : null}
        {scheduleDefaultsStatus === "warning" && scheduleDefaultsWarning ? (
          <div className="surface-quiet stack" role="alert" style={{ padding: 14, marginTop: 14 }}>
            <p className="small" style={{ margin: 0 }}>{scheduleDefaultsWarning}</p>
            {onRetryScheduleDefaults ? (
              <div>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={onRetryScheduleDefaults}
                >
                  다시 시도
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {previousOnlineMeeting && onAdoptPreviousOnlineMeeting ? (
          <div style={{ marginTop: "14px" }}>
            <button
              ref={previousMeetingTriggerRef}
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={disabled}
              onClick={() => {
                previousMeetingRestoreFocusRef.current = previousMeetingTriggerRef.current;
                setPreviousMeetingOpen(true);
              }}
            >
              이전 온라인 모임 정보 사용
            </button>
          </div>
        ) : null}
        <div className="grid-2" style={{ marginTop: "14px" }}>
          <div>
            <label className="label" htmlFor="meeting-url">
              미팅 URL
            </label>
            <input
              id="meeting-url"
              className="input"
              value={meetingUrl}
              disabled={disabled}
              aria-invalid={Boolean(fieldErrors.meetingUrl)}
              aria-describedby={fieldErrors.meetingUrl ? "meeting-url-error" : "meeting-url-hint"}
              onChange={(event) => onMeetingUrlChange(event.target.value)}
              placeholder="https://meet.google.com/..."
            />
            {fieldErrors.meetingUrl ? <p id="meeting-url-error" className="tiny field-error">{fieldErrors.meetingUrl}</p> : null}
            <div id="meeting-url-hint" className="tiny" style={{ marginTop: "6px" }}>
              {meetingVisibilityHint}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="meeting-passcode">
              Passcode · 선택
            </label>
            <input
              id="meeting-passcode"
              className="input"
              value={meetingPasscode}
              disabled={disabled}
              aria-invalid={Boolean(fieldErrors.meetingPasscode)}
              aria-describedby={fieldErrors.meetingPasscode ? "meeting-passcode-error" : undefined}
              onChange={(event) => onMeetingPasscodeChange(event.target.value)}
              placeholder="선택 사항"
            />
            {fieldErrors.meetingPasscode ? <p id="meeting-passcode-error" className="tiny field-error">{fieldErrors.meetingPasscode}</p> : null}
          </div>
        </div>
        <div className="marginalia" style={{ marginTop: "12px" }}>
          {scheduleVisibilityHint}
        </div>
        {previousMeetingOpen && previousOnlineMeeting && onAdoptPreviousOnlineMeeting ? (
          <PreviousOnlineMeetingDialog
            previous={previousOnlineMeeting}
            restoreFocusRef={previousMeetingRestoreFocusRef}
            onClose={() => setPreviousMeetingOpen(false)}
            onAdopt={onAdoptPreviousOnlineMeeting}
          />
        ) : null}
      </section>
    </>
  );
});
