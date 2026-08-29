import type { ReactNode } from "react";
import type {
  AccountMenuModel,
  ClubNavigationItem,
  ClubShellBackTarget,
  ClubShellLinkComponent,
  ClubShellResponsiveSlot,
  ClubWorkspace,
  PrimaryNavigationItem,
  WorkspaceNavigationItem,
} from "../model/app-club-shell";
import { MobileHeader } from "./mobile-header";
import { MobileTabBar } from "./mobile-tab-bar";
import { TopNav } from "./top-nav";
import { SelectorChevron, WorkspaceSelector } from "./workspace-selector";

export type AppClubShellProps = {
  clubs: ReadonlyArray<ClubNavigationItem>;
  currentClubSlug: string;
  workspace: ClubWorkspace;
  workspaceItems: ReadonlyArray<WorkspaceNavigationItem>;
  primaryItems: ReadonlyArray<PrimaryNavigationItem>;
  account: AccountMenuModel;
  brandHref: string;
  mobileTitle: string;
  mobileKicker?: string | null;
  mobileBackTarget?: ClubShellBackTarget | null;
  LinkComponent: ClubShellLinkComponent;
  contextSlot?: ClubShellResponsiveSlot;
  beforeContent?: ReactNode;
  securityController?: ReactNode;
  desktopFooter?: ReactNode;
  children: ReactNode;
};

function ClubSelector({
  clubs,
  currentClubSlug,
  LinkComponent,
}: Pick<AppClubShellProps, "clubs" | "currentClubSlug" | "LinkComponent">) {
  const current = clubs.find((club) => club.slug === currentClubSlug) ?? clubs[0];

  if (!current) {
    return null;
  }

  return (
    <details className="rm-context-selector rm-club-selector">
      <summary className="rm-context-selector__trigger rm-club-selector__trigger" aria-label={`현재 클럽 ${current.name}`}>
        <span className="rm-context-selector__kind">클럽</span>
        <strong title={current.name}>{current.name}</strong>
        <SelectorChevron />
      </summary>
      <nav className="rm-context-selector__menu" aria-label="클럽 선택">
        {clubs.map((club) => club.slug === currentClubSlug ? (
          <span
            key={club.slug}
            className="rm-context-selector__item"
            aria-current="true"
          >
            {club.name}
          </span>
        ) : (
          <LinkComponent
            key={club.slug}
            to={club.href}
            className="rm-context-selector__item"
          >
            {club.name}
          </LinkComponent>
        ))}
      </nav>
    </details>
  );
}

function ContextSelectors(props: Pick<AppClubShellProps, "clubs" | "currentClubSlug" | "workspace" | "workspaceItems" | "LinkComponent">) {
  return (
    <div className="rm-club-shell-context">
      <ClubSelector
        clubs={props.clubs}
        currentClubSlug={props.currentClubSlug}
        LinkComponent={props.LinkComponent}
      />
      <WorkspaceSelector
        currentWorkspace={props.workspace}
        items={props.workspaceItems}
        LinkComponent={props.LinkComponent}
      />
    </div>
  );
}

export function AppClubShell({
  clubs,
  currentClubSlug,
  workspace,
  workspaceItems,
  primaryItems,
  account,
  brandHref,
  mobileTitle,
  mobileKicker,
  mobileBackTarget,
  LinkComponent,
  contextSlot,
  beforeContent,
  securityController,
  desktopFooter,
  children,
}: AppClubShellProps) {
  const desktopNavLabel = workspace === "host" ? "호스트 주 메뉴" : "멤버 주 메뉴";
  const mobileNavLabel = `${desktopNavLabel} 모바일`;
  const selectors = {
    clubs,
    currentClubSlug,
    workspace,
    workspaceItems,
    LinkComponent,
  };
  const defaultContextControl = <ContextSelectors {...selectors} />;
  const desktopContextControl = contextSlot?.desktop ?? defaultContextControl;
  const mobileContextControl = contextSlot?.mobile ?? contextSlot?.desktop ?? defaultContextControl;

  return (
    <div className="app-shell rm-app-club-shell" data-workspace={workspace}>
      <div className="desktop-only" data-club-shell-region="desktop-spine">
        <TopNav
          variant={workspace}
          primaryItems={primaryItems}
          navLabel={desktopNavLabel}
          brandHref={brandHref}
          contextControl={desktopContextControl}
          LinkComponent={LinkComponent}
          accountControl={account.control}
        />
      </div>
      <div className="mobile-only" data-club-shell-region="mobile-spine">
        <MobileHeader
          variant={workspace}
          presentation={{
            title: mobileTitle,
            kicker: mobileKicker,
            backTarget: mobileBackTarget,
            brandHref,
          }}
          LinkComponent={LinkComponent}
          accountControl={account.control}
        />
      </div>
      <div className="mobile-only rm-club-shell-mobile-context" data-club-shell-region="mobile-context">
        {mobileContextControl}
      </div>
      <div className="app-content" data-club-shell-region="content">
        {securityController}
        {beforeContent}
        {children}
      </div>
      {desktopFooter ? <div className="desktop-only">{desktopFooter}</div> : null}
      <div className="mobile-only" data-club-shell-region="mobile-primary">
        <MobileTabBar
          variant={workspace}
          items={primaryItems}
          navLabel={mobileNavLabel}
          LinkComponent={LinkComponent}
        />
      </div>
    </div>
  );
}
