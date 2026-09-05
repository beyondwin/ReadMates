import { useState } from "react";
import { approvedClubSettings, approvedInvitationLinks } from "./approved-host-ledgers.data";
import { HostApprovedShell } from "./approved-host-shell";
import { HostClubSettings } from "./settings/host-club-settings";
import {
  HostInvitationLinks,
  type HostInvitationCreateDraft,
} from "./settings/host-invitation-links";
import { HostSettingsColumns, HostSettingsPage } from "./settings/host-settings-page";

const noop = () => undefined;

const invitationCreateDraft: HostInvitationCreateDraft = {
  name: "",
  maxUses: "20",
  expiresAt: "2026-09-30",
};

export function HostSettingsApprovedStory() {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <HostApprovedShell destination="settings">
      <HostSettingsPage
        createCta={(
          <button
            className="btn btn-primary"
            type="button"
            aria-expanded={createOpen}
            onClick={() => setCreateOpen((open) => !open)}
          >
            새 초대 링크
          </button>
        )}
      >
        <HostSettingsColumns
          invitations={(
            <HostInvitationLinks
              links={approvedInvitationLinks}
              loading={false}
              error={null}
              busy={false}
              createDraft={invitationCreateDraft}
              editDraft={null}
              sharePath={null}
              message={null}
              alert={null}
              onRetry={noop}
              onRefresh={noop}
              onCreateDraftChange={noop}
              onEditDraftChange={noop}
              onCreate={noop}
              onUpdate={noop}
              onToggle={noop}
              onRetryCommand={noop}
              onCopySharePath={noop}
              now={new Date("2026-09-02T11:04:00+09:00")}
              createOpen={createOpen}
              onCreateOpenChange={setCreateOpen}
              showCreateTrigger={false}
            />
          )}
          clubSettings={(
            <HostClubSettings
              settings={approvedClubSettings}
              draft={approvedClubSettings}
              saving={false}
              stale={false}
              error={null}
              hostCount="1명"
              onDraftChange={noop}
              onSave={noop}
              onCloseReview={noop}
            />
          )}
        />
      </HostSettingsPage>
    </HostApprovedShell>
  );
}
