import type { ReactNode } from "react";
import type { ClubShellLinkProps, PrimaryNavigationItem } from "@/shared/model/app-club-shell";
import { AppClubShell } from "@/shared/ui/app-club-shell";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { GlobalSpaceSwitcher } from "@/shared/ui/global-space-switcher";
import {
  HostPrimaryNavigation,
  type HostPrimaryDestination,
  type HostPrimaryDestinationId,
} from "./shell/host-primary-navigation";
import { HostUtilityActions } from "./shell/host-utility-actions";
import "./shell/host-shell.css";

export type HostApprovedDestination =
  | "operating-room"
  | "meetings"
  | "people"
  | "records"
  | "settings"
  | "schedule-review"
  | "person-detail";

const HOST_BASE = "/clubs/reading-sai/app/host";

const PRIMARY_HREFS: Record<HostPrimaryDestinationId, string> = {
  "operating-room": HOST_BASE,
  meetings: `${HOST_BASE}/meetings`,
  people: `${HOST_BASE}/people`,
  records: `${HOST_BASE}/records`,
};

const PRIMARY_LABELS: Record<HostPrimaryDestinationId, { desktop: string; mobile: string; icon: PrimaryNavigationItem["icon"] }> = {
  "operating-room": { desktop: "운영실", mobile: "운영실", icon: "host" },
  meetings: { desktop: "일정과 모임", mobile: "모임", icon: "session" },
  people: { desktop: "사람", mobile: "사람", icon: "me" },
  records: { desktop: "기록", mobile: "기록", icon: "archive" },
};

const MOBILE_TITLES: Record<HostApprovedDestination, string> = {
  "operating-room": "읽는사이 운영",
  meetings: "모임",
  people: "사람",
  records: "기록",
  settings: "초대와 설정",
  "schedule-review": "읽는사이 운영",
  "person-detail": "사람",
};

function ApprovedShellLink({ to, replace: _replace, state: _state, children, ...props }: ClubShellLinkProps) {
  void _replace;
  void _state;
  return <a href={to} {...props}>{children}</a>;
}

function primaryIdForDestination(destination: HostApprovedDestination): HostPrimaryDestinationId | null {
  if (destination === "settings") return null;
  if (destination === "person-detail") return "people";
  if (destination === "schedule-review") return "operating-room";
  return destination;
}

function approvedPrimaryDestinations(destination: HostApprovedDestination): HostPrimaryDestination[] {
  const currentId = primaryIdForDestination(destination);
  return (Object.keys(PRIMARY_HREFS) as HostPrimaryDestinationId[]).map((id) => ({
    id,
    href: PRIMARY_HREFS[id],
    current: currentId !== null && id === currentId,
  }));
}

function approvedPrimaryItems(destination: HostApprovedDestination): PrimaryNavigationItem[] {
  return approvedPrimaryDestinations(destination).map((item) => ({
    id: item.id,
    label: PRIMARY_LABELS[item.id].desktop,
    mobileLabel: PRIMARY_LABELS[item.id].mobile,
    href: item.href,
    icon: PRIMARY_LABELS[item.id].icon,
    current: item.current,
  }));
}

function HostApprovedSpaceSwitcher() {
  return (
    <GlobalSpaceSwitcher
      variant="club"
      currentIdentity={{
        productSpace: "clubs",
        clubId: "club-reading-sai",
        clubSlug: "reading-sai",
        perspective: "host",
      }}
      options={[
        { identity: { productSpace: "platform" } },
        {
          identity: {
            productSpace: "clubs",
            clubId: "club-reading-sai",
            clubSlug: "reading-sai",
            perspective: "host",
          },
          clubName: "읽는사이",
        },
      ]}
      onSelect={async () => ({ status: "selected" })}
    />
  );
}

function HostApprovedUtility({ currentId }: { currentId?: "settings" }) {
  return (
    <HostUtilityActions
      settingsHref={`${HOST_BASE}/settings`}
      memberViewHref="/clubs/reading-sai/app"
      notificationsHref={`${HOST_BASE}/notifications`}
      newMeetingHref={`${HOST_BASE}/sessions/new`}
      unreadNotifications={0}
      permissionLimits={[]}
      currentId={currentId}
      LinkComponent={ApprovedShellLink}
    />
  );
}

function HostApprovedMobileUtility({ children }: { children: ReactNode }) {
  return (
    <details className="rm-host-mobile-utility">
      <summary className="rm-host-mobile-utility__trigger" aria-label="호스트 도구">
        <span aria-hidden="true">⋯</span>
      </summary>
      <div className="rm-host-mobile-utility__menu">{children}</div>
    </details>
  );
}

export function HostApprovedShell({
  destination,
  children,
}: {
  destination: HostApprovedDestination;
  children: ReactNode;
}): JSX.Element {
  const destinations = approvedPrimaryDestinations(destination);
  const spaceSwitcher = <HostApprovedSpaceSwitcher />;
  const utility = <HostApprovedUtility currentId={destination === "settings" ? "settings" : undefined} />;

  return (
    <AppClubShell
      workspace="host"
      primaryItems={approvedPrimaryItems(destination)}
      account={{
        control: (
          <button type="button" aria-label="계정 메뉴">
            <AvatarChip avatarKey="mushroom-green-book" name="호스트" label="" sizeRole="navigation" />
          </button>
        ),
      }}
      brandHref={HOST_BASE}
      mobileTitle={MOBILE_TITLES[destination]}
      mobileKicker="호스트"
      mobileBackTarget={destination === "person-detail"
        ? { href: PRIMARY_HREFS.people, label: "사람" }
        : null}
      LinkComponent={ApprovedShellLink}
      spaceSwitcher={{ desktop: spaceSwitcher, mobile: spaceSwitcher }}
      primarySlot={{
        desktop: (
          <HostPrimaryNavigation
            destinations={destinations}
            mode="desktop"
            LinkComponent={ApprovedShellLink}
          />
        ),
      }}
      utilitySlot={{
        desktop: utility,
        mobile: <HostApprovedMobileUtility>{utility}</HostApprovedMobileUtility>,
      }}
    >
      {children}
    </AppClubShell>
  );
}
