import type { QueryClient } from "@tanstack/react-query";
import type { RouteObject } from "react-router-dom";
import { requireHostLoaderAuth } from "@/features/host/route/host-loader-auth";
import { HostRouteError } from "@/features/host/route/host-route-error";
import { AppRouteLayout } from "@/src/app/layouts";
import { NotFoundRoute, RouteErrorBoundary } from "@/src/app/route-error";
import { RequireHost } from "@/src/app/route-guards";
import { ReadmatesRouteLoading } from "@/src/pages/readmates-page";


function hostAppRoutes(queryClient: QueryClient): RouteObject[] {
  return [
    {
      index: true,
      errorElement: <HostRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="모임 운영 화면을 불러오는 중" variant="host" />,
      lazy: async () => {
        const [{ HostDashboardRouteElement }, { hostDashboardLoaderFactory }] = await Promise.all([
          import("@/src/app/host-route-elements"),
          import("@/features/host/route/host-dashboard-data"),
        ]);
        return { Component: HostDashboardRouteElement, loader: hostDashboardLoaderFactory(queryClient) };
      },
    },
    {
      path: "members",
      errorElement: <HostRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="멤버 목록을 불러오는 중" variant="host" />,
      lazy: async () => {
        const [{ HostMembersRouteElement }, { hostMembersLoaderFactory }] = await Promise.all([
          import("@/src/app/host-route-elements"),
          import("@/features/host/route/host-members-data"),
        ]);
        return {
          Component: HostMembersRouteElement,
          loader: hostMembersLoaderFactory(queryClient),
        };
      },
    },
    {
      path: "invitations",
      errorElement: <HostRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="초대 목록을 불러오는 중" variant="host" />,
      lazy: async () => {
        const [{ HostInvitationsRouteElement }, { hostInvitationsLoaderFactory }] = await Promise.all([
          import("@/src/app/host-route-elements"),
          import("@/features/host/route/host-invitations-data"),
        ]);
        return {
          Component: HostInvitationsRouteElement,
          loader: hostInvitationsLoaderFactory(queryClient),
        };
      },
    },
    {
      path: "notifications",
      errorElement: <HostRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="알림 발송 장부를 불러오는 중" variant="host" />,
      lazy: async () => {
        const [{ HostNotificationsRouteElement }, { hostNotificationsLoaderFactory }] = await Promise.all([
          import("@/src/app/host-route-elements"),
          import("@/features/host/route/host-notifications-data"),
        ]);
        return {
          Component: HostNotificationsRouteElement,
          loader: hostNotificationsLoaderFactory(queryClient),
        };
      },
    },
    {
      path: "sessions/new",
      errorElement: <HostRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="세션 편집 화면을 불러오는 중" variant="host" />,
      lazy: async () => {
        const { NewHostSessionRouteElement } = await import("@/src/app/host-route-elements");
        return { Component: NewHostSessionRouteElement };
      },
    },
    {
      path: "sessions/:sessionId/edit",
      errorElement: <HostRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="세션 문서 정보를 불러오는 중" variant="host" />,
      lazy: async () => {
        const [{ EditHostSessionRouteElement }, { hostSessionEditorLoader }] = await Promise.all([
          import("@/src/app/host-route-elements"),
          import("@/features/host/route/host-session-editor-data"),
        ]);
        return { Component: EditHostSessionRouteElement, loader: hostSessionEditorLoader };
      },
    },
    {
      path: "*",
      element: <NotFoundRoute variant="host" />,
    },
  ];
}

export function hostRoutes(queryClient: QueryClient): RouteObject[] {
  return [
    {
      id: "app-host",
      path: "/app/host",
      element: (
        <RequireHost>
          <AppRouteLayout />
        </RequireHost>
      ),
      loader: requireHostLoaderAuth,
      errorElement: <RouteErrorBoundary variant="host" />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="모임 운영 권한을 확인하는 중" variant="host" />,
      children: hostAppRoutes(queryClient),
    },
    {
      id: "club-app-host",
      path: "/clubs/:clubSlug/app/host",
      element: (
        <RequireHost>
          <AppRouteLayout />
        </RequireHost>
      ),
      loader: requireHostLoaderAuth,
      errorElement: <RouteErrorBoundary variant="host" />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="모임 운영 권한을 확인하는 중" variant="host" />,
      children: hostAppRoutes(queryClient),
    },
  ];
}
