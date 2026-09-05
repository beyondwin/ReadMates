import { useState } from "react";
import type { HostCoHostMemberView, HostSettingsView } from "@/features/host/model/host-settings-model";
import { HostClubSettings } from "@/features/host/ui/settings/host-club-settings";
import { HostCoHostManagement } from "@/features/host/ui/settings/host-co-host-management";
import { HostInvitationLinks, type HostInvitationEditDraft } from "@/features/host/ui/settings/host-invitation-links";
import { HostSettingsHistory } from "@/features/host/ui/settings/host-settings-history";
import { HostSettingsColumns, HostSettingsPage } from "@/features/host/ui/settings/host-settings-page";

const noop = () => undefined;

const settings: HostSettingsView = {
  clubId: "club-fixture",
  clubSlug: "reading-sai",
  name: "읽는 사이",
  approvalPolicy: "INVITE_ONLY",
  defaultTimezone: "Asia/Seoul",
  scheduleReminderEnabled: true,
  recordPublicationDefault: "MEMBER",
  revision: 7,
  status: "ACTIVE",
};

const coHosts: HostCoHostMemberView[] = [{
  membershipId: "membership-7",
  displayName: "정하늘",
  avatarKey: "banana-green-book",
  status: "ACTIVE",
  role: "MEMBER",
}];

export function HostSettingsDestinationStory() {
  const [settingsDraft, setSettingsDraft] = useState(settings);
  const [createDraft, setCreateDraft] = useState({ name: "", maxUses: "20", expiresAt: "2026-09-30" });
  const [editDraft, setEditDraft] = useState<HostInvitationEditDraft | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [showHosts, setShowHosts] = useState(true);
  const [showHistory, setShowHistory] = useState(true);

  return (
    <HostSettingsPage
      createCta={(
        <button className="btn btn-primary" type="button" aria-expanded={createOpen} onClick={() => setCreateOpen((open) => !open)}>
          새 초대 링크
        </button>
      )}
    >
      <HostSettingsColumns
        invitations={(
          <HostInvitationLinks
            links={[]}
            loading={false}
            error={null}
            busy={false}
            createDraft={createDraft}
            editDraft={editDraft}
            sharePath={null}
            message={null}
            alert={null}
            onRetry={noop}
            onRefresh={noop}
            onCreateDraftChange={setCreateDraft}
            onEditDraftChange={setEditDraft}
            onCreate={noop}
            onUpdate={noop}
            onToggle={noop}
            onRetryCommand={noop}
            onCopySharePath={noop}
            createOpen={createOpen}
            onCreateOpenChange={setCreateOpen}
            showCreateTrigger={false}
          />
        )}
        clubSettings={(
          <HostClubSettings
            settings={settings}
            draft={settingsDraft}
            saving={false}
            stale={false}
            error={null}
            onDraftChange={setSettingsDraft}
            onSave={noop}
            onManageHosts={() => setShowHosts((open) => !open)}
            onOpenHistory={() => setShowHistory((open) => !open)}
          />
        )}
        extra={(
          <>
            {showHosts ? (
              <HostCoHostManagement
                settingsRevision={7}
                members={coHosts}
                busy={false}
                alert={null}
                canRetry={false}
                onChange={noop}
                onRefresh={noop}
                onRetryCommand={noop}
              />
            ) : null}
            {showHistory ? (
              <HostSettingsHistory
                page={{ items: [], nextCursor: null }}
                onLoadMore={async () => ({ items: [], nextCursor: null })}
              />
            ) : null}
          </>
        )}
      />
    </HostSettingsPage>
  );
}
