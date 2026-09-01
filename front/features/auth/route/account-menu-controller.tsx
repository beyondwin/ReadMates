import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { accountMembershipLabel } from "@/features/auth/model/account-menu-model";
import {
  AccountMenu,
  type AccountMenuLinkComponent,
} from "@/features/auth/ui/account-menu";
import { LogoutButton } from "@/features/auth/route/logout-button";
import type { LogoutAcceptedHandler } from "@/features/auth/route/logout-button";

export type AccountMenuControllerProps = {
  auth: AuthMeResponse;
  appBasePath: string;
  LinkComponent: AccountMenuLinkComponent;
  onLogoutAccepted: LogoutAcceptedHandler;
};

function scopedAccountPath(appBasePath: string, suffix: "/notifications" | "/me/settings") {
  return appBasePath ? `${appBasePath}${suffix}` : `/app${suffix}`;
}

export function AccountMenuController({
  auth,
  appBasePath,
  LinkComponent,
  onLogoutAccepted,
}: AccountMenuControllerProps) {
  const memberName = auth.displayName ?? auth.accountName ?? "멤버";

  return (
    <AccountMenu
      memberName={memberName}
      avatarKey={auth.currentMembership?.avatarKey ?? auth.avatarKey}
      membershipLabel={accountMembershipLabel(auth.membershipStatus)}
      notificationsHref={scopedAccountPath(appBasePath, "/notifications")}
      settingsHref={scopedAccountPath(appBasePath, "/me/settings")}
      LinkComponent={LinkComponent}
      LogoutControl={
        <LogoutButton className="rm-account-menu__logout" onLogoutAccepted={onLogoutAccepted}>
          로그아웃
        </LogoutButton>
      }
    />
  );
}
