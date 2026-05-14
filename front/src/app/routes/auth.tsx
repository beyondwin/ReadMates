import type { RouteObject } from "react-router-dom";
import { RouteErrorBoundary } from "@/src/app/route-error";
import { RequireAuth, RequirePlatformAdmin } from "@/src/app/route-guards";
import { ReadmatesRouteLoading } from "@/src/pages/readmates-page";

export function authRoutes(): RouteObject[] {
  return [
    {
      path: "/admin",
      errorElement: <RouteErrorBoundary variant="auth" />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="플랫폼 관리를 불러오는 중" variant="member" />,
      lazy: async () => {
        const [{ PlatformAdminRoute }, { platformAdminLoader }] = await Promise.all([
          import("@/features/platform-admin/route/platform-admin-route"),
          import("@/features/platform-admin/route/platform-admin-data"),
        ]);

        function PlatformAdminRouteElement() {
          return (
            <RequirePlatformAdmin>
              <PlatformAdminRoute />
            </RequirePlatformAdmin>
          );
        }

        return { Component: PlatformAdminRouteElement, loader: platformAdminLoader };
      },
    },
    {
      path: "/app/pending",
      hydrateFallbackElement: <ReadmatesRouteLoading label="승인 상태를 확인하는 중" variant="member" />,
      lazy: async () => {
        const { default: PendingApprovalPage } = await import("@/src/pages/pending-approval");

        function PendingApprovalRouteElement() {
          return (
            <RequireAuth>
              <PendingApprovalPage />
            </RequireAuth>
          );
        }

        return { Component: PendingApprovalRouteElement };
      },
    },
    {
      path: "/clubs/:clubSlug/app/pending",
      hydrateFallbackElement: <ReadmatesRouteLoading label="승인 상태를 확인하는 중" variant="member" />,
      lazy: async () => {
        const { default: PendingApprovalPage } = await import("@/src/pages/pending-approval");

        function PendingApprovalRouteElement() {
          return (
            <RequireAuth>
              <PendingApprovalPage />
            </RequireAuth>
          );
        }

        return { Component: PendingApprovalRouteElement };
      },
    },
  ];
}
