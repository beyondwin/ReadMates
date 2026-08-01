import { useLoaderData } from "react-router-dom";
import { leaveMembership } from "@/features/archive/api/archive-api";
import type { MyPageResponse } from "@/features/archive/api/archive-contracts";
import { AccountSettingsPage } from "@/features/archive/ui/account-settings-page";

async function submitLeaveMembership() {
  const response = await leaveMembership();

  if (!response.ok) {
    throw new Error("Leave membership failed");
  }
}

export function AccountSettingsRoute() {
  const data = useLoaderData() as MyPageResponse;

  return (
    <AccountSettingsPage
      data={data}
      onLeaveMembership={submitLeaveMembership}
    />
  );
}
