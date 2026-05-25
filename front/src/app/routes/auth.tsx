import type { QueryClient } from "@tanstack/react-query";
import type { RouteObject } from "react-router-dom";
import { RequireAuth } from "@/src/app/route-guards";
import { ReadmatesRouteLoading } from "@/src/pages/readmates-page";

export function authRoutes(_queryClient: QueryClient): RouteObject[] {
  void _queryClient;
  return [
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
