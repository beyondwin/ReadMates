import { useMemo } from "react";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { normalizeAuthAvailableSpaces } from "@/shared/auth/available-spaces";
import type { SpaceIdentity } from "@/shared/model/global-space";
import {
  GlobalSpaceSwitcher,
  type GlobalSpaceSelectionResult,
  type GlobalSpaceSwitcherOption,
} from "@/shared/ui/global-space-switcher";
import {
  useGlobalSpaceTransitionController,
  type SpaceTransitionRequestResult,
} from "./global-space-transition-controller";

function globalSpaceSwitcherOptions(
  auth: AuthMeResponse,
  availableIdentities: ReadonlyArray<SpaceIdentity>,
): GlobalSpaceSwitcherOption[] {
  const clubs = normalizeAuthAvailableSpaces(auth).availableSpaces.clubs;
  return availableIdentities.flatMap((identity) => {
    if (identity.productSpace === "platform") return [{ identity }];
    const club = clubs.find((candidate) => (
      candidate.clubId === identity.clubId && candidate.clubSlug === identity.clubSlug
    ));
    return club ? [{ identity, clubName: club.clubName }] : [];
  });
}

function selectionResult(
  status: SpaceTransitionRequestResult["status"],
): GlobalSpaceSelectionResult {
  if (status === "navigated") return { status: "selected" };
  if (status === "cancelled" || status === "obsolete") return { status: "cancelled" };
  if (status === "blocked-pending") {
    return { status: "blocked", message: "진행 중인 작업을 마친 뒤 공간을 전환해 주세요." };
  }
  if (status === "blocked-unknown") {
    return { status: "blocked", message: "처리 결과를 확인한 뒤 공간을 전환해 주세요." };
  }
  return { status: "unavailable", message: "지금은 이 공간을 열 수 없습니다. 권한을 다시 확인해 주세요." };
}

export function AppGlobalSpaceSwitcherBridge({ auth }: { auth: AuthMeResponse }) {
  const controller = useGlobalSpaceTransitionController();
  const options = useMemo(
    () => globalSpaceSwitcherOptions(auth, controller.availableIdentities),
    [auth, controller.availableIdentities],
  );

  return (
    <GlobalSpaceSwitcher
      currentIdentity={controller.currentIdentity}
      options={options}
      onSelect={async (identity) => selectionResult((await controller.requestTransition(identity)).status)}
    />
  );
}
