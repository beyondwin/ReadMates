import { type CSSProperties, useState } from "react";
import {
  buildComposerSelection,
  type HostNotificationComposerDraft,
  type HostNotificationRecipientMode,
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
import { manualAudienceLabels } from "./manual-notification-labels";

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

function recipientModeFromAudience(audience: string): HostNotificationRecipientMode {
  if (audience === "ALL_ACTIVE_MEMBERS") {
    return "ALL_ACTIVE_MEMBERS";
  }
  if (audience === "SELECTED_MEMBERS") {
    return "SELECTED_MEMBERS";
  }
  return "RECOMMENDED";
}

export function ManualNotificationWorkbench(props: ManualNotificationWorkbenchProps) {
  const initialTemplate = props.options.templates.find(
    (item) => item.eventType === props.initialEventType && item.enabled,
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
  onSessionChange,
  onLoadManualOptions,
  onLoadMoreManualMembers,
  onDraftInvalidated,
  initialTemplate,
}: ManualNotificationWorkbenchProps & {
  initialTemplate: ManualNotificationOptionsResponse["templates"][number] | undefined;
}) {
  const [draft, setDraft] = useState<HostNotificationComposerDraft>({
    sessionId: initialSessionId ?? "",
    eventType: initialTemplate?.eventType ?? "SESSION_REMINDER_DUE",
    contentRevision: initialTemplate?.contentRevision ?? "",
    recipientMode: recipientModeFromAudience(
      initialTemplate?.defaultAudience ?? "ALL_ACTIVE_MEMBERS",
    ),
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
    changeDraft({
      ...draft,
      eventType,
      contentRevision: template.contentRevision,
      recipientMode: recipientModeFromAudience(template.defaultAudience),
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
  const buildOperationsSelection = () => {
    const selection = buildComposerSelection(draft);
    return draft.recipientMode === "RECOMMENDED" && currentTemplate
      ? { ...selection, audience: currentTemplate.defaultAudience }
      : selection;
  };

  return (
    <section
      className="rm-document-panel"
      aria-labelledby="manual-notification-title"
      style={{ padding: "22px 24px", marginBottom: 20 }}
    >
      <div className="eyebrow">운영 · 수동 발송</div>
      <h2
        id="manual-notification-title"
        className="h2 editorial"
        style={{ margin: "6px 0 18px" }}
      >
        새 알림 발송
      </h2>

      <div className="stack" style={{ "--stack": "16px" } as CSSProperties}>
        <div>
          <label className="label" htmlFor="manual-notification-session">
            세션 선택
          </label>
          <select
            id="manual-notification-session"
            className="input"
            value={draft.sessionId}
            disabled={busy || hostSessions.length === 0}
            onChange={(event) => {
              const sessionId = event.currentTarget.value;
              changeDraft({
                ...draft,
                sessionId,
                selectedMembershipIds: [],
              });
              setSearch("");
              void runMemberLoad(async () => {
                await onSessionChange?.(sessionId);
              });
            }}
          >
            {hostSessions.map((session) => (
              <option key={session.sessionId} value={session.sessionId}>
                {session.sessionNumber}회차 · {session.bookTitle} · {session.date}
              </option>
            ))}
          </select>
          {hostSessions.length === 0 ? (
            <p className="tiny muted">선택 가능한 세션이 없습니다.</p>
          ) : null}
          {selectedSession ? (
            <p className="tiny muted">
              <span>{selectedSession.bookTitle}</span>
              <span> · {selectedSession.state} · {selectedSession.visibility}</span>
            </p>
          ) : null}
        </div>

        <div>
          <span className="label">템플릿</span>
          <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
            {options.templates.map((template) => (
              <button
                key={template.eventType}
                className={`btn btn-sm ${
                  draft.eventType === template.eventType ? "btn-primary" : "btn-quiet"
                }`}
                type="button"
                aria-label={
                  template.disabledReason
                    ? `${template.label}: ${template.disabledReason}`
                    : template.label
                }
                disabled={busy || !template.enabled}
                onClick={() => selectTemplate(template.eventType)}
              >
                {template.label}
              </button>
            ))}
          </div>
        </div>

        <HostNotificationComposer
          options={options}
          eventType={draft.eventType}
          draft={draft}
          preview={preview}
          busy={busy}
          error={error ?? memberError}
          onDraftChange={changeDraft}
          onSearch={async (value) => {
            setSearch(value);
            await runMemberLoad(async () => {
              await onLoadManualOptions?.(
                draft.sessionId || undefined,
                value || undefined,
              );
            });
          }}
          onLoadMore={async () => {
            await runMemberLoad(async () => {
              await onLoadMoreManualMembers?.(
                draft.sessionId || undefined,
                search || undefined,
                options.members.nextCursor ?? undefined,
              );
            });
          }}
          onPreview={() => onPreview(buildOperationsSelection())}
          onConfirm={(resendConfirmed) => preview
            ? onConfirm({
                ...buildOperationsSelection(),
                previewId: preview.previewId,
                resendConfirmed,
              })
            : Promise.resolve()}
          onSkip={() => undefined}
          showSkip={false}
          previewButtonLabel="미리보기"
          recommendedRecipientLabel={
            currentTemplate
              ? manualAudienceLabels[currentTemplate.defaultAudience]
              : "추천 대상"
          }
        />
      </div>
    </section>
  );
}
