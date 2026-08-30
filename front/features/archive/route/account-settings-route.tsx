import { useLoaderData } from "react-router";
import { leaveMembership } from "@/features/archive/api/archive-api";
import type { MyPageResponse } from "@/features/archive/api/archive-contracts";
import { AccountSettingsPage } from "@/features/archive/ui/account-settings-page";
import { useTransitionSafetyOwner } from "@/shared/ui/use-transition-safety-owner";

async function submitLeaveMembership(
  transitionOwner: ReturnType<typeof useTransitionSafetyOwner>,
): Promise<"accepted" | "obsolete"> {
  const operationId = `leave-membership-${globalThis.crypto.randomUUID()}`;
  const handle = transitionOwner.begin(operationId, "L2", async () => ({ operationId, outcome: "still-unknown" }));
  const response = await leaveMembership();

  if (!response.ok) {
    if (await handle.settle("failed") !== "accepted") return "obsolete";
    throw new Error("Leave membership failed");
  }
  return handle.settle("succeeded");
}

export function AccountSettingsRoute() {
  const data = useLoaderData() as MyPageResponse;
  const transitionOwner = useTransitionSafetyOwner("member-leave-membership");

  return (
    <AccountSettingsPage
      data={data}
      onLeaveMembership={() => submitLeaveMembership(transitionOwner)}
    />
  );
}
