import { useLoaderData, useLocation } from "react-router-dom";
import { leaveMembership } from "@/features/archive/api/archive-api";
import type { MyPageResponse } from "@/features/archive/api/archive-contracts";
import { AccountSettingsPage } from "@/features/archive/ui/account-settings-page";
import { scopedAppLinkTarget } from "@/shared/routing/scoped-app-link-target";

async function submitLeaveMembership() {
  const response = await leaveMembership();

  if (!response.ok) {
    throw new Error("Leave membership failed");
  }
}

export function AccountSettingsRoute() {
  const data = useLoaderData() as MyPageResponse;
  const location = useLocation();

  return (
    <AccountSettingsPage
      data={data}
      mySpaceHref={scopedAppLinkTarget(location.pathname, "/app/me")}
      onLeaveMembership={submitLeaveMembership}
    />
  );
}
