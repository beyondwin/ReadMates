import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import type { HostClubSettings as Settings } from "@/features/host/api/host-club-settings-contracts";
import { hostClubSettingsQuery, useConfirmHostClubClose, usePreviewHostClubClose, useUpdateHostClubSettings } from "@/features/host/queries/host-club-settings-queries";
import { hostInvitationLinkListQuery, useCreateHostInvitationLink, useUpdateHostInvitationLink } from "@/features/host/queries/host-invitation-link-queries";
import { HostClubCloseDialog } from "@/features/host/ui/settings/host-club-close-dialog";
import { HostClubSettings } from "@/features/host/ui/settings/host-club-settings";
import { HostInvitationLinks } from "@/features/host/ui/settings/host-invitation-links";

export function HostSettingsRoute() {
  const { clubSlug = "" } = useParams<{ clubSlug: string }>();
  if (!clubSlug) return null;
  return <ScopedHostSettingsRoute clubSlug={clubSlug} />;
}

function ScopedHostSettingsRoute({ clubSlug }: { clubSlug: string }) {
  const context = { clubSlug };
  const settings = useQuery(hostClubSettingsQuery(context));
  const links = useQuery(hostInvitationLinkListQuery(undefined, context));
  const updateSettings = useUpdateHostClubSettings(context);
  const createLink = useCreateHostInvitationLink(context);
  const updateLink = useUpdateHostInvitationLink(context);
  const previewClose = usePreviewHostClubClose(context);
  const confirmClose = useConfirmHostClubClose(context);
  const [closeOpen, setCloseOpen] = useState(false);
  const [stale, setStale] = useState(false);

  async function save(request: Parameters<typeof updateSettings.mutateAsync>[0]) {
    setStale(false);
    try { await updateSettings.mutateAsync(request); } catch (error) {
      if (error instanceof Error && /STALE|REVISION|409/.test(error.message)) setStale(true);
      throw error;
    }
  }

  return <>
    <HostInvitationLinks links={links.data?.items ?? []} loading={links.isPending} error={links.isError ? "초대 링크를 불러오지 못했습니다." : null} onRetry={() => { void links.refetch(); }} onRefresh={() => links.refetch()} onCreate={(request) => createLink.mutateAsync(request)} onUpdate={(linkId, request) => updateLink.mutateAsync({ linkId, request })} />
    {settings.isPending ? <section className="surface-quiet" role="status">클럽 설정을 불러오는 중입니다.</section> : null}
    {settings.isError ? <section className="surface-quiet" role="alert"><p>클럽 설정을 불러오지 못했습니다.</p><button type="button" onClick={() => { void settings.refetch(); }}>다시 시도</button></section> : null}
    {settings.data ? <HostClubSettings key={settings.data.revision} settings={settings.data as Settings} saving={updateSettings.isPending} stale={stale} error={updateSettings.isError && !stale ? "설정 저장 결과를 확인할 수 없습니다. 최신 revision을 확인해 주세요." : null} onSave={save} /> : null}
    <section className="surface-quiet stack rm-host-editorial-ledger__panel"><h2>클럽 운영 종료</h2><p className="small muted">종료 전 영향을 미리 확인하고 같은 확인 내용으로만 실행합니다.</p><button className="btn-quiet" type="button" onClick={() => setCloseOpen(true)}>종료 검토</button><HostClubCloseDialog open={closeOpen} onClose={() => setCloseOpen(false)} onPreview={() => previewClose.mutateAsync()} onConfirm={(request) => confirmClose.mutateAsync(request)} onRefresh={() => settings.refetch()} /></section>
  </>;
}
