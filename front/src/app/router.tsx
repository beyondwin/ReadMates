import type { QueryClient } from "@tanstack/react-query";
import { createBrowserRouter, type RouteObject } from "react-router-dom";
import type { InternalLinkComponent } from "@/features/current-session";
import {
  ArchiveRouteError,
  ArchiveRouteLoading,
} from "@/features/archive/route/archive-route-state";
import { FeedbackRouteError } from "@/features/feedback/route/feedback-route-state";
import { requireHostLoaderAuth } from "@/features/host/route/host-loader-auth";
import { HostRouteError } from "@/features/host/route/host-route-error";
import { loadMemberAppAuth } from "@/shared/auth/member-app-loader";
import { AppRouteLayout } from "@/src/app/layouts";
import { publicRoutes } from "@/src/app/routes/public";
import { createReadmatesQueryClient } from "@/src/app/query-client";
import { NotFoundRoute, RouteErrorBoundary } from "@/src/app/route-error";
import { RequireAuth, RequireHost, RequireMemberApp, RequirePlatformAdmin } from "@/src/app/route-guards";
import { Link } from "@/src/app/router-link";
import { ReadmatesRouteLoading } from "@/src/pages/readmates-page";

const currentSessionInternalLink: InternalLinkComponent = ({ href, children, ...props }) => {
  return (
    <Link {...props} to={href}>
      {children}
    </Link>
  );
};

function memberHomeRoute(): RouteObject {
  return {
    index: true,
    errorElement: <ArchiveRouteError />,
    hydrateFallbackElement: <ReadmatesRouteLoading label="멤버 홈을 불러오는 중" variant="member" />,
    lazy: async () => {
      const [{ default: AppHomePage }, { memberHomeLoader }] = await Promise.all([
        import("@/src/pages/app-home"),
        import("@/features/member-home/route/member-home-data"),
      ]);
      return { Component: AppHomePage, loader: memberHomeLoader };
    },
  };
}

function memberAppRoutes(options: { includeIndex?: boolean } = {}): RouteObject[] {
  const { includeIndex = true } = options;
  return [
    ...(includeIndex ? [memberHomeRoute()] : []),
    {
      path: "session/current",
      hydrateFallbackElement: <ReadmatesRouteLoading label="세션을 불러오는 중" variant="member" />,
      lazy: async () => {
        const {
          CurrentSessionRoute,
          CurrentSessionRouteError,
          currentSessionAction,
          currentSessionLoader,
        } = await import("@/features/current-session");

        function CurrentSessionRouteElement() {
          return <CurrentSessionRoute internalLinkComponent={currentSessionInternalLink} />;
        }

        return {
          Component: CurrentSessionRouteElement,
          ErrorBoundary: CurrentSessionRouteError,
          action: currentSessionAction,
          loader: currentSessionLoader,
        };
      },
    },
    {
      path: "notes",
      errorElement: <ArchiveRouteError />,
      hydrateFallbackElement: <ArchiveRouteLoading label="클럽 노트를 불러오는 중" />,
      lazy: async () => {
        const [{ default: NotesPage }, { notesFeedLoader, notesFeedShouldRevalidate }] = await Promise.all([
          import("@/src/pages/notes"),
          import("@/features/archive/route/notes-feed-data"),
        ]);
        return {
          Component: NotesPage,
          loader: notesFeedLoader,
          shouldRevalidate: notesFeedShouldRevalidate,
        };
      },
    },
    {
      path: "archive",
      errorElement: <ArchiveRouteError />,
      hydrateFallbackElement: <ArchiveRouteLoading label="아카이브를 불러오는 중" />,
      lazy: async () => {
        const [{ default: ArchiveRoutePage }, { archiveListLoader }] = await Promise.all([
          import("@/src/pages/archive"),
          import("@/features/archive/route/archive-list-data"),
        ]);
        return { Component: ArchiveRoutePage, loader: archiveListLoader };
      },
    },
    {
      path: "me",
      errorElement: <ArchiveRouteError />,
      hydrateFallbackElement: <ArchiveRouteLoading label="내 공간을 불러오는 중" />,
      lazy: async () => {
        const [{ default: MyRoutePage }, { myPageLoader }] = await Promise.all([
          import("@/src/pages/my-page"),
          import("@/features/archive/route/my-page-data"),
        ]);
        return { Component: MyRoutePage, loader: myPageLoader };
      },
    },
    {
      path: "notifications",
      errorElement: <ArchiveRouteError />,
      hydrateFallbackElement: <ArchiveRouteLoading label="알림을 불러오는 중" />,
      lazy: async () => {
        const [{ MemberNotificationsRoute }, { memberNotificationsLoader }] = await Promise.all([
          import("@/features/notifications/route/member-notifications-route"),
          import("@/features/notifications/route/member-notifications-data"),
        ]);
        return { Component: MemberNotificationsRoute, loader: memberNotificationsLoader };
      },
    },
    {
      path: "sessions/:sessionId",
      errorElement: <ArchiveRouteError />,
      hydrateFallbackElement: <ArchiveRouteLoading label="지난 세션 기록을 불러오는 중" />,
      lazy: async () => {
        const [{ default: MemberSessionDetailRoutePage }, { memberSessionDetailLoader }] = await Promise.all([
          import("@/src/pages/member-session"),
          import("@/features/archive/route/member-session-detail-data"),
        ]);
        return { Component: MemberSessionDetailRoutePage, loader: memberSessionDetailLoader };
      },
    },
    {
      path: "feedback/:sessionId",
      errorElement: <FeedbackRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="피드백 문서를 불러오는 중" variant="member" />,
      lazy: async () => {
        const [{ default: FeedbackDocumentRoutePage }, { feedbackDocumentLoader }] = await Promise.all([
          import("@/src/pages/feedback-document"),
          import("@/features/feedback/route/feedback-document-data"),
        ]);
        return { Component: FeedbackDocumentRoutePage, loader: feedbackDocumentLoader };
      },
    },
    {
      path: "feedback/:sessionId/print",
      errorElement: <FeedbackRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="피드백 문서를 불러오는 중" variant="member" />,
      lazy: async () => {
        const [{ default: FeedbackDocumentPrintRoutePage }, { feedbackDocumentLoader }] = await Promise.all([
          import("@/src/pages/feedback-print"),
          import("@/features/feedback/route/feedback-document-data"),
        ]);
        return { Component: FeedbackDocumentPrintRoutePage, loader: feedbackDocumentLoader };
      },
    },
    {
      path: "*",
      element: <NotFoundRoute variant="member" />,
    },
  ];
}

function hostAppRoutes(queryClient: QueryClient): RouteObject[] {
  return [
    {
      index: true,
      errorElement: <HostRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="모임 운영 화면을 불러오는 중" variant="host" />,
      lazy: async () => {
        const [{ HostDashboardRouteElement }, { hostDashboardLoader }] = await Promise.all([
          import("@/src/app/host-route-elements"),
          import("@/features/host/route/host-dashboard-data"),
        ]);
        return { Component: HostDashboardRouteElement, loader: hostDashboardLoader };
      },
    },
    {
      path: "members",
      errorElement: <HostRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="멤버 목록을 불러오는 중" variant="host" />,
      lazy: async () => {
        const [{ HostMembersRouteElement }, { hostMembersLoader }] = await Promise.all([
          import("@/src/app/host-route-elements"),
          import("@/features/host/route/host-members-data"),
        ]);
        return { Component: HostMembersRouteElement, loader: hostMembersLoader };
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
        const [{ HostNotificationsRouteElement }, { hostNotificationsLoader }] = await Promise.all([
          import("@/src/app/host-route-elements"),
          import("@/features/host/route/host-notifications-data"),
        ]);
        return { Component: HostNotificationsRouteElement, loader: hostNotificationsLoader };
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

export function buildRoutes(queryClient: QueryClient): RouteObject[] {
  return [
  publicRoutes(),
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
  {
    path: "/app",
    errorElement: <RouteErrorBoundary variant="member" />,
    children: [
      {
        index: true,
        errorElement: <ArchiveRouteError />,
        hydrateFallbackElement: <ReadmatesRouteLoading label="클럽을 확인하는 중" variant="member" />,
        lazy: async () => {
          const [{ ClubSelectionRoute }, { clubSelectionLoader }] = await Promise.all([
            import("@/features/club-selection/route/club-selection-route"),
            import("@/features/club-selection/route/club-selection-data"),
          ]);

          function ClubSelectionRouteElement() {
            return (
              <RequireAuth>
                <ClubSelectionRoute />
              </RequireAuth>
            );
          }

          return { Component: ClubSelectionRouteElement, loader: clubSelectionLoader };
        },
      },
      {
        id: "app",
        element: (
          <RequireMemberApp>
            <AppRouteLayout />
          </RequireMemberApp>
        ),
        children: memberAppRoutes({ includeIndex: false }),
      },
    ],
  },
  {
    id: "club-app",
    path: "/clubs/:clubSlug/app",
    element: (
      <RequireMemberApp>
        <AppRouteLayout />
      </RequireMemberApp>
    ),
    loader: loadMemberAppAuth,
    errorElement: <RouteErrorBoundary variant="member" />,
    hydrateFallbackElement: <ReadmatesRouteLoading label="멤버 공간을 불러오는 중" variant="member" />,
    children: memberAppRoutes(),
  },
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

export const routes: RouteObject[] = buildRoutes(createReadmatesQueryClient());

export function createReadmatesRouter() {
  const queryClient = createReadmatesQueryClient();
  const router = createBrowserRouter(buildRoutes(queryClient));
  return { router, queryClient };
}
