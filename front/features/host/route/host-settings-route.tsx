import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router";
import type { HostClubSettings as HostClubSettingsContract } from "@/features/host/api/host-club-settings-contracts";
import type { HostInvitationLinkCreateResult } from "@/features/host/api/host-invitation-link-contracts";
import type {
  HostCoHostChangeRequest,
  HostClosePreviewView,
  HostCoHostMemberView,
  HostInvitationLinkUpdateRequest,
  HostInvitationLinkView,
  HostSettingsUpdateRequest,
  HostSettingsView,
} from "@/features/host/model/host-settings-model";
import {
  hostClubSettingsHistoryQuery,
  hostClubSettingsQuery,
  publishHostClubSettings,
  useChangeHostCoHost,
  useConfirmHostClubClose,
  usePreviewHostClubClose,
  useUpdateHostClubSettings,
} from "@/features/host/queries/host-club-settings-queries";
import {
  hostInvitationLinkListQuery,
  publishHostInvitationLinks,
  useCreateHostInvitationLink,
  useUpdateHostInvitationLink,
} from "@/features/host/queries/host-invitation-link-queries";
import { hostMemberListQuery, invalidateHostMembers } from "@/features/host/queries/host-members-queries";
import { HostClubCloseDialog, type HostCloseRecovery } from "@/features/host/ui/settings/host-club-close-dialog";
import { HostClubSettings } from "@/features/host/ui/settings/host-club-settings";
import { HostCoHostManagement } from "@/features/host/ui/settings/host-co-host-management";
import {
  HostInvitationLinks,
  type HostInvitationCommandAlert,
  type HostInvitationCreateDraft,
  type HostInvitationEditDraft,
} from "@/features/host/ui/settings/host-invitation-links";
import { HostSettingsHistory } from "@/features/host/ui/settings/host-settings-history";
import { isReadmatesTransportError } from "@/shared/api/errors";
import { publishTransitionAction, TransitionOwnerObsoleteError, useTransitionSafetyOwner } from "@/shared/ui/use-transition-safety-owner";
import { createHostSettingsReceiptCapsule } from "./host-settings-receipt-capsule";
import {
  hostCloseConfirmErrorDisposition,
  hostCoHostErrorDisposition,
  hostInvitationLinkUpdateErrorDisposition,
  hostSettingsUpdateErrorDisposition,
} from "./host-settings-recovery";

type SettingsMutationResult = { settings: HostClubSettingsContract };
type CloseConfirmRequest = { previewId: string; effectHash: string; idempotencyKey: string };
type SettingsCommand =
  | { kind: "settings"; request: HostSettingsUpdateRequest }
  | { kind: "co-host"; request: HostCoHostChangeRequest }
  | { kind: "link-create"; request: { name: string; maxUses: number; expiresAt: string; idempotencyKey: string } }
  | { kind: "link-update"; linkId: string; request: HostInvitationLinkUpdateRequest }
  | { kind: "close-confirm"; request: CloseConfirmRequest };

const commandOperationId = (command: SettingsCommand) => `host-settings:${command.kind}:${command.request.idempotencyKey}`;
const expiryIso = (date: string) => new Date(`${date}T23:59:59Z`).toISOString();
const defaultExpiry = () => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
const emptyCreateDraft = (expiresAt: string): HostInvitationCreateDraft => ({ name: "", maxUses: "20", expiresAt });

function settingsDraftChanged(current: HostSettingsView | null, source: HostSettingsView | undefined) {
  if (!current || !source) return false;
  return current.name !== source.name
    || current.approvalPolicy !== source.approvalPolicy
    || current.defaultTimezone !== source.defaultTimezone
    || current.scheduleReminderEnabled !== source.scheduleReminderEnabled
    || current.recordPublicationDefault !== source.recordPublicationDefault;
}

export function HostSettingsRoute() {
  const { clubSlug = "" } = useParams<{ clubSlug: string }>();
  if (!clubSlug) return null;
  return <ScopedHostSettingsRoute clubSlug={clubSlug} />;
}

function ScopedHostSettingsRoute({ clubSlug }: { clubSlug: string }) {
  const context = useMemo(() => ({ clubSlug }), [clubSlug]);
  const queryClient = useQueryClient();
  const settings = useQuery(hostClubSettingsQuery(context));
  const links = useQuery(hostInvitationLinkListQuery(undefined, context));
  const members = useQuery(hostMemberListQuery({ limit: 50 }, context));
  const history = useQuery(hostClubSettingsHistoryQuery({ limit: 20 }, context));
  const updateSettings = useUpdateHostClubSettings(context);
  const changeCoHost = useChangeHostCoHost(context);
  const createLink = useCreateHostInvitationLink(context);
  const updateLink = useUpdateHostInvitationLink(context);
  const previewClose = usePreviewHostClubClose(context);
  const confirmClose = useConfirmHostClubClose(context);
  const [initialExpiry] = useState(defaultExpiry);
  const [settingsDraft, setSettingsDraft] = useState<HostSettingsView | null>(null);
  const [createDraft, setCreateDraft] = useState(() => emptyCreateDraft(initialExpiry));
  const [editDraft, setEditDraft] = useState<HostInvitationEditDraft | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closePreview, setClosePreview] = useState<HostClosePreviewView | null>(null);
  const [closePreviewError, setClosePreviewError] = useState(false);
  const [closeRecovery, setCloseRecovery] = useState<HostCloseRecovery>(null);
  const [stale, setStale] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [linkSharePath, setLinkSharePath] = useState<string | null>(null);
  const [linkMessage, setLinkMessage] = useState<string | null>(null);
  const [linkAlert, setLinkAlert] = useState<HostInvitationCommandAlert | null>(null);
  const [coHostAlert, setCoHostAlert] = useState<string | null>(null);
  const [pendingIdentity, setPendingIdentity] = useState<SettingsCommand | null>(null);
  const [busyOperationId, setBusyOperationId] = useState<string | null>(null);
  const visibleSettingsDraft = settings.data && settingsDraft?.revision === settings.data.revision
    ? settingsDraft
    : settings.data ?? null;
  const draftDirty = settingsDraftChanged(visibleSettingsDraft, settings.data)
    || createDraft.name.trim() !== ""
    || createDraft.maxUses !== "20"
    || createDraft.expiresAt !== initialExpiry
    || editDraft !== null;
  const transitionOwner = useTransitionSafetyOwner(
    `host-settings:${clubSlug}`,
    closeOpen || draftDirty || pendingIdentity !== null || busyOperationId !== null,
    "작성 중인 클럽 설정 또는 확인할 운영 요청이 있습니다.",
  );

  const executeCommandRequest = async (command: SettingsCommand): Promise<unknown> => {
    switch (command.kind) {
      case "settings": return updateSettings.mutateAsync(command.request);
      case "co-host": return changeCoHost.mutateAsync(command.request);
      case "link-create": return createLink.mutateAsync(command.request);
      case "link-update": return updateLink.mutateAsync({ linkId: command.linkId, request: command.request });
      case "close-confirm": return confirmClose.mutateAsync(command.request);
    }
  };

  const publishSettingsSurface = async () => {
    await Promise.all([
      publishHostClubSettings(queryClient, context),
      publishHostInvitationLinks(queryClient, context),
      invalidateHostMembers(queryClient, context),
    ]);
  };

  const clearBusy = (operationId: string) => {
    setBusyOperationId((current) => current === operationId ? null : current);
  };

  const clearPending = (operationId: string) => {
    setPendingIdentity((current) => current && commandOperationId(current) === operationId ? null : current);
  };

  const publishCommandSuccess = async (command: SettingsCommand, result: unknown, handle: ReturnType<typeof transitionOwner.beginReceipt>) => {
    const operationId = commandOperationId(command);
    if (command.kind === "link-create") {
      const created = result as HostInvitationLinkCreateResult;
      await publishTransitionAction(handle, "receiptCallback", () => {
        setLinkSharePath(created.oneTimeSharePath);
        setCreateDraft(emptyCreateDraft(initialExpiry));
        setLinkAlert(null);
        clearPending(operationId);
      });
      await publishTransitionAction(handle, "successCopy", () => {
        setLinkMessage(created.oneTimeSharePath ? null : "이 요청은 이미 처리되었습니다. 안전을 위해 링크는 다시 표시하지 않습니다.");
      });
      return;
    }
    await publishTransitionAction(handle, "ui", () => {
      clearPending(operationId);
      if (command.kind === "settings") {
        const updated = (result as SettingsMutationResult).settings;
        setSettingsDraft(updated);
        setStale(false);
        setSettingsError(null);
      } else if (command.kind === "co-host") {
        setCoHostAlert(null);
      } else if (command.kind === "link-update") {
        setEditDraft(null);
        setLinkAlert(null);
        setLinkMessage(null);
      } else {
        setClosePreview(null);
        setCloseRecovery(null);
      }
    });
  };

  const publishCommandFailure = async (command: SettingsCommand, error: unknown, handle: ReturnType<typeof transitionOwner.beginReceipt>) => {
    const operationId = commandOperationId(command);
    await publishTransitionAction(handle, "errorCopy", () => {
      if (command.kind === "settings") {
        const disposition = hostSettingsUpdateErrorDisposition(error);
        setStale(disposition === "stale");
        setSettingsError(disposition === "stale" ? null : disposition === "unknown"
          ? "설정 저장 결과를 확인할 수 없습니다. 최신 revision을 확인한 뒤 같은 요청으로 다시 확인해 주세요."
          : "서버가 설정 변경 요청을 거절했습니다. 최신 revision에서 새 요청을 만들어 주세요.");
        if (disposition !== "unknown") clearPending(operationId);
        return;
      }
      if (command.kind === "co-host") {
        const failure = hostCoHostErrorDisposition(error);
        setCoHostAlert(failure === "permission"
          ? "서버가 현재 호스트 권한 변경을 허용하지 않았습니다. 최신 운영 상태를 확인해 주세요."
          : failure === "stale"
            ? "설정 revision이 변경되었습니다. 최신 운영 상태에서 새 요청을 만들어 주세요."
            : failure === "unknown"
              ? "권한 변경 결과를 확인할 수 없습니다. 최신 상태를 확인한 뒤 같은 요청으로 다시 확인할 수 있습니다."
              : "서버가 권한 변경 요청을 거절했습니다. 최신 운영 상태에서 새 요청을 만들어 주세요.");
        if (failure !== "unknown") clearPending(operationId);
        return;
      }
      if (command.kind === "link-create" || command.kind === "link-update") {
        const disposition = command.kind === "link-update"
          ? hostInvitationLinkUpdateErrorDisposition(error)
          : isReadmatesTransportError(error) ? "unknown" : "rejected";
        const staleLink = disposition === "stale";
        if (staleLink) setEditDraft(null);
        setLinkAlert({
          message: staleLink
            ? "링크가 변경되었습니다. 최신 상태를 확인한 뒤 다시 편집해 주세요."
            : disposition === "unknown" && command.kind === "link-create"
              ? "링크 생성 결과를 확인할 수 없습니다. 최신 목록을 확인하거나 같은 요청으로 다시 확인해 주세요."
              : disposition === "unknown"
                ? "링크 변경 결과를 확인할 수 없습니다. 같은 요청으로 다시 확인할 수 있습니다."
                : "서버가 링크 요청을 거절했습니다. 최신 상태에서 새 요청을 만들어 주세요.",
          refreshLabel: staleLink ? "최신 링크 상태 확인" : "최신 목록 확인",
          retryLabel: disposition !== "unknown" ? null : command.kind === "link-create" ? "같은 요청 다시 확인" : "같은 변경 요청 다시 확인",
        });
        if (disposition !== "unknown") clearPending(operationId);
        return;
      }
      const disposition = hostCloseConfirmErrorDisposition(error);
      setClosePreview(null);
      setCloseRecovery(disposition);
      if (disposition !== "unknown") clearPending(operationId);
    });
  };

  const runCommand = async (command: SettingsCommand) => {
    const operationId = commandOperationId(command);
    setPendingIdentity(command);
    setBusyOperationId(operationId);
    setLinkAlert(null);
    setCoHostAlert(null);
    setSettingsError(null);
    const capsule = createHostSettingsReceiptCapsule({
      operationId,
      request: command,
      replayLookup: executeCommandRequest,
    });
    const handle = transitionOwner.beginReceipt(capsule);
    let settled = false;
    try {
      const result = await executeCommandRequest(command);
      if (await handle.settle("succeeded") !== "accepted") throw new TransitionOwnerObsoleteError();
      settled = true;
      await publishTransitionAction(handle, "cache", publishSettingsSurface);
      await publishCommandSuccess(command, result, handle);
    } catch (error) {
      if (error instanceof TransitionOwnerObsoleteError) {
        clearPending(operationId);
        return;
      }
      if (settled || await handle.settle("failed") !== "accepted") {
        clearPending(operationId);
        return;
      }
      try {
        await publishTransitionAction(handle, "cache", publishSettingsSurface);
        await publishCommandFailure(command, error, handle);
      } catch (publicationError) {
        if (!(publicationError instanceof TransitionOwnerObsoleteError)) throw publicationError;
        clearPending(operationId);
      }
    } finally {
      handle.completePublication();
      clearBusy(operationId);
    }
  };

  const runClosePreview = async () => {
    const operationId = "host-settings:close-preview";
    setBusyOperationId(operationId);
    setClosePreviewError(false);
    setCloseRecovery(null);
    const handle = transitionOwner.begin(operationId, "L3", async () => ({ operationId, outcome: "still-unknown" }));
    try {
      const result = await previewClose.mutateAsync();
      if (await handle.settle("succeeded") !== "accepted") throw new TransitionOwnerObsoleteError();
      await publishTransitionAction(handle, "ui", () => setClosePreview(result));
    } catch (error) {
      if (error instanceof TransitionOwnerObsoleteError) return;
      if (await handle.settle("failed") !== "accepted") return;
      await publishTransitionAction(handle, "errorCopy", () => setClosePreviewError(true));
    } finally {
      handle.completePublication();
      clearBusy(operationId);
    }
  };

  const refreshSettingsSurface = () => {
    void Promise.allSettled([settings.refetch(), links.refetch(), members.refetch(), history.refetch()]);
  };

  const retryPendingCommand = () => {
    if (pendingIdentity) void runCommand(pendingIdentity);
  };

  const updateCreateDraft = (draft: HostInvitationCreateDraft) => {
    setCreateDraft(draft);
    setLinkAlert(null);
    if (pendingIdentity?.kind === "link-create") setPendingIdentity(null);
  };

  const updateEditDraft = (draft: HostInvitationEditDraft | null) => {
    setEditDraft(draft);
    setLinkAlert(null);
    if (pendingIdentity?.kind === "link-update") setPendingIdentity(null);
  };

  const startLinkCreate = () => {
    void runCommand({
      kind: "link-create",
      request: {
        name: createDraft.name.trim(),
        maxUses: Number(createDraft.maxUses),
        expiresAt: expiryIso(createDraft.expiresAt),
        idempotencyKey: crypto.randomUUID(),
      },
    });
  };

  const startLinkUpdate = (item: HostInvitationLinkView) => {
    if (!editDraft || editDraft.linkId !== item.linkId) return;
    void runCommand({
      kind: "link-update",
      linkId: item.linkId,
      request: {
        name: editDraft.name.trim(),
        maxUses: Number(editDraft.maxUses),
        expiresAt: expiryIso(editDraft.expiresAt),
        expectedRevision: item.revision,
        status: item.status === "PAUSED" ? "PAUSED" : "ACTIVE",
        idempotencyKey: crypto.randomUUID(),
      },
    });
  };

  const toggleLink = (item: HostInvitationLinkView) => {
    void runCommand({
      kind: "link-update",
      linkId: item.linkId,
      request: {
        name: item.name,
        maxUses: item.maxUses,
        expiresAt: item.expiresAt,
        expectedRevision: item.revision,
        status: item.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
        idempotencyKey: crypto.randomUUID(),
      },
    });
  };

  const changeCoHostRole = (member: HostCoHostMemberView) => {
    if (!settings.data) return;
    void runCommand({
      kind: "co-host",
      request: {
        membershipId: member.membershipId,
        action: member.role === "HOST" ? "demote" : "promote",
        expectedRevision: settings.data.revision,
        idempotencyKey: crypto.randomUUID(),
      },
    });
  };

  const saveSettings = () => {
    if (!visibleSettingsDraft || !settings.data) return;
    void runCommand({
      kind: "settings",
      request: {
        name: visibleSettingsDraft.name.trim(),
        approvalPolicy: visibleSettingsDraft.approvalPolicy,
        defaultTimezone: visibleSettingsDraft.defaultTimezone.trim(),
        scheduleReminderEnabled: visibleSettingsDraft.scheduleReminderEnabled,
        recordPublicationDefault: visibleSettingsDraft.recordPublicationDefault,
        expectedRevision: settings.data.revision,
        idempotencyKey: crypto.randomUUID(),
      },
    });
  };

  const startCloseConfirm = () => {
    if (!closePreview) return;
    void runCommand({
      kind: "close-confirm",
      request: {
        previewId: closePreview.previewId,
        effectHash: closePreview.effectHash,
        idempotencyKey: crypto.randomUUID(),
      },
    });
  };

  const copySharePath = async () => {
    if (!linkSharePath) return;
    await navigator.clipboard.writeText(linkSharePath);
    setLinkSharePath(null);
    setLinkMessage("복사했습니다. 이 화면에서는 링크를 다시 표시하지 않습니다.");
  };

  const busy = busyOperationId !== null;

  return <>
    <HostInvitationLinks
      links={links.data?.items ?? []}
      loading={links.isPending}
      error={links.isError ? "초대 링크를 불러오지 못했습니다." : null}
      busy={busy}
      createDraft={createDraft}
      editDraft={editDraft}
      sharePath={linkSharePath}
      message={linkMessage}
      alert={linkAlert}
      onRetry={() => { void links.refetch(); }}
      onRefresh={refreshSettingsSurface}
      onCreateDraftChange={updateCreateDraft}
      onEditDraftChange={updateEditDraft}
      onCreate={startLinkCreate}
      onUpdate={startLinkUpdate}
      onToggle={toggleLink}
      onRetryCommand={retryPendingCommand}
      onCopySharePath={() => { void copySharePath(); }}
    />
    {settings.isPending ? <section className="surface-quiet" role="status">클럽 설정을 불러오는 중입니다.</section> : null}
    {settings.isError ? <section className="surface-quiet" role="alert"><p>클럽 설정을 불러오지 못했습니다.</p><button type="button" onClick={() => { void settings.refetch(); }}>다시 시도</button></section> : null}
    {settings.data && visibleSettingsDraft ? <HostClubSettings settings={settings.data} draft={visibleSettingsDraft} saving={busy} stale={stale} error={settingsError} onDraftChange={(draft) => { setSettingsDraft(draft); setStale(false); setSettingsError(null); if (pendingIdentity?.kind === "settings") setPendingIdentity(null); }} onSave={saveSettings} /> : null}
    {settings.data && members.data ? (
      <HostCoHostManagement
        settingsRevision={settings.data.revision}
        members={members.data.items.map((member) => ({ membershipId: member.membershipId, displayName: member.displayName, avatarKey: member.avatarKey, status: member.status, role: member.role }))}
        busy={busy}
        alert={coHostAlert}
        canRetry={pendingIdentity?.kind === "co-host"}
        onChange={changeCoHostRole}
        onRefresh={refreshSettingsSurface}
        onRetryCommand={retryPendingCommand}
      />
    ) : null}
    {members.isError ? <section className="surface-quiet" role="alert">공동 호스트 후보를 불러오지 못했습니다.</section> : null}
    {history.data ? <HostSettingsHistory key={`${history.data.items[0]?.historyId ?? "empty"}:${history.data.nextCursor ?? "end"}`} page={history.data} onLoadMore={(cursor) => queryClient.fetchQuery(hostClubSettingsHistoryQuery({ limit: 20, cursor }, context))} /> : null}
    {history.isPending ? <section className="surface-quiet" role="status">설정 변경 이력을 불러오는 중입니다.</section> : null}
    {history.isError ? <section className="surface-quiet" role="alert">설정 변경 이력을 불러오지 못했습니다.</section> : null}
    <section className="surface-quiet stack rm-host-editorial-ledger__panel">
      <h2>클럽 운영 종료</h2><p className="small muted">종료 전 영향을 미리 확인하고 같은 확인 내용으로만 실행합니다.</p>
      <button className="btn-quiet" type="button" onClick={() => setCloseOpen(true)}>종료 검토</button>
      <HostClubCloseDialog
        open={closeOpen}
        preview={closePreview}
        busy={busy}
        previewError={closePreviewError}
        recovery={closeRecovery}
        canRetryConfirm={pendingIdentity?.kind === "close-confirm"}
        onClose={() => setCloseOpen(false)}
        onPreview={() => { void runClosePreview(); }}
        onConfirm={startCloseConfirm}
        onRefresh={refreshSettingsSurface}
        onRetryConfirm={retryPendingCommand}
      />
    </section>
  </>;
}
