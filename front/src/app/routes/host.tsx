import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { type LoaderFunction, type RouteObject } from "react-router";
import { requireHostLoaderAuth } from "@/features/host/route/host-loader-auth";
import { HostRouteError } from "@/features/host/route/host-route-error";
import { AppRouteLayout } from "@/src/app/layouts/app-route-layout";
import { memoizeRouteModule } from "@/src/app/routes/route-module-loader";
import { ClubHostAppRouteLayout } from "@/src/app/layouts/club-app-route-layout";
import { NotFoundRoute, RouteErrorBoundary } from "@/src/app/route-error";
import { RequireHost } from "@/src/app/route-guards";
import { ReadmatesRouteLoading } from "@/src/pages/readmates-page";

type ScopedHostRouteModule = {
  Component: ComponentType;
  loader?: LoaderFunction;
};

function scopedHostRoute({
  path,
  index,
  errorElement,
  fallback,
  load,
}: {
  path?: string;
  index?: true;
  errorElement?: ReactNode;
  fallback: ReactNode;
  load: () => Promise<ScopedHostRouteModule>;
}): RouteObject {
  const loadOnce = memoizeRouteModule(load);
  const ProtectedComponent = lazy(async () => ({ default: (await loadOnce()).Component }));

  return {
    ...(path ? { path } : {}),
    ...(index ? { index } : {}),
    ...(errorElement ? { errorElement } : {}),
    hydrateFallbackElement: fallback,
    loader: async (args) => {
      await requireHostLoaderAuth(args);
      const module = await loadOnce();
      return module.loader?.(args) ?? null;
    },
    element: (
      <Suspense fallback={fallback}>
        <ProtectedComponent />
      </Suspense>
    ),
  };
}

function scopedHostAppRoutes(queryClient: QueryClient): RouteObject[] {
  return [
    scopedHostRoute({
      index: true,
      errorElement: <HostRouteError />,
      fallback: <ReadmatesRouteLoading label="모임 운영 화면을 불러오는 중" variant="host" />,
      load: async () => {
        const [{ HostDashboardRouteElement: Component }, { hostDashboardLoaderFactory }] = await Promise.all([
          import("@/src/app/host-routes/dashboard-route-element"),
          import("@/features/host/route/host-dashboard-data"),
        ]);
        return { Component, loader: hostDashboardLoaderFactory(queryClient) };
      },
    }),
    scopedHostRoute({
      path: "members",
      errorElement: <HostRouteError />,
      fallback: <ReadmatesRouteLoading label="멤버 목록을 불러오는 중" variant="host" />,
      load: async () => {
        const [{ HostMembersRouteElement: Component }, { hostMembersLoaderFactory }] = await Promise.all([
          import("@/src/app/host-routes/members-route-element"),
          import("@/features/host/route/host-members-data"),
        ]);
        return { Component, loader: hostMembersLoaderFactory(queryClient) };
      },
    }),
    scopedHostRoute({
      path: "invitations",
      errorElement: <HostRouteError />,
      fallback: <ReadmatesRouteLoading label="초대 목록을 불러오는 중" variant="host" />,
      load: async () => {
        const [{ HostInvitationsRouteElement: Component }, { hostInvitationsLoaderFactory }] = await Promise.all([
          import("@/src/app/host-routes/invitations-route-element"),
          import("@/features/host/route/host-invitations-data"),
        ]);
        return { Component, loader: hostInvitationsLoaderFactory(queryClient) };
      },
    }),
    scopedHostRoute({
      path: "notifications",
      errorElement: <HostRouteError />,
      fallback: <ReadmatesRouteLoading label="알림 발송 장부를 불러오는 중" variant="host" />,
      load: async () => {
        const [{ HostNotificationsRouteElement: Component }, { hostNotificationsLoaderFactory }] = await Promise.all([
          import("@/src/app/host-routes/notifications-route-element"),
          import("@/features/host/route/host-notifications-data"),
        ]);
        return { Component, loader: hostNotificationsLoaderFactory(queryClient) };
      },
    }),
    scopedHostRoute({
      path: "sessions",
      errorElement: <HostRouteError />,
      fallback: <ReadmatesRouteLoading label="세션 기록 장부를 불러오는 중" variant="host" />,
      load: async () => {
        const [{ HostSessionLedgerRouteElement: Component }, { hostSessionLedgerLoaderFactory }] = await Promise.all([
          import("@/src/app/host-routes/session-ledger-route-element"),
          import("@/features/host/route/host-session-ledger-data"),
        ]);
        return { Component, loader: hostSessionLedgerLoaderFactory(queryClient) };
      },
    }),
    scopedHostRoute({
      path: "sessions/new",
      errorElement: <HostRouteError />,
      fallback: <ReadmatesRouteLoading label="새 모임 화면을 불러오는 중" variant="host" />,
      load: async () => ({ Component: (await import("@/src/app/host-routes/new-session-route-element")).NewHostSessionRouteElement }),
    }),
    scopedHostRoute({
      path: "sessions/:sessionId/closing",
      errorElement: <HostRouteError />,
      fallback: <ReadmatesRouteLoading label="모임 후 화면을 불러오는 중" variant="host" />,
      load: async () => ({
        Component: (await import("@/src/app/host-routes/session-closing-route-element")).HostSessionClosingRouteElement,
      }),
    }),
    scopedHostRoute({
      path: "sessions/:sessionId/feedback-document",
      errorElement: <HostRouteError />,
      fallback: <ReadmatesRouteLoading label="피드백 문서 미리보기를 불러오는 중" variant="host" />,
      load: async () => {
        const [{ HostFeedbackDocumentPreviewRouteElement: Component }, { hostFeedbackDocumentPreviewLoaderFactory }] = await Promise.all([
          import("@/src/app/host-routes/feedback-document-preview-route-element"),
          import("@/src/app/host-routes/feedback-document-preview-data"),
        ]);
        return { Component, loader: hostFeedbackDocumentPreviewLoaderFactory(queryClient) };
      },
    }),
    scopedHostRoute({
      path: "sessions/:sessionId",
      errorElement: <HostRouteError />,
      fallback: <ReadmatesRouteLoading label="모임 장부를 불러오는 중" variant="host" />,
      load: async () => {
        const [{ MeetingRouteElement: Component }, { hostSessionEditorLoaderFactory }] = await Promise.all([
          import("@/src/app/host-routes/meeting-route-element"),
          import("@/features/host/route/host-session-editor-data"),
        ]);
        return { Component, loader: hostSessionEditorLoaderFactory(queryClient) };
      },
    }),
    scopedHostRoute({
      path: "sessions/:sessionId/edit",
      errorElement: <HostRouteError />,
      fallback: <ReadmatesRouteLoading label="모임 장부를 불러오는 중" variant="host" />,
      load: async () => ({
        Component: (await import("@/src/app/host-routes/edit-session-route-element")).EditHostSessionRouteElement,
      }),
    }),
    { path: "*", element: <NotFoundRoute variant="host" /> },
  ];
}

function hostAppRoutes(queryClient: QueryClient, scoped = false): RouteObject[] {
  if (scoped) {
    return scopedHostAppRoutes(queryClient);
  }
  return [
    {
      index: true,
      errorElement: <HostRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="모임 운영 화면을 불러오는 중" variant="host" />,
      lazy: async () => {
        const [{ HostDashboardRouteElement }, { hostDashboardLoaderFactory }] = await Promise.all([
          import("@/src/app/host-routes/dashboard-route-element"),
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
          import("@/src/app/host-routes/members-route-element"),
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
          import("@/src/app/host-routes/invitations-route-element"),
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
          import("@/src/app/host-routes/notifications-route-element"),
          import("@/features/host/route/host-notifications-data"),
        ]);
        return {
          Component: HostNotificationsRouteElement,
          loader: hostNotificationsLoaderFactory(queryClient),
        };
      },
    },
    {
      path: "sessions",
      errorElement: <HostRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="세션 기록 장부를 불러오는 중" variant="host" />,
      lazy: async () => {
        const [{ HostSessionLedgerRouteElement }, { hostSessionLedgerLoaderFactory }] = await Promise.all([
          import("@/src/app/host-routes/session-ledger-route-element"),
          import("@/features/host/route/host-session-ledger-data"),
        ]);
        return {
          Component: HostSessionLedgerRouteElement,
          loader: hostSessionLedgerLoaderFactory(queryClient),
        };
      },
    },
    {
      path: "sessions/new",
      errorElement: <HostRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="새 모임 화면을 불러오는 중" variant="host" />,
      lazy: async () => {
        const { NewHostSessionRouteElement } = await import("@/src/app/host-routes/new-session-route-element");
        return { Component: NewHostSessionRouteElement };
      },
    },
    {
      path: "sessions/:sessionId/closing",
      errorElement: <HostRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="모임 후 화면을 불러오는 중" variant="host" />,
      lazy: async () => {
        const { HostSessionClosingRouteElement } = await import("@/src/app/host-routes/session-closing-route-element");
        return { Component: HostSessionClosingRouteElement };
      },
    },
    {
      path: "sessions/:sessionId/feedback-document",
      errorElement: <HostRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="피드백 문서 미리보기를 불러오는 중" variant="host" />,
      lazy: async () => {
        const [
          { HostFeedbackDocumentPreviewRouteElement },
          { hostFeedbackDocumentPreviewLoaderFactory },
        ] = await Promise.all([
          import("@/src/app/host-routes/feedback-document-preview-route-element"),
          import("@/src/app/host-routes/feedback-document-preview-data"),
        ]);
        return {
          Component: HostFeedbackDocumentPreviewRouteElement,
          loader: hostFeedbackDocumentPreviewLoaderFactory(queryClient),
        };
      },
    },
    {
      path: "sessions/:sessionId",
      errorElement: <HostRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="모임 장부를 불러오는 중" variant="host" />,
      lazy: async () => {
        const [{ MeetingRouteElement }, { hostSessionEditorLoaderFactory }] = await Promise.all([
          import("@/src/app/host-routes/meeting-route-element"),
          import("@/features/host/route/host-session-editor-data"),
        ]);
        return { Component: MeetingRouteElement, loader: hostSessionEditorLoaderFactory(queryClient) };
      },
    },
    {
      path: "sessions/:sessionId/edit",
      errorElement: <HostRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="모임 장부를 불러오는 중" variant="host" />,
      lazy: async () => {
        const { EditHostSessionRouteElement } = await import("@/src/app/host-routes/edit-session-route-element");
        return { Component: EditHostSessionRouteElement };
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
      element: <ClubHostAppRouteLayout />,
      loader: requireHostLoaderAuth,
      errorElement: <RouteErrorBoundary variant="host" />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="모임 운영 권한을 확인하는 중" variant="host" />,
      children: hostAppRoutes(queryClient, true),
    },
  ];
}
