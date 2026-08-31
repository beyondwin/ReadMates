import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router";
import { resolveAdminRouteOwner } from "@/features/platform-admin/model/admin-route-catalog";
import {
  installPlatformAdminAuthorityLossHandler,
  platformAdminCapabilitiesQuery,
  subscribePlatformAdminAuthorityLoss,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { useAdminAlarmSummary } from "@/features/platform-admin/queries/admin-alarm-summary";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { loginPathForReturnTo, safeRelativeReturnTo } from "@/shared/auth/login-return";
import { logoutCurrentSession } from "@/shared/auth/session-api";
import {
  publishTransitionAction,
  TransitionOwnerObsoleteError,
  useTransitionSafetyOwner,
} from "@/shared/ui/use-transition-safety-owner";
import { AdminBreadcrumbProvider } from "./admin-breadcrumb-context";
import { useAdminBreadcrumbExtra } from "./admin-breadcrumb-hook";
import { AdminShellLayout, type AdminShellOutletContext } from "./admin-shell-layout";

export function AdminShellController({
  auth = null,
  spaceSwitcher = null,
}: {
  auth?: AuthMeResponse | null;
  spaceSwitcher?: ReactNode;
}) {
  return (
    <AdminBreadcrumbProvider>
      <AdminShellControllerInner auth={auth} spaceSwitcher={spaceSwitcher} />
    </AdminBreadcrumbProvider>
  );
}

function AdminShellControllerInner({
  auth,
  spaceSwitcher,
}: {
  auth: AuthMeResponse | null;
  spaceSwitcher: ReactNode;
}) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const { extra } = useAdminBreadcrumbExtra();
  const [authorityLost, setAuthorityLost] = useState(false);
  const [authorityEpoch, setAuthorityEpoch] = useState(0);
  const [spaceControlEpoch, setSpaceControlEpoch] = useState(0);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const capabilitiesQuery = useQuery({
    ...platformAdminCapabilitiesQuery(),
    enabled: !authorityLost,
  });
  const alarm = useAdminAlarmSummary();
  const accountLogoutOwner = useTransitionSafetyOwner("admin-other-account-logout");
  const otherAccountLoginPath = adminOtherAccountLoginPath(
    location.pathname,
    location.search,
    location.hash,
  );
  const outletContext = useMemo<AdminShellOutletContext>(
    () => ({ authorityEpoch }),
    [authorityEpoch],
  );

  useEffect(() => {
    installPlatformAdminAuthorityLossHandler(queryClient);
    return subscribePlatformAdminAuthorityLoss(() => {
      setAuthorityLost(true);
      setAuthorityEpoch((epoch) => epoch + 1);
      setSpaceControlEpoch((epoch) => epoch + 1);
    });
  }, [queryClient]);

  async function otherAccountLogin() {
    if (accountBusy) return;
    const operationId = `admin-other-account-logout:${globalThis.crypto.randomUUID()}`;
    const handle = accountLogoutOwner.begin(operationId, "L1", async () => ({
      operationId,
      outcome: "still-unknown",
    }));
    setAccountBusy(true);
    setAccountError(null);
    let settled = false;
    try {
      const response = await logoutCurrentSession();
      const succeeded = response.ok || response.status === 401;
      if (await handle.settle(succeeded ? "succeeded" : "failed") !== "accepted") return;
      settled = true;
      if (succeeded) {
        await publishTransitionAction(handle, "navigation", () =>
          window.location.assign(otherAccountLoginPath),
        );
      } else {
        await publishTransitionAction(handle, "errorCopy", () => {
          setAccountError("로그아웃에 실패했습니다. 다시 시도해 주세요.");
          setAccountBusy(false);
        });
      }
    } catch (error) {
      if (error instanceof TransitionOwnerObsoleteError) return;
      // A lost response may hide a committed logout. Keep this operation
      // registered and disabled until owner unmount reconciliation.
    } finally {
      if (settled) handle.completePublication();
    }
  }

  return (
    <AdminShellLayout
      workspaceAccountLabel={
        auth?.accountName || auth?.displayName || auth?.email || "현재 계정"
      }
      spaceSwitcher={spaceSwitcher}
      spaceControlEpoch={spaceControlEpoch}
      capabilities={capabilitiesQuery.data ?? null}
      currentNavigationOwner={resolveAdminRouteOwner(location)}
      routePath={derivePathSegment(location.pathname)}
      breadcrumbExtra={extra}
      alarm={alarm}
      accountBusy={accountBusy}
      accountError={accountError}
      onOtherAccountLogin={() => void otherAccountLogin()}
      outletContext={outletContext}
    />
  );
}

function adminOtherAccountLoginPath(pathname: string, search: string, hash: string): string {
  const returnTo = safeRelativeReturnTo(`${pathname}${search}${hash}`);
  return loginPathForReturnTo(returnTo?.startsWith("/admin") ? returnTo : "/admin");
}

function derivePathSegment(pathname: string): string {
  const stripped = pathname.replace(/^\/admin\/?/, "");
  if (!stripped) return "today";
  if (stripped.startsWith("clubs/") && stripped !== "clubs") return "clubs/:clubId";
  return stripped;
}
