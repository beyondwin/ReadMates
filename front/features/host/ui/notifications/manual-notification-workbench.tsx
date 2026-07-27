import { type ChangeEvent, useState } from "react";
import {
  buildComposerSelection,
  type HostNotificationComposerDraft,
} from "@/features/host/model/host-notification-composer-model";
import type {
  HostNotificationEventType,
  HostSessionListItem,
  ManualNotificationConfirmRequest,
  ManualNotificationOptionsResponse,
  ManualNotificationPreviewRequest,
  ManualNotificationPreviewResponse,
} from "@/features/host/model/host-view-types";
import { HostNotificationComposer } from "./host-notification-composer";
import { HostNotificationComposerDialog } from "./host-notification-composer-dialog";
import {
  manualSessionStateLabel,
  manualSessionVisibilityLabel,
  manualTemplateDescriptions,
} from "./manual-notification-labels";
import { ManualNotificationPreviewConfirmation } from "./manual-notification-preview";

type ManualNotificationWorkbenchProps = {
  options: ManualNotificationOptionsResponse;
  hostSessions: HostSessionListItem[];
  initialSessionId: string | null;
  initialEventType: HostNotificationEventType | null;
  preview: ManualNotificationPreviewResponse | null;
  busy: boolean;
  error: string | null;
  onPreview: (request: ManualNotificationPreviewRequest) => Promise<void>;
  onConfirm: (request: ManualNotificationConfirmRequest) => Promise<void>;
  onPreviewDismiss: () => void;
  onSessionChange?: (sessionId: string) => Promise<ManualNotificationOptionsResponse>;
  onLoadManualOptions?: (
    sessionId?: string,
    search?: string,
  ) => Promise<ManualNotificationOptionsResponse>;
  onLoadMoreManualMembers?: (
    sessionId?: string,
    search?: string,
    cursor?: string,
  ) => Promise<ManualNotificationOptionsResponse>;
  onDraftInvalidated?: () => void;
};

export function ManualNotificationWorkbench(props: ManualNotificationWorkbenchProps) {
  const [preferredEventType, setPreferredEventType] = useState(
    props.initialEventType,
  );
  const initialTemplate = props.options.templates.find(
    (item) => item.eventType === preferredEventType && item.enabled,
  ) ?? props.options.templates.find((item) => item.enabled);
  const optionsSessionId = props.options.session?.sessionId;
  const resolvedSessionId = optionsSessionId
    && props.hostSessions.some((session) => session.sessionId === optionsSessionId)
    ? optionsSessionId
    : props.initialSessionId;
  const stateKey = [
    resolvedSessionId ?? "none",
    ...props.options.templates.map(
      (item) => `${item.eventType}:${item.contentRevision}`,
    ),
  ].join("|");

  return (
    <ManualNotificationWorkbenchState
      key={stateKey}
      {...props}
      initialSessionId={resolvedSessionId}
      initialTemplate={initialTemplate}
      onEventTypeSelected={setPreferredEventType}
    />
  );
}

function ManualNotificationWorkbenchState({
  options,
  hostSessions,
  initialSessionId,
  preview,
  busy,
  error,
  onPreview,
  onConfirm,
  onPreviewDismiss,
  onSessionChange,
  onLoadManualOptions,
  onLoadMoreManualMembers,
  onDraftInvalidated,
  initialTemplate,
  onEventTypeSelected,
}: ManualNotificationWorkbenchProps & {
  initialTemplate: ManualNotificationOptionsResponse["templates"][number] | undefined;
  onEventTypeSelected: (eventType: HostNotificationEventType) => void;
}) {
  const [draft, setDraft] = useState<HostNotificationComposerDraft>({
    sessionId: initialSessionId ?? "",
    eventType: initialTemplate?.eventType ?? "SESSION_REMINDER_DUE",
    contentRevision: initialTemplate?.contentRevision ?? "",
    recipientMode: initialTemplate?.defaultAudience ?? "ALL_ACTIVE_MEMBERS",
    requestedChannels: initialTemplate?.defaultChannels ?? "BOTH",
    selectedMembershipIds: [],
  });
  const [search, setSearch] = useState("");
  const [memberError, setMemberError] = useState<string | null>(null);

  const changeDraft = (next: HostNotificationComposerDraft) => {
    setDraft(next);
    onDraftInvalidated?.();
  };

  const selectTemplate = (eventType: HostNotificationEventType) => {
    const template = options.templates.find((item) => item.eventType === eventType);
    if (!template) {
      return;
    }
    onEventTypeSelected(eventType);
    changeDraft({
      ...draft,
      eventType,
      contentRevision: template.contentRevision,
      recipientMode: template.defaultAudience,
      requestedChannels: template.defaultChannels,
      selectedMembershipIds: [],
    });
  };

  const runMemberLoad = async (callback: () => Promise<unknown>) => {
    try {
      await callback();
      setMemberError(null);
    } catch {
      setMemberError("멤버를 불러오지 못했습니다. 다시 시도해 주세요.");
    }
  };

  const selectedSession = hostSessions.find(
    (session) => session.sessionId === draft.sessionId,
  );
  const currentTemplate = options.templates.find(
    (template) => template.eventType === draft.eventType,
  );
  const buildOperationsSelection = () => buildComposerSelection(draft);
  const handleSessionSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    const sessionId = event.currentTarget.value;
    changeDraft({ ...draft, sessionId, selectedMembershipIds: [] });
    setSearch("");
    void runMemberLoad(async () => {
      await onSessionChange?.(sessionId);
    });
  };
  const handleSearch = async (value: string) => {
    setSearch(value);
    await runMemberLoad(async () => {
      await onLoadManualOptions?.(
        draft.sessionId || undefined,
        value || undefined,
      );
    });
  };
  const handleLoadMore = async () => {
    await runMemberLoad(async () => {
      await onLoadMoreManualMembers?.(
        draft.sessionId || undefined,
        search || undefined,
        options.members.nextCursor ?? undefined,
      );
    });
  };
  const handleConfirm = (resendConfirmed: boolean) => preview
    ? onConfirm({
        ...buildOperationsSelection(),
        previewId: preview.previewId,
        resendConfirmed,
      })
    : Promise.resolve();

  return (
    <section
      className="rm-notification-workbench"
      aria-labelledby="manual-notification-title"
    >
      <header className="rm-notification-workbench__header">
        <div>
          <span className="eyebrow">운영 · 수동 발송</span>
          <h2 id="manual-notification-title">새 알림 발송</h2>
          <p>선택만으로는 발송되지 않습니다. 미리보기에서 최종 확인합니다.</p>
        </div>
        <span className="badge">미리보기 후 발송</span>
      </header>

      <div className="rm-notification-workbench__primary-decisions">
        <section
          className="rm-notification-workbench__decision"
          aria-labelledby="manual-notification-session-title"
        >
          <header className="rm-notification-workbench__decision-heading">
            <span className="rm-notification-workbench__step">01</span>
            <div>
              <h3 id="manual-notification-session-title">대상 회차</h3>
              <p>알림의 기준이 되는 모임</p>
            </div>
          </header>
          <div className="rm-notification-workbench__decision-control">
            {hostSessions.length === 0 ? (
              <div className="rm-notification-workbench__empty">
                <p>선택 가능한 세션이 없습니다.</p>
                <a className="btn btn-quiet btn-sm" href="/app/host/sessions">
                  세션 관리로 이동
                </a>
              </div>
            ) : (
              <>
                <label className="label" htmlFor="manual-notification-session">
                  세션 선택
                </label>
                <select
                  id="manual-notification-session"
                  className="input"
                  value={draft.sessionId}
                  disabled={busy}
                  onChange={handleSessionSelect}
                >
                  {hostSessions.map((session) => (
                    <option key={session.sessionId} value={session.sessionId}>
                      {session.sessionNumber}회차 · {session.bookTitle} · {session.date}
                    </option>
                  ))}
                </select>
              </>
            )}
            {selectedSession ? (
              <p className="rm-notification-workbench__session-context">
                {manualSessionStateLabel(selectedSession.state)}
                {" · "}
                {manualSessionVisibilityLabel(selectedSession.visibility)}
                {" · "}
                {options.session?.feedbackDocumentUploaded
                  ? "피드백 문서 준비됨"
                  : "피드백 문서 준비 전"}
              </p>
            ) : null}
          </div>
        </section>

        <section
          className="rm-notification-workbench__decision"
          aria-labelledby="manual-notification-template-title"
        >
          <header className="rm-notification-workbench__decision-heading">
            <span className="rm-notification-workbench__step">02</span>
            <div>
              <h3 id="manual-notification-template-title">알림 종류</h3>
              <p>발송할 안내의 성격</p>
            </div>
          </header>
          <div className="rm-notification-workbench__decision-control">
            <fieldset
              className="rm-notification-choice-grid"
              aria-labelledby="manual-notification-template-title"
            >
            {options.templates.map((template) => {
              const reasonId = `manual-notification-template-${template.eventType}-reason`;
              return (
                <label
                  key={template.eventType}
                  className="rm-notification-choice-card"
                  data-selected={draft.eventType === template.eventType ? "true" : "false"}
                  data-disabled={!template.enabled ? "true" : "false"}
                >
                  <input
                    type="radio"
                    name="manual-notification-template"
                    aria-label={template.label}
                    aria-describedby={template.disabledReason ? reasonId : undefined}
                    checked={draft.eventType === template.eventType}
                    disabled={busy || !template.enabled}
                    onChange={() => selectTemplate(template.eventType)}
                  />
                  <span className="rm-notification-choice-card__mark" aria-hidden="true">✓</span>
                  <strong>{template.label}</strong>
                  <span>{manualTemplateDescriptions[template.eventType]}</span>
                  {template.disabledReason ? (
                    <span
                      id={reasonId}
                      className="rm-notification-choice-card__reason"
                    >
                      {template.disabledReason}
                    </span>
                  ) : null}
                </label>
              );
            })}
            </fieldset>
          </div>
        </section>
      </div>

      <HostNotificationComposer
        presentation="workbench"
        previewButtonLabel="미리보기 열기"
        options={options}
        eventType={draft.eventType}
        draft={draft}
        preview={preview}
        busy={busy}
        error={error ?? memberError}
        onDraftChange={changeDraft}
        onSearch={handleSearch}
        onLoadMore={handleLoadMore}
        onPreview={() => onPreview(buildOperationsSelection())}
        onConfirm={handleConfirm}
        onSkip={() => undefined}
        showSkip={false}
        recipientModes={currentTemplate?.allowedAudiences}
      />

      <HostNotificationComposerDialog
        open={preview !== null}
        busy={busy}
        variant="side-sheet"
        title="발송 전 확인"
        description="최종 대상과 채널을 확인한 뒤 발송합니다."
        onClose={onPreviewDismiss}
      >
        {preview ? (
          <>
            <div
              className="row"
              style={{ justifyContent: "flex-end", marginBottom: 12 }}
            >
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={onPreviewDismiss}
              >
                닫기
              </button>
            </div>
            <ManualNotificationPreviewConfirmation
              key={preview.previewId}
              preview={preview}
              busy={busy}
              presentation="side-sheet"
              onConfirm={handleConfirm}
            />
          </>
        ) : null}
      </HostNotificationComposerDialog>
    </section>
  );
}
