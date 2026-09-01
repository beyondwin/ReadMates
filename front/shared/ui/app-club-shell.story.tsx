import type { ReactNode } from "react";
import type { ClubShellLinkProps, PrimaryNavigationItem } from "../model/app-club-shell";
import { AppClubShell } from "./app-club-shell";
import { GlobalSpaceSwitcher } from "./global-space-switcher";

function StoryLink({ to, replace: _replace, state: _state, children, ...props }: ClubShellLinkProps) {
  void _replace;
  void _state;
  return <a href={to} {...props}>{children}</a>;
}

const primaryItems: PrimaryNavigationItem[] = [
  { id: "today", label: "오늘", href: "/clubs/reading-sai/app", icon: "home", current: true },
  { id: "notes", label: "노트", href: "/clubs/reading-sai/app/notes", icon: "notes", current: false },
  { id: "records", label: "기록", href: "/clubs/reading-sai/app/archive", icon: "archive", current: false },
  { id: "mine", label: "내 공간", href: "/clubs/reading-sai/app/me", icon: "me", current: false },
];

function StorySpaceSwitcher() {
  return (
    <GlobalSpaceSwitcher
      currentIdentity={{
        productSpace: "clubs",
        clubId: "club-reading-sai",
        clubSlug: "reading-sai",
        perspective: "member",
      }}
      options={[
        { identity: { productSpace: "platform" } },
        {
          identity: {
            productSpace: "clubs",
            clubId: "club-reading-sai",
            clubSlug: "reading-sai",
            perspective: "member",
          },
          clubName: "읽는사이",
        },
      ]}
      onSelect={async () => ({ status: "selected" })}
    />
  );
}

export function AppClubShellStory({
  children = <main><h1>오늘의 읽기</h1></main>,
}: {
  children?: ReactNode;
}) {
  return (
    <AppClubShell
      workspace="member"
      primaryItems={primaryItems}
      account={{ control: <button type="button" aria-label="계정 메뉴">계정</button> }}
      brandHref="/clubs/reading-sai/app"
      mobileTitle="읽는사이"
      LinkComponent={StoryLink}
      spaceSwitcher={{
        desktop: <StorySpaceSwitcher />,
        mobile: <StorySpaceSwitcher />,
      }}
    >
      {children}
    </AppClubShell>
  );
}
