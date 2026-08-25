import type { FormEvent } from "react";
import type {
  NewMeetingDraft,
  NewMeetingField,
  NewMeetingFieldErrors,
  NewMeetingSuggestionStatus,
} from "../../model/new-host-meeting-model";
import type { BasicSessionPanelField } from "../session-editor/basic-session-panel";
import { BasicSessionPanel } from "../session-editor/basic-session-panel";
import { NewMeetingSectionIndex } from "./new-meeting-section-index";

export type SavedNewMeeting = {
  sessionId: string;
  sessionNumber: number | null;
  state: "DRAFT";
  accessScope: "HOST_ONLY";
  siteVisibility: "HIDDEN";
  notificationDecision: "NOT_SENT";
};

export type NewHostMeetingPageProps = {
  draft: NewMeetingDraft;
  errors: NewMeetingFieldErrors;
  suggestionStatus: NewMeetingSuggestionStatus;
  suggestionMessage: string;
  suggestionReason: string | null;
  sourceMeetingCount: number;
  sensitiveSuggestionAvailable: boolean;
  status: "editing" | "saving" | "pending" | "checking" | "saved" | "preparing" | "error";
  formError: string | null;
  savedMeeting: SavedNewMeeting | null;
  prepareConfirmationOpen: boolean;
  prepareError: string | null;
  onFieldChange: (field: NewMeetingField, value: string) => void;
  onSubmit: () => void;
  onCheckPendingCreate: () => void;
  onRetrySuggestions: () => void;
  onAdoptSensitiveSuggestion: () => void;
  onPrepareRequested: () => void;
  onPrepareCanceled: () => void;
  onPrepareConfirmed: () => void;
};

const basicErrors = (errors: NewMeetingFieldErrors): Partial<Record<BasicSessionPanelField, string>> => ({
  title: errors.title,
  bookTitle: errors.bookTitle,
  bookAuthor: errors.author,
  date: errors.meetingDate,
  time: errors.meetingTime,
  locationLabel: errors.locationLabel,
  meetingUrl: errors.meetingUrl,
  meetingPasscode: errors.meetingPasscode,
});

function ScheduleSuggestionNote({
  status,
  message,
  reason,
  sourceMeetingCount,
  onRetry,
}: {
  status: NewMeetingSuggestionStatus;
  message: string;
  reason: string | null;
  sourceMeetingCount: number;
  onRetry: () => void;
}) {
  const role = status === "error" ? "alert" : "status";
  return (
    <div className="surface-quiet stack" style={{ padding: 14 }} role={role}>
      <p className="small" style={{ margin: 0 }}>{message}</p>
      {reason ? (
        <p className="tiny" style={{ margin: 0, color: "var(--text-2)" }}>
          {reason}{sourceMeetingCount > 0 ? ` · 최근 ${sourceMeetingCount}개 모임 기준` : ""}
        </p>
      ) : null}
      {status === "error" ? (
        <div><button type="button" className="btn btn-quiet btn-sm" onClick={onRetry}>다시 시도</button></div>
      ) : null}
    </div>
  );
}

export function NewHostMeetingPage({
  draft,
  errors,
  suggestionStatus,
  suggestionMessage,
  suggestionReason,
  sourceMeetingCount,
  sensitiveSuggestionAvailable,
  status,
  formError,
  savedMeeting,
  prepareConfirmationOpen,
  prepareError,
  onFieldChange,
  onSubmit,
  onCheckPendingCreate,
  onRetrySuggestions,
  onAdoptSensitiveSuggestion,
  onPrepareRequested,
  onPrepareCanceled,
  onPrepareConfirmed,
}: NewHostMeetingPageProps) {
  const createPending = status === "pending" || status === "checking";
  const formLocked = status === "saving" || createPending;
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (createPending) return;
    onSubmit();
  };

  return (
    <main className="rm-host-session-workspace rm-new-meeting-page">
      <div className="rm-host-session-workspace__frame">
        <header className="rm-host-session-workspace__header">
          <h1 className="h1 editorial rm-host-session-workspace__title">새 모임 만들기</h1>
          <p className="rm-host-session-workspace__meta">
            멤버에게 보이기 전에 책과 일정을 호스트 초안으로 안전하게 정리합니다.
          </p>
        </header>

        {savedMeeting ? (
          <section className="rm-new-meeting-page__saved surface stack" aria-labelledby="new-meeting-saved-title">
            <h2 id="new-meeting-saved-title" className="h2 editorial">모임 초안을 저장했습니다</h2>
            <p>호스트만 볼 수 있는 초안으로 저장했습니다.</p>
            <p className="small">공개 사이트에는 보이지 않습니다. 아무 안내도 보내지 않습니다.</p>
            <dl className="rm-new-meeting-page__projection">
              <div><dt>상태</dt><dd>DRAFT</dd></div>
              <div><dt>앱 노출</dt><dd>HOST_ONLY</dd></div>
              <div><dt>공개 배치</dt><dd>HIDDEN</dd></div>
            </dl>
            {prepareError ? <p role="alert" className="field-error">{prepareError}</p> : null}
            <div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={status === "preparing"}
                onClick={onPrepareRequested}
              >
                멤버와 준비 시작
              </button>
            </div>
          </section>
        ) : (
          <div className="rm-new-meeting-page__layout">
            <aside className="rm-new-meeting-page__index">
              <NewMeetingSectionIndex />
            </aside>
            <form
              className="rm-new-meeting-page__form stack"
              aria-label="새 모임 정보"
              onSubmit={handleSubmit}
            >
              <BasicSessionPanel
                  title={draft.title}
                  bookTitle={draft.bookTitle}
                  bookAuthor={draft.author}
                  bookLink=""
                  bookImageUrl=""
                  date={draft.meetingDate}
                  time={draft.meetingTime}
                  deadline=""
                  locationLabel={draft.locationLabel}
                  meetingUrl={draft.meetingUrl}
                  meetingPasscode={draft.meetingPasscode}
                  disabled={formLocked}
                  showBookAssets={false}
                  showDeadline={false}
                  bookSectionId="new-meeting-book"
                  scheduleSectionId="new-meeting-schedule"
                  fieldErrors={basicErrors(errors)}
                  meetingVisibilityHint="초안 저장만으로는 멤버에게 보이지 않습니다."
                  scheduleVisibilityHint="모임을 저장한 뒤 별도 확인을 해야 멤버에게 보입니다."
                  onTitleChange={(value) => onFieldChange("title", value)}
                  onBookTitleChange={(value) => onFieldChange("bookTitle", value)}
                  onBookAuthorChange={(value) => onFieldChange("author", value)}
                  onBookLinkChange={() => undefined}
                  onBookImageUrlChange={() => undefined}
                  onDateChange={(value) => onFieldChange("meetingDate", value)}
                  onTimeChange={(value) => onFieldChange("meetingTime", value)}
                  onLocationLabelChange={(value) => onFieldChange("locationLabel", value)}
                  onMeetingUrlChange={(value) => onFieldChange("meetingUrl", value)}
                  onMeetingPasscodeChange={(value) => onFieldChange("meetingPasscode", value)}
              />
              <section id="new-meeting-audience" className="surface-quiet stack" style={{ padding: 18 }}>
                <h2 className="h3 editorial">멤버에게 보이기</h2>
                <p className="small">첫 저장은 언제나 호스트 전용 초안입니다.</p>
                {sensitiveSuggestionAvailable ? (
                  <div>
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      disabled={formLocked}
                      onClick={onAdoptSensitiveSuggestion}
                    >
                      이전 온라인 모임 정보 사용
                    </button>
                  </div>
                ) : null}
              </section>
              <section id="new-meeting-review" className="stack">
                {formError ? (
                  <div
                    id="new-meeting-form-error-summary"
                    role="alert"
                    aria-label="모임 저장 오류"
                    className="surface-quiet small field-error"
                    tabIndex={-1}
                    style={{ padding: 14 }}
                  >
                    {formError}
                  </div>
                ) : null}
                {createPending ? (
                  <p role="status" className="small">
                    {status === "checking"
                      ? "같은 요청의 저장 결과를 확인하고 있습니다."
                      : "저장 결과가 아직 확정되지 않았습니다. 새 요청을 보내지 않고 같은 요청을 확인합니다."}
                  </p>
                ) : null}
                {Object.keys(errors).length > 0 ? (
                  <p role="alert" className="small">확인이 필요한 입력이 있습니다. 해당 항목에서 바로 수정해 주세요.</p>
                ) : null}
                <button
                  type={createPending ? "button" : "submit"}
                  className="btn btn-primary"
                  disabled={status === "saving" || status === "checking"}
                  onClick={createPending && status === "pending" ? onCheckPendingCreate : undefined}
                >
                  {status === "saving"
                    ? "모임 초안을 저장하는 중"
                    : status === "checking"
                      ? "저장 결과 확인 중"
                      : status === "pending"
                        ? "저장 결과 확인"
                        : "모임 초안 저장"}
                </button>
              </section>
            </form>
            <aside className="rm-new-meeting-page__rail" aria-label="저장 전 확인">
              <ScheduleSuggestionNote
                status={suggestionStatus}
                message={suggestionMessage}
                reason={suggestionReason}
                sourceMeetingCount={sourceMeetingCount}
                onRetry={onRetrySuggestions}
              />
              <section className="surface-quiet stack" style={{ padding: 18 }}>
                <h2 className="h3 editorial">저장 결과</h2>
                <p className="small">DRAFT · HOST_ONLY · HIDDEN</p>
                <p className="tiny">저장 후에는 한 번 더 확인해야 멤버와 준비가 시작됩니다.</p>
              </section>
            </aside>
          </div>
        )}
      </div>

      {prepareConfirmationOpen && savedMeeting ? (
        <div className="rm-host-session-workspace__sheet-backdrop">
          <section
            className="rm-host-session-workspace__sheet rm-host-session-workspace__sheet--bottom stack"
            role="dialog"
            aria-modal="true"
            aria-labelledby="prepare-meeting-title"
          >
            <h2 id="prepare-meeting-title" className="h2 editorial">멤버와 준비 시작</h2>
            <p>참여자 목록을 확정하고 멤버에게 모임을 보입니다.</p>
            <p className="small">공개 사이트 기록은 계속 숨김 상태입니다.</p>
            <div className="row wrap">
              <button type="button" className="btn btn-quiet" onClick={onPrepareCanceled}>취소</button>
              <button type="button" className="btn btn-primary" onClick={onPrepareConfirmed}>확인하고 준비 시작</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
