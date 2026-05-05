import type { CSSProperties } from "react";
import { BookCover } from "@/shared/ui/book-cover";
import { Panel } from "./session-editor-panel";
import type { MobileEditorSection } from "./mobile-editor-tabs";

export function BasicSessionPanel({
  activeMobileSection,
  title,
  bookTitle,
  bookAuthor,
  bookLink,
  bookImageUrl,
  date,
  time,
  deadline,
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
}: {
  activeMobileSection: MobileEditorSection;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookLink: string;
  bookImageUrl: string;
  date: string;
  time: string;
  deadline: string;
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
}) {
  return (
    <>
      <Panel
        eyebrow="도서 정보"
        title="읽을 책"
        mobileSection="basic"
        panelId="host-editor-panel-basic-info"
        activeMobileSection={activeMobileSection}
      >
        <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
          <div>
            <label className="label" htmlFor="session-title">
              세션 제목
            </label>
            <input
              id="session-title"
              className="input"
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="예: 8회차 모임 · 물고기는 존재하지 않는다"
            />
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
                onChange={(event) => onBookTitleChange(event.target.value)}
                placeholder="예: 물고기는 존재하지 않는다"
              />
            </div>
            <div>
              <label className="label" htmlFor="book-author">
                저자
              </label>
              <input
                id="book-author"
                className="input"
                value={bookAuthor}
                onChange={(event) => onBookAuthorChange(event.target.value)}
                placeholder="예: 룰루 밀러"
              />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "18px", alignItems: "end" }}>
            <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
              <div>
                <label className="label" htmlFor="book-link">
                  책 링크
                </label>
                <input
                  id="book-link"
                  className="input"
                  value={bookLink}
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
                  onChange={(event) => onBookImageUrlChange(event.target.value)}
                  placeholder="https://image.example.com/book-cover.jpg"
                />
              </div>
            </div>
            <BookCover title={bookTitle} author={bookAuthor} imageUrl={bookImageUrl} width={96} />
          </div>
        </div>
      </Panel>

      <Panel
        eyebrow="일정 정보"
        title="모임 일정과 접속 정보"
        mobileSection="basic"
        panelId="host-editor-panel-basic-schedule"
        activeMobileSection={activeMobileSection}
      >
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
              onChange={(event) => onDateChange(event.target.value)}
            />
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
              onChange={(event) => onTimeChange(event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="question-deadline">
              질문 제출 마감
            </label>
            <input
              id="question-deadline"
              className="input"
              value={deadline}
              readOnly
            />
          </div>
        </div>
        <div style={{ marginTop: "14px" }}>
          <label className="label" htmlFor="session-location">
            장소
          </label>
          <input
            id="session-location"
            className="input"
            value={locationLabel}
            onChange={(event) => onLocationLabelChange(event.target.value)}
          />
        </div>
        <div className="grid-2" style={{ marginTop: "14px" }}>
          <div>
            <label className="label" htmlFor="meeting-url">
              미팅 URL
            </label>
            <input
              id="meeting-url"
              className="input"
              value={meetingUrl}
              onChange={(event) => onMeetingUrlChange(event.target.value)}
              placeholder="https://meet.google.com/..."
            />
            <div className="tiny" style={{ marginTop: "6px" }}>
              저장 즉시 멤버의 홈과 세션 화면에 링크가 노출됩니다.
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
              onChange={(event) => onMeetingPasscodeChange(event.target.value)}
              placeholder="선택 사항"
            />
          </div>
        </div>
        <div className="marginalia" style={{ marginTop: "12px" }}>
          일정과 링크는 저장 즉시 멤버 홈과 현재 세션 화면에 반영됩니다. 자동 안내 발송은 아직 연결되지 않았습니다.
        </div>
      </Panel>
    </>
  );
}
