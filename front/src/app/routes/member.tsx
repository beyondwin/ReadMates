import type { QueryClient } from "@tanstack/react-query";
import type { RouteObject } from "react-router-dom";
import type { InternalLinkComponent } from "@/features/current-session";
import {
  ArchiveRouteError,
  ArchiveRouteLoading,
} from "@/features/archive/route/archive-route-state";
import { FeedbackRouteError } from "@/features/feedback/route/feedback-route-state";
import { loadMemberAppAuth } from "@/shared/auth/member-app-loader";
import { AppRouteLayout } from "@/src/app/layouts";
import { NotFoundRoute, RouteErrorBoundary } from "@/src/app/route-error";
import { RequireAuth, RequireMemberApp } from "@/src/app/route-guards";
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

function memberAppRoutes(queryClient: QueryClient, options: { includeIndex?: boolean } = {}): RouteObject[] {
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
          currentSessionLoaderFactory,
        } = await import("@/features/current-session");

        function CurrentSessionRouteElement() {
          return <CurrentSessionRoute internalLinkComponent={currentSessionInternalLink} />;
        }

        return {
          Component: CurrentSessionRouteElement,
          ErrorBoundary: CurrentSessionRouteError,
          loader: currentSessionLoaderFactory(queryClient),
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

export function memberRoutes(queryClient: QueryClient): RouteObject[] {
  return [
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
          children: memberAppRoutes(queryClient, { includeIndex: false }),
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
      children: memberAppRoutes(queryClient),
    },
  ];
}
