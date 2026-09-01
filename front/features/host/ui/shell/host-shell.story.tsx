import type { ReactNode } from "react";
import { AppClubShellHostStory } from "@/shared/ui/app-club-shell.story";
import { HostPrimaryNavigation } from "./host-primary-navigation";
import { HostUtilityActions } from "./host-utility-actions";
import { HostWorkspaceSwitcher } from "./host-workspace-switcher";
import "./host-shell.css";

export function AppClubShellHostChromeStory({ children }: { children: ReactNode }) {
  return <AppClubShellHostStory>{children}</AppClubShellHostStory>;
}

const destinations = [
  { id: "operating-room" as const, href: "/app/host", current: true },
  { id: "meetings" as const, href: "/app/host/sessions", current: false },
  { id: "people" as const, href: "/app/host/people", current: false },
  { id: "records" as const, href: "/app/host/records", current: false },
];

export function HostShellPrimitivesStory({ mode }: { mode: "desktop" | "mobile" }) {
  return (
    <div
      style={{
        width: "100%",
        padding: 12,
        display: "grid",
        gap: 12,
      }}
    >
      <HostWorkspaceSwitcher
        club={{
          name: "아주 긴 한국어와 An exceptionally long English club name을 함께 읽는 모임",
          slug: "long-club",
          avatarKey: "cloud-green-book",
        }}
        clubs={[
          {
            slug: "long-club",
            name: "아주 긴 한국어와 An exceptionally long English club name을 함께 읽는 모임",
            href: "/clubs/long-club/app",
          },
          { slug: "next-club", name: "다음 모임", href: "/clubs/next-club/app" },
        ]}
        currentWorkspace="host"
        workspaceItems={[
          { id: "member", label: "멤버 공간", href: "/clubs/long-club/app/archive" },
          { id: "host", label: "호스트 운영실", href: "/clubs/long-club/app/host" },
        ]}
        onSelectTarget={() => undefined}
      />
      <HostPrimaryNavigation destinations={destinations} mode={mode} />
      <HostUtilityActions
        settingsHref="/app/host/settings"
        memberViewHref="/app"
        notificationsHref="/app/host/notifications"
        newMeetingHref="/app/host/sessions/new"
        unreadNotifications={7}
        permissionLimits={[]}
      />
    </div>
  );
}
