import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router";
import {
  hostClubSettingsHistoryQuery,
  hostClubSettingsQuery,
  publishHostClubSettings,
  useChangeHostCoHost,
  useConfirmHostClubClose,
  usePreviewHostClubClose,
  useUpdateHostClubSettings,
} from "@/features/host/queries/host-club-settings-queries";
import { hostInvitationLinkListQuery, publishHostInvitationLinks, useCreateHostInvitationLink, useUpdateHostInvitationLink } from "@/features/host/queries/host-invitation-link-queries";
import { hostMemberListQuery } from "@/features/host/queries/host-members-queries";
import { HostClubCloseDialog } from "@/features/host/ui/settings/host-club-close-dialog";
import { HostClubSettings } from "@/features/host/ui/settings/host-club-settings";
import { HostCoHostManagement } from "@/features/host/ui/settings/host-co-host-management";
import { HostInvitationLinks } from "@/features/host/ui/settings/host-invitation-links";
import { HostSettingsHistory } from "@/features/host/ui/settings/host-settings-history";
import {
  hostCloseConfirmErrorDisposition,
  hostCoHostErrorDisposition,
} from "./host-settings-recovery";
import { publishTransitionAction, TransitionOwnerObsoleteError, useTransitionSafetyOwner } from "@/shared/ui/use-transition-safety-owner";

export function HostSettingsRoute() {
  const { clubSlug = "" } = useParams<{ clubSlug: string }>();
  if (!clubSlug) return null;
  return <ScopedHostSettingsRoute clubSlug={clubSlug} />;
}

function ScopedHostSettingsRoute({ clubSlug }: { clubSlug: string }) {
  const context = { clubSlug };
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
  const [closeOpen, setCloseOpen] = useState(false);
  const [stale, setStale] = useState(false);
  const transitionOwner = useTransitionSafetyOwner(`host-settings:${clubSlug}`, closeOpen);

  const executeAccepted = async <T,>(
    operationId: string,
    level: "L1" | "L2" | "L3",
    request: () => Promise<T>,
    publish: (result: T) => Promise<unknown>,
  ): Promise<T> => {
    const handle = transitionOwner.begin(operationId, level, async () => ({ operationId, outcome: "still-unknown" }));
    try {
      const result = await request();
      if (await handle.settle("succeeded") !== "accepted") throw new TransitionOwnerObsoleteError();
      await publishTransitionAction(handle, "cache", () => publish(result));
      return result;
    } catch (error) {
      if (error instanceof TransitionOwnerObsoleteError) throw error;
      if (await handle.settle("failed") !== "accepted") throw new TransitionOwnerObsoleteError();
      throw error;
    } finally {
      handle.completePublication();
    }
  };

  const executeUiAccepted = async <T,>(
    operationId: string,
    level: "L1" | "L2" | "L3",
    request: () => Promise<T>,
  ): Promise<T> => {
    const handle = transitionOwner.begin(operationId, level, async () => ({ operationId, outcome: "still-unknown" }));
    try {
      const result = await request();
      if (await handle.settle("succeeded") !== "accepted") throw new TransitionOwnerObsoleteError();
      return await publishTransitionAction(handle, "ui", () => result);
    } catch (error) {
      if (error instanceof TransitionOwnerObsoleteError) throw error;
      if (await handle.settle("failed") !== "accepted") throw new TransitionOwnerObsoleteError();
      throw error;
    } finally {
      handle.completePublication();
    }
  };

  const refreshSettingsSurface = async () => {
    await Promise.all([
      settings.refetch(),
      members.refetch(),
      history.refetch(),
    ]);
  };

  async function save(request: Parameters<typeof updateSettings.mutateAsync>[0]) {
    setStale(false);
    try {
      await executeAccepted(
        `host-settings:update:${request.idempotencyKey}`,
        "L2",
        () => updateSettings.mutateAsync(request),
        () => publishHostClubSettings(queryClient, context),
      );
    } catch (error) {
      if (error instanceof Error && /STALE|REVISION|409/.test(error.message)) setStale(true);
      throw error;
    }
  }

  return <>
    <HostInvitationLinks links={links.data?.items ?? []} loading={links.isPending} error={links.isError ? "초대 링크를 불러오지 못했습니다." : null} onRetry={() => { void links.refetch(); }} onRefresh={() => links.refetch()} onCreate={(request) => executeAccepted(`host-invitation-link:create:${request.idempotencyKey}`, "L2", () => createLink.mutateAsync(request), () => publishHostInvitationLinks(queryClient, context))} onUpdate={(linkId, request) => executeAccepted(`host-invitation-link:update:${linkId}:${request.idempotencyKey}`, "L2", () => updateLink.mutateAsync({ linkId, request }), () => publishHostInvitationLinks(queryClient, context))} />
    {settings.isPending ? <section className="surface-quiet" role="status">클럽 설정을 불러오는 중입니다.</section> : null}
    {settings.isError ? <section className="surface-quiet" role="alert"><p>클럽 설정을 불러오지 못했습니다.</p><button type="button" onClick={() => { void settings.refetch(); }}>다시 시도</button></section> : null}
    {settings.data ? <HostClubSettings key={settings.data.revision} settings={settings.data} saving={updateSettings.isPending} stale={stale} error={updateSettings.isError && !stale ? "설정 저장 결과를 확인할 수 없습니다. 최신 revision을 확인해 주세요." : null} onSave={save} /> : null}
    {settings.data && members.data ? (
      <HostCoHostManagement
        settingsRevision={settings.data.revision}
        members={members.data.items.map((member) => ({
          membershipId: member.membershipId,
          displayName: member.displayName,
          avatarKey: member.avatarKey,
          status: member.status,
          role: member.role,
        }))}
        busy={changeCoHost.isPending}
        onChange={(request) => executeAccepted(`host-settings:co-host:${request.membershipId}:${request.idempotencyKey}`, "L2", () => changeCoHost.mutateAsync(request), () => publishHostClubSettings(queryClient, context))}
        onRefresh={refreshSettingsSurface}
        classifyChangeError={hostCoHostErrorDisposition}
      />
    ) : null}
    {members.isError ? <section className="surface-quiet" role="alert">공동 호스트 후보를 불러오지 못했습니다.</section> : null}
    {history.data ? (
      <HostSettingsHistory
        key={`${history.data.items[0]?.historyId ?? "empty"}:${history.data.nextCursor ?? "end"}`}
        page={history.data}
        onLoadMore={(cursor) => queryClient.fetchQuery(hostClubSettingsHistoryQuery({ limit: 20, cursor }, context))}
      />
    ) : null}
    {history.isPending ? <section className="surface-quiet" role="status">설정 변경 이력을 불러오는 중입니다.</section> : null}
    {history.isError ? <section className="surface-quiet" role="alert">설정 변경 이력을 불러오지 못했습니다.</section> : null}
    <section className="surface-quiet stack rm-host-editorial-ledger__panel"><h2>클럽 운영 종료</h2><p className="small muted">종료 전 영향을 미리 확인하고 같은 확인 내용으로만 실행합니다.</p><button className="btn-quiet" type="button" onClick={() => setCloseOpen(true)}>종료 검토</button><HostClubCloseDialog open={closeOpen} onClose={() => setCloseOpen(false)} onPreview={() => executeUiAccepted("host-settings:close-preview", "L3", () => previewClose.mutateAsync())} onConfirm={(request) => executeAccepted(`host-settings:close-confirm:${request.idempotencyKey}`, "L3", () => confirmClose.mutateAsync(request), () => publishHostClubSettings(queryClient, context))} onRefresh={refreshSettingsSurface} classifyConfirmError={hostCloseConfirmErrorDisposition} /></section>
  </>;
}
