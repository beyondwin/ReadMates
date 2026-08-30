import type { ReactNode } from "react";
import type {
  AccountMenuModel,
  ClubShellBackTarget,
  ClubShellLinkComponent,
  ClubShellResponsiveSlot,
  ClubWorkspace,
  GlobalSpaceSwitcherSlot,
  PrimaryNavigationItem,
} from "../model/app-club-shell";
import { MobileHeader } from "./mobile-header";
import { MobileTabBar } from "./mobile-tab-bar";
import { TopNav } from "./top-nav";

export type AppClubShellProps = {
  workspace: ClubWorkspace;
  primaryItems: ReadonlyArray<PrimaryNavigationItem>;
  account: AccountMenuModel;
  brandHref: string;
  mobileTitle: string;
  mobileKicker?: string | null;
  mobileBackTarget?: ClubShellBackTarget | null;
  LinkComponent: ClubShellLinkComponent;
  spaceSwitcher: GlobalSpaceSwitcherSlot;
  primarySlot?: ClubShellResponsiveSlot;
  utilitySlot?: ClubShellResponsiveSlot;
  beforeContent?: ReactNode;
  securityController?: ReactNode;
  desktopFooter?: ReactNode;
  children: ReactNode;
};

export function AppClubShell({
  workspace,
  primaryItems,
  account,
  brandHref,
  mobileTitle,
  mobileKicker,
  mobileBackTarget,
  LinkComponent,
  spaceSwitcher,
  primarySlot,
  utilitySlot,
  beforeContent,
  securityController,
  desktopFooter,
  children,
}: AppClubShellProps) {
  const desktopNavLabel = workspace === "host" ? "호스트 주 메뉴" : "멤버 주 메뉴";
  const mobileNavLabel = `${desktopNavLabel} 모바일`;
  const desktopContextControl = spaceSwitcher.desktop;
  const mobileContextControl = spaceSwitcher.mobile ?? spaceSwitcher.desktop;

  return (
    <div className="app-shell rm-app-club-shell" data-workspace={workspace}>
      <div className="desktop-only" data-club-shell-region="desktop-spine">
        <TopNav
          variant={workspace}
          primaryItems={primaryItems}
          navLabel={desktopNavLabel}
          brandHref={brandHref}
          contextControl={desktopContextControl}
          primaryControl={primarySlot?.desktop}
          utilityControl={utilitySlot?.desktop}
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
        <div className="rm-club-shell-mobile-context__inner">
          {mobileContextControl}
          {utilitySlot?.mobile}
        </div>
      </div>
      <div className="app-content" data-club-shell-region="content">
        {securityController}
        {beforeContent}
        {children}
      </div>
      {desktopFooter ? <div className="desktop-only">{desktopFooter}</div> : null}
      <div className="mobile-only" data-club-shell-region="mobile-primary">
        {primarySlot?.mobile ?? (
          <MobileTabBar
            variant={workspace}
            items={primaryItems}
            navLabel={mobileNavLabel}
            LinkComponent={LinkComponent}
          />
        )}
      </div>
    </div>
  );
}
