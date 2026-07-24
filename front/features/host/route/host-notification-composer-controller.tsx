import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import type {
  ManualNotificationConfirmResponse,
  ManualNotificationMemberOption,
  ManualNotificationOptionsResponse,
  ManualNotificationPreviewResponse,
} from "@/features/host/api/host-contracts";
import {
  buildComposerSelection,
  type HostNotificationComposerDraft,
  type HostNotificationRecipientMode,
} from "@/features/host/model/host-notification-composer-model";
import {
  hostNotificationKeys,
  hostNotificationManualOptionsQuery,
  useConfirmManualNotificationMutation,
  usePreviewManualNotificationMutation,
} from "@/features/host/queries/host-notification-queries";
import { HostNotificationComposer } from "@/features/host/ui/notifications/host-notification-composer";
import { HostNotificationComposerDialog } from "@/features/host/ui/notifications/host-notification-composer-dialog";
import type { ReadmatesApiContext } from "@/shared/api/client";

export type HostNotificationComposerRequest = {
  sessionId: string;
  eventType:
    | "NEXT_BOOK_PUBLISHED"
    | "FEEDBACK_DOCUMENT_PUBLISHED"
    | "SESSION_RECORD_UPDATED";
  contentRevision: string;
  origin: "FIRST_PUBLICATION" | "CONTENT_UPDATE" | "OPERATIONS";
};

export type HostNotificationComposerControllerProps = {
  request: HostNotificationComposerRequest | null;
  open?: boolean;
  context?: ReadmatesApiContext;
  onClose: () => void;
  onConfirmed?: (result: ManualNotificationConfirmResponse) => void;
};

const MEMBER_PAGE_LIMIT = 50;

function recipientModeFromAudience(audience: string): HostNotificationRecipientMode {
  if (audience === "ALL_ACTIVE_MEMBERS") {
    return "ALL_ACTIVE_MEMBERS";
  }
  if (audience === "SELECTED_MEMBERS") {
    return "SELECTED_MEMBERS";
  }
  return "RECOMMENDED";
}

function mergeMembers(
  current: ManualNotificationMemberOption[],
  incoming: ManualNotificationMemberOption[],
) {
  const byId = new Map(current.map((member) => [member.membershipId, member]));
  incoming.forEach((member) => byId.set(member.membershipId, member));
  return Array.from(byId.values());
}

export function HostNotificationComposerController({
  request,
  open = request !== null,
  context,
  onClose,
  onConfirmed,
}: HostNotificationComposerControllerProps) {
  if (!open || !request) {
    return null;
  }
  return (
    <OpenComposerController
      key={`${request.sessionId}:${request.eventType}:${request.contentRevision}:${request.origin}`}
      request={request}
      context={context}
      onClose={onClose}
      onConfirmed={onConfirmed}
    />
  );
}

function OpenComposerController({
  request,
  context: explicitContext,
  onClose,
  onConfirmed,
}: Omit<HostNotificationComposerControllerProps, "open"> & {
  request: HostNotificationComposerRequest;
}) {
  const params = useParams();
  const routeContext = useMemo(
    () => params.clubSlug ? { clubSlug: params.clubSlug } : undefined,
    [params.clubSlug],
  );
  const context = explicitContext ?? routeContext;
  const optionsQuery = useQuery(hostNotificationManualOptionsQuery({
    sessionId: request.sessionId,
    page: { limit: MEMBER_PAGE_LIMIT },
  }, context));
  const template = optionsQuery.data?.templates.find(
    (item) => item.eventType === request.eventType,
  );
  const templateMatchesRequest = template?.enabled
    && template.contentRevision === request.contentRevision;

  if (optionsQuery.data && templateMatchesRequest) {
    return (
      <ReadyComposerController
        key={`${request.sessionId}:${request.eventType}:${template.contentRevision}`}
        request={request}
        context={context}
        initialOptions={optionsQuery.data}
        onClose={onClose}
        onConfirmed={onConfirmed}
      />
    );
  }

  const unavailable = optionsQuery.isError || Boolean(optionsQuery.data && !templateMatchesRequest);
  const revisionChanged = Boolean(
    optionsQuery.data
      && template
      && template.contentRevision !== request.contentRevision,
  );
  return (
    <HostNotificationComposerDialog
      open
      busy={optionsQuery.isFetching}
      onClose={onClose}
    >
      {unavailable ? (
        <div className="stack" style={{ "--stack": "14px" } as React.CSSProperties}>
          <p role="alert" className="small" style={{ color: "var(--danger)", margin: 0 }}>
            {revisionChanged
              ? "저장 직후 알림 내용이 변경되었습니다. 최신 저장 결과에서 작성기를 다시 열어 주세요."
              : "콘텐츠는 저장됐지만 알림을 준비하지 못했습니다."}
          </p>
          <div className="row wrap" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={optionsQuery.isFetching}
              onClick={() => void optionsQuery.refetch()}
            >
              다시 시도
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={optionsQuery.isFetching}
              onClick={onClose}
            >
              나중에 발송
            </button>
          </div>
        </div>
      ) : (
        <p role="status" className="small" style={{ margin: 0 }}>
          알림을 준비하고 있습니다.
        </p>
      )}
    </HostNotificationComposerDialog>
  );
}

function ReadyComposerController({
  request,
  context,
  initialOptions,
  onClose,
  onConfirmed,
}: {
  request: HostNotificationComposerRequest;
  context?: ReadmatesApiContext;
  initialOptions: ManualNotificationOptionsResponse;
  onClose: () => void;
  onConfirmed?: (result: ManualNotificationConfirmResponse) => void;
}) {
  const client = useQueryClient();
  const template = initialOptions.templates.find(
    (item) => item.eventType === request.eventType,
  )!;
  const previewMutation = usePreviewManualNotificationMutation();
  const confirmMutation = useConfirmManualNotificationMutation(context);
  const [options, setOptions] = useState(initialOptions);
  const [draft, setDraft] = useState<HostNotificationComposerDraft>({
    sessionId: request.sessionId,
    eventType: request.eventType,
    contentRevision: request.contentRevision,
    recipientMode: recipientModeFromAudience(template.defaultAudience),
    requestedChannels: template.defaultChannels,
    selectedMembershipIds: [],
  });
  const [preview, setPreview] = useState<ManualNotificationPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [membersLoading, setMembersLoading] = useState(false);
  const busy = previewMutation.isPending || confirmMutation.isPending;

  const disableCurrentTemplate = () => {
    setOptions((current) => ({
      ...current,
      templates: current.templates.map((item) =>
        item.eventType === request.eventType
          ? {
              ...item,
              enabled: false,
              disabledReason: "알림 내용이 변경되었습니다.",
            }
          : item),
    }));
  };

  const recoverFromMutationError = (
    mutationError: unknown,
    phase: "preview" | "confirm",
  ) => {
    const code = mutationError && typeof mutationError === "object" && "code" in mutationError
      ? String((mutationError as { code?: unknown }).code ?? "")
      : "";
    if (
      code === "MANUAL_NOTIFICATION_CONTENT_STALE"
      || code === "MANUAL_NOTIFICATION_STATE_INVALID"
      || code === "MANUAL_NOTIFICATION_RECIPIENTS_CHANGED"
    ) {
      client.removeQueries({
        queryKey: hostNotificationKeys.manualOptionsRoot(context),
      });
      disableCurrentTemplate();
      setPreview(null);
      return code === "MANUAL_NOTIFICATION_RECIPIENTS_CHANGED"
        ? "미리보기 이후 수신 대상이 변경되었습니다. 최신 저장 결과에서 작성기를 다시 열어 주세요."
        : "알림 내용 또는 세션 상태가 변경되었습니다. 최신 저장 결과에서 작성기를 다시 열어 주세요.";
    }
    if (code === "MANUAL_NOTIFICATION_PREVIEW_EXPIRED") {
      setPreview(null);
      return "미리보기가 만료되었습니다. 새 미리보기를 만든 뒤 다시 발송해 주세요.";
    }
    if (
      code === "MANUAL_NOTIFICATION_PREVIEW_REUSED"
      || code === "MANUAL_NOTIFICATION_SELECTION_INVALID"
    ) {
      setPreview(null);
      return "미리보기와 선택 내용이 일치하지 않습니다. 새 미리보기를 만들어 주세요.";
    }
    if (
      code === "MANUAL_NOTIFICATION_RECIPIENT_INVALID"
      || code === "MANUAL_NOTIFICATION_AUDIENCE_EMPTY"
    ) {
      setPreview(null);
      return "현재 선택으로 알림을 받을 수 있는 대상을 확인해 주세요.";
    }
    if (code === "DUPLICATE_NOTIFICATION_DISPATCH") {
      setPreview(null);
      return "같은 내용의 발송 기록이 변경되었습니다. 새 미리보기에서 재발송 여부를 확인해 주세요.";
    }
    return phase === "preview"
      ? "미리보기를 만들지 못했습니다. 대상과 채널을 확인해 주세요."
      : "발송을 요청하지 못했습니다. 미리보기 만료 또는 재발송 여부를 확인해 주세요.";
  };

  const loadMembers = async (nextSearch: string, cursor?: string) => {
    if (membersLoading) {
      return null;
    }
    setMembersLoading(true);
    try {
      const nextOptions = await client.fetchQuery(hostNotificationManualOptionsQuery({
        sessionId: request.sessionId,
        search: nextSearch || null,
        page: { limit: MEMBER_PAGE_LIMIT, cursor },
      }, context));
      const nextTemplate = nextOptions.templates.find(
        (item) => item.eventType === request.eventType,
      );
      if (
        !nextTemplate?.enabled
        || nextTemplate.contentRevision !== request.contentRevision
      ) {
        client.removeQueries({
          queryKey: hostNotificationKeys.manualOptionsRoot(context),
        });
        disableCurrentTemplate();
        setPreview(null);
        setError(
          "멤버를 불러오는 동안 알림 내용이 변경되었습니다. 최신 저장 결과에서 작성기를 다시 열어 주세요.",
        );
        return null;
      }
      setOptions((current) => cursor
        ? {
            ...current,
            members: {
              items: mergeMembers(current.members.items, nextOptions.members.items),
              nextCursor: nextOptions.members.nextCursor,
            },
          }
        : nextOptions);
      setError(null);
      return nextOptions;
    } catch {
      setError("멤버를 불러오지 못했습니다. 다시 시도해 주세요.");
      return null;
    } finally {
      setMembersLoading(false);
    }
  };

  const updateDraft = (next: HostNotificationComposerDraft) => {
    setDraft(next);
    setPreview(null);
    setError(null);
  };

  const handlePreview = async () => {
    setError(null);
    setPreview(null);
    try {
      setPreview(await previewMutation.mutateAsync(buildComposerSelection(draft)));
    } catch (mutationError) {
      setError(recoverFromMutationError(mutationError, "preview"));
    }
  };

  const handleConfirm = async (resendConfirmed: boolean) => {
    if (!preview) {
      return;
    }
    setError(null);
    try {
      const result = await confirmMutation.mutateAsync({
        ...buildComposerSelection(draft),
        previewId: preview.previewId,
        resendConfirmed,
      });
      onConfirmed?.(result);
      onClose();
    } catch (mutationError) {
      setError(recoverFromMutationError(mutationError, "confirm"));
    }
  };

  return (
    <HostNotificationComposerDialog
      open
      busy={busy || membersLoading}
      onClose={onClose}
    >
      <HostNotificationComposer
        options={options}
        eventType={request.eventType}
        draft={draft}
        preview={preview}
        busy={busy || membersLoading}
        error={error}
        onDraftChange={updateDraft}
        onSearch={async (value) => {
          setSearch(value);
          await loadMembers(value);
        }}
        onLoadMore={async () => {
          if (options.members.nextCursor) {
            await loadMembers(search, options.members.nextCursor);
          }
        }}
        onPreview={handlePreview}
        onConfirm={handleConfirm}
        onSkip={onClose}
      />
    </HostNotificationComposerDialog>
  );
}
