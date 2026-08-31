import { useCallback, useEffect, useReducer, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useBlocker,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";
import { buildAdminDetailHref } from "@/features/platform-admin/model/admin-route-state";
import { platformAdminClubListHref } from "@/features/platform-admin/model/platform-admin-club-list-filters";
import { canAdmin } from "@/features/platform-admin/model/platform-admin-capabilities";
import type { PlatformAdminCapabilities } from "@/features/platform-admin/model/platform-admin-capabilities";
import {
  publishPlatformAdminOnboarding,
  useCommitPlatformAdminOnboardingMutation,
  usePreviewPlatformAdminOnboardingMutation,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { AdminOnboardingModal } from "@/features/platform-admin/ui/admin-onboarding-modal";
import { PlatformAdminOnboardingWizard } from "@/features/platform-admin/ui/platform-admin-onboarding-wizard";
import {
  publishTransitionAction,
  TransitionOwnerObsoleteError,
  useTransitionSafetyOwner,
} from "@/shared/ui/use-transition-safety-owner";

type OnboardingTransitionState = { dirty: boolean; pending: boolean };
type OnboardingTransitionAction =
  | { type: "dirty"; value: boolean }
  | { type: "pending"; value: boolean }
  | { type: "reset" };

const initialTransitionState: OnboardingTransitionState = {
  dirty: false,
  pending: false,
};

export function AdminOnboardingController({
  capabilities,
  authorityEpoch,
}: {
  capabilities: PlatformAdminCapabilities | null;
  authorityEpoch: number;
}) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [transitionState, dispatchTransition] = useReducer(
    onboardingTransitionReducer,
    initialTransitionState,
  );
  const allowNavigation = useRef(false);
  const previousAuthorityEpoch = useRef(authorityEpoch);
  const previewOnboarding = usePreviewPlatformAdminOnboardingMutation();
  const commitOnboarding = useCommitPlatformAdminOnboardingMutation();
  const transitionOwner = useTransitionSafetyOwner(
    "admin-onboarding",
    transitionState.dirty,
    "완료하지 않은 클럽 온보딩이 있습니다.",
  );
  const canCreateClub =
    capabilities != null && canAdmin(capabilities, "CREATE_CLUB");
  const onboardingRequested = searchParams.get("onboarding") === "1";
  const onboardingOpen = onboardingRequested && canCreateClub;

  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) => {
        if (allowNavigation.current) return false;
        if (
          (!transitionState.dirty && !transitionState.pending) ||
          !onboardingOpen
        ) {
          return false;
        }
        const nextOnboarding =
          new URLSearchParams(nextLocation.search).get("onboarding") === "1";
        return (
          currentLocation.pathname !== nextLocation.pathname || !nextOnboarding
        );
      }, [onboardingOpen, transitionState.dirty, transitionState.pending]),
    );

  useEffect(() => {
    allowNavigation.current = false;
  }, [location.key]);

  useEffect(() => {
    const authorityChanged = previousAuthorityEpoch.current !== authorityEpoch;
    previousAuthorityEpoch.current = authorityEpoch;
    if (!authorityChanged && (capabilities == null || canCreateClub)) return;

    dispatchTransition({ type: "reset" });
    if (!onboardingRequested) return;
    allowNavigation.current = true;
    navigateWithoutOnboarding({ location, navigate, searchParams });
  }, [
    authorityEpoch,
    canCreateClub,
    capabilities,
    location,
    navigate,
    onboardingRequested,
    searchParams,
  ]);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (transitionState.pending) {
      blocker.reset();
      return;
    }
    if (window.confirm("작성 중인 클럽 온보딩을 중단하고 이동할까요?")) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker, transitionState.pending]);

  async function commitOnboardingAccepted(
    request: Parameters<typeof commitOnboarding.mutateAsync>[0],
  ) {
    const operationId = `admin-onboarding:${request.idempotencyKey}`;
    const handle = transitionOwner.begin(operationId, "L2", async () => ({
      operationId,
      outcome: "still-unknown",
    }));
    try {
      const result = await commitOnboarding.mutateAsync(request);
      if (await handle.settle("succeeded") !== "accepted") {
        throw new TransitionOwnerObsoleteError();
      }
      await publishTransitionAction(handle, "cache", () =>
        publishPlatformAdminOnboarding(queryClient),
      );
      return result;
    } catch (error) {
      if (!(error instanceof TransitionOwnerObsoleteError)) {
        await handle.settle("failed");
      }
      throw error;
    }
  }

  function closeOnboarding() {
    if (transitionState.pending) return;
    allowNavigation.current = true;
    dispatchTransition({ type: "reset" });
    navigateWithoutOnboarding({ location, navigate, searchParams });
  }

  function viewCreatedClub(clubId: string) {
    allowNavigation.current = true;
    navigate(
      buildAdminDetailHref(`/admin/clubs/${clubId}`, {
        returnTo: platformAdminClubListHref(searchParams),
        focusId: clubId,
        scrollTop: 0,
      }),
      { replace: true },
    );
  }

  if (!onboardingOpen) return null;

  return (
    <AdminOnboardingModal
      isDirty={transitionState.dirty}
      effectPending={transitionState.pending}
      onRequestClose={closeOnboarding}
    >
      <PlatformAdminOnboardingWizard
        enabled={canCreateClub}
        onPreview={previewOnboarding.mutateAsync}
        onCommit={commitOnboardingAccepted}
        onDirtyChange={(value) => dispatchTransition({ type: "dirty", value })}
        onEffectPendingChange={(value) =>
          dispatchTransition({ type: "pending", value })
        }
        onViewClub={viewCreatedClub}
      />
    </AdminOnboardingModal>
  );
}

function onboardingTransitionReducer(
  state: OnboardingTransitionState,
  action: OnboardingTransitionAction,
): OnboardingTransitionState {
  switch (action.type) {
    case "dirty":
      return state.dirty === action.value ? state : { ...state, dirty: action.value };
    case "pending":
      return state.pending === action.value
        ? state
        : { ...state, pending: action.value };
    case "reset":
      return state.dirty || state.pending ? initialTransitionState : state;
  }
}

function navigateWithoutOnboarding({
  location,
  navigate,
  searchParams,
}: {
  location: { pathname: string };
  navigate: ReturnType<typeof useNavigate>;
  searchParams: URLSearchParams;
}) {
  const next = new URLSearchParams(searchParams);
  next.delete("onboarding");
  navigate(
    {
      pathname: location.pathname,
      search: next.toString() ? `?${next.toString()}` : "",
    },
    { replace: true },
  );
}
