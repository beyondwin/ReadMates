import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useLoaderData, type LoaderFunction, type RouteObject } from "react-router-dom";
import type { InternalLinkComponent } from "@/features/current-session";
import { CurrentSessionRouteError } from "@/features/current-session/route/current-session-route";
import { notesFeedShouldRevalidate } from "@/features/archive/route/notes-feed-revalidation";
import {
  ArchiveRouteError,
  ArchiveRouteLoading,
} from "@/features/archive/route/archive-route-state";
import { FeedbackRouteError } from "@/features/feedback/route/feedback-route-state";
import {
  loadScopedClubAppAccess,
  isGuestScopedRouteData,
  scopedGuestRouteLoader,
} from "@/features/guest-browse/route/club-app-audience-loader";
import { GuestScopedAppRoute } from "@/features/guest-browse/route/guest-scoped-app-route";
import { AppRouteLayout } from "@/src/app/layouts/app-route-layout";
import { memoizeRouteModule } from "@/src/app/routes/route-module-loader";
import { ClubMemberAppRouteLayout } from "@/src/app/layouts/club-app-route-layout";
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

type ScopedRouteModule = {
  Component: ComponentType;
  loader: LoaderFunction;
};

function componentForScopedAudience(Component: ComponentType, _scoped: boolean) {
  void _scoped;
  return Component;
}

function scopedMemberRoute({
  path,
  index,
  errorElement,
  ErrorBoundary,
  shouldRevalidate,
  fallback,
  load,
}: {
  path?: string;
  index?: true;
  errorElement?: ReactNode;
  ErrorBoundary?: ComponentType;
  shouldRevalidate?: RouteObject["shouldRevalidate"];
  fallback: ReactNode;
  load: () => Promise<ScopedRouteModule>;
}): RouteObject {
  const loadOnce = memoizeRouteModule(load);
  const ProtectedComponent = lazy(async () => ({ default: (await loadOnce()).Component }));

  function ScopedAudienceRouteComponent() {
    const data = useLoaderData();

    return isGuestScopedRouteData(data) ? (
      <GuestScopedAppRoute LinkComponent={Link} />
    ) : (
      <Suspense fallback={fallback}>
        <ProtectedComponent />
      </Suspense>
    );
  };

  return {
    ...(path ? { path } : {}),
    ...(index ? { index } : {}),
    ...(errorElement ? { errorElement } : {}),
    ...(ErrorBoundary ? { ErrorBoundary } : {}),
    ...(shouldRevalidate ? { shouldRevalidate } : {}),
    hydrateFallbackElement: fallback,
    loader: scopedGuestRouteLoader(async () => (await loadOnce()).loader),
    element: <ScopedAudienceRouteComponent />,
  };
}

// This route component is referenced only by the router configuration below.
// eslint-disable-next-line react-refresh/only-export-components
function ScopedAudienceNotFoundRoute() {
  const data = useLoaderData();

  return isGuestScopedRouteData(data) ? <GuestScopedAppRoute LinkComponent={Link} /> : <NotFoundRoute variant="member" />;
}

function memberHomeRoute(scoped: boolean): RouteObject {
  return {
    index: true,
    errorElement: <ArchiveRouteError />,
    hydrateFallbackElement: <ReadmatesRouteLoading label="멤버 홈을 불러오는 중" variant="member" />,
    loader: scoped
      ? scopedGuestRouteLoader(async () => (await import("@/features/member-home/route/member-home-data")).memberHomeLoader)
      : undefined,
    lazy: async () => {
      const [{ default: AppHomePage }, { memberHomeLoader }] = await Promise.all([
        import("@/src/pages/app-home"),
        import("@/features/member-home/route/member-home-data"),
      ]);
      return { Component: componentForScopedAudience(AppHomePage, scoped), ...(scoped ? {} : { loader: memberHomeLoader }) };
    },
  };
}

function scopedMemberAppRoutes(queryClient: QueryClient): RouteObject[] {
  return [
    scopedMemberRoute({
      index: true,
      errorElement: <ArchiveRouteError />,
      fallback: <ReadmatesRouteLoading label="멤버 홈을 불러오는 중" variant="member" />,
      load: async () => {
        const [{ default: Component }, { memberHomeLoader: loader }] = await Promise.all([
          import("@/src/pages/app-home"),
          import("@/features/member-home/route/member-home-data"),
        ]);
        return { Component, loader };
      },
    }),
    scopedMemberRoute({
      path: "session/current",
      ErrorBoundary: CurrentSessionRouteError,
      fallback: <ReadmatesRouteLoading label="세션을 불러오는 중" variant="member" />,
      load: async () => {
        const { CurrentSessionRoute, currentSessionLoaderFactory } = await import("@/features/current-session");
        return {
          Component: () => <CurrentSessionRoute internalLinkComponent={currentSessionInternalLink} />,
          loader: currentSessionLoaderFactory(queryClient),
        };
      },
    }),
    scopedMemberRoute({
      path: "notes",
      errorElement: <ArchiveRouteError />,
      shouldRevalidate: notesFeedShouldRevalidate,
      fallback: <ArchiveRouteLoading label="클럽 노트를 불러오는 중" />,
      load: async () => {
        const [{ default: Component }, { notesFeedLoader: loader }] = await Promise.all([
          import("@/src/pages/notes"),
          import("@/features/archive/route/notes-feed-data"),
        ]);
        return { Component, loader };
      },
    }),
    scopedMemberRoute({
      path: "archive",
      errorElement: <ArchiveRouteError />,
      fallback: <ArchiveRouteLoading label="아카이브를 불러오는 중" />,
      load: async () => {
        const [{ default: Component }, { archiveListLoaderFactory }] = await Promise.all([
          import("@/src/pages/archive"),
          import("@/features/archive/route/archive-list-data"),
        ]);
        return { Component, loader: archiveListLoaderFactory(queryClient) };
      },
    }),
    scopedMemberRoute({
      path: "me/records",
      errorElement: <ArchiveRouteError />,
      fallback: <ArchiveRouteLoading label="내 책별 기록을 불러오는 중" />,
      load: async () => {
        const [{ default: Component }, { myRecordsLoader: loader }] = await Promise.all([
          import("@/src/pages/my-records"),
          import("@/features/archive/route/my-records-data"),
        ]);
        return { Component, loader };
      },
    }),
    scopedMemberRoute({
      path: "me/settings",
      errorElement: <ArchiveRouteError />,
      fallback: <ArchiveRouteLoading label="계정 정보를 불러오는 중" />,
      load: async () => {
        const [{ default: Component }, { accountSettingsLoader: loader }] = await Promise.all([
          import("@/src/pages/account-settings"),
          import("@/features/archive/route/account-settings-data"),
        ]);
        return { Component, loader };
      },
    }),
    scopedMemberRoute({
      path: "me",
      errorElement: <ArchiveRouteError />,
      fallback: <ArchiveRouteLoading label="내 공간을 불러오는 중" />,
      load: async () => {
        const [{ default: Component }, { myPageLoader: loader }] = await Promise.all([
          import("@/src/pages/my-page"),
          import("@/features/archive/route/my-page-data"),
        ]);
        return { Component, loader };
      },
    }),
    scopedMemberRoute({
      path: "notifications",
      errorElement: <ArchiveRouteError />,
      fallback: <ArchiveRouteLoading label="알림을 불러오는 중" />,
      load: async () => {
        const [{ MemberNotificationsRoute: Component }, { memberNotificationsLoader: loader }] = await Promise.all([
          import("@/features/notifications/route/member-notifications-route"),
          import("@/features/notifications/route/member-notifications-data"),
        ]);
        return { Component, loader };
      },
    }),
    scopedMemberRoute({
      path: "notifications/settings",
      errorElement: <ArchiveRouteError />,
      fallback: <ArchiveRouteLoading label="알림 수신 설정을 불러오는 중" />,
      load: async () => {
        const [{ default: Component }, { memberNotificationSettingsLoader: loader }] = await Promise.all([
          import("@/src/pages/member-notification-settings"),
          import("@/features/notifications/route/member-notification-settings-data"),
        ]);
        return { Component, loader };
      },
    }),
    scopedMemberRoute({
      path: "sessions/:sessionId",
      errorElement: <ArchiveRouteError />,
      fallback: <ArchiveRouteLoading label="지난 세션 기록을 불러오는 중" />,
      load: async () => {
        const [{ default: Component }, { memberSessionDetailLoaderFactory }] = await Promise.all([
          import("@/src/pages/member-session"),
          import("@/features/archive/route/member-session-detail-data"),
        ]);
        return { Component, loader: memberSessionDetailLoaderFactory(queryClient) };
      },
    }),
    scopedMemberRoute({
      path: "feedback/:sessionId",
      errorElement: <FeedbackRouteError />,
      fallback: <ReadmatesRouteLoading label="피드백 문서를 불러오는 중" variant="member" />,
      load: async () => {
        const [{ default: Component }, { feedbackDocumentLoaderFactory }] = await Promise.all([
          import("@/src/pages/feedback-document"),
          import("@/features/feedback/route/feedback-document-data"),
        ]);
        return { Component, loader: feedbackDocumentLoaderFactory(queryClient) };
      },
    }),
    scopedMemberRoute({
      path: "feedback/:sessionId/print",
      errorElement: <FeedbackRouteError />,
      fallback: <ReadmatesRouteLoading label="피드백 문서를 불러오는 중" variant="member" />,
      load: async () => {
        const [{ default: Component }, { feedbackDocumentLoaderFactory }] = await Promise.all([
          import("@/src/pages/feedback-print"),
          import("@/features/feedback/route/feedback-document-data"),
        ]);
        return { Component, loader: feedbackDocumentLoaderFactory(queryClient) };
      },
    }),
    {
      path: "*",
      loader: scopedGuestRouteLoader(async () => async () => null),
      hydrateFallbackElement: <ReadmatesRouteLoading label="페이지를 불러오는 중" variant="member" />,
      element: <ScopedAudienceNotFoundRoute />,
    },
  ];
}

function memberAppRoutes(queryClient: QueryClient, options: { includeIndex?: boolean; scoped?: boolean } = {}): RouteObject[] {
  const { includeIndex = true, scoped = false } = options;

  if (scoped) {
    return scopedMemberAppRoutes(queryClient);
  }

  return [
    ...(includeIndex ? [memberHomeRoute(false)] : []),
    {
      path: "session/current",
      hydrateFallbackElement: <ReadmatesRouteLoading label="세션을 불러오는 중" variant="member" />,
      loader: scoped
        ? scopedGuestRouteLoader(async () => (await import("@/features/current-session")).currentSessionLoaderFactory(queryClient))
        : undefined,
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
          Component: componentForScopedAudience(CurrentSessionRouteElement, scoped),
          ErrorBoundary: CurrentSessionRouteError,
          ...(scoped ? {} : { loader: currentSessionLoaderFactory(queryClient) }),
        };
      },
    },
    {
      path: "notes",
      errorElement: <ArchiveRouteError />,
      hydrateFallbackElement: <ArchiveRouteLoading label="클럽 노트를 불러오는 중" />,
      loader: scoped
        ? scopedGuestRouteLoader(async () => (await import("@/features/archive/route/notes-feed-data")).notesFeedLoader)
        : undefined,
      lazy: async () => {
        const [{ default: NotesPage }, { notesFeedLoader, notesFeedShouldRevalidate }] = await Promise.all([
          import("@/src/pages/notes"),
          import("@/features/archive/route/notes-feed-data"),
        ]);
        return {
          Component: componentForScopedAudience(NotesPage, scoped),
          ...(scoped ? {} : { loader: notesFeedLoader }),
          shouldRevalidate: notesFeedShouldRevalidate,
        };
      },
    },
    {
      path: "archive",
      errorElement: <ArchiveRouteError />,
      hydrateFallbackElement: <ArchiveRouteLoading label="아카이브를 불러오는 중" />,
      loader: scoped
        ? scopedGuestRouteLoader(async () => (await import("@/features/archive/route/archive-list-data")).archiveListLoaderFactory(queryClient))
        : undefined,
      lazy: async () => {
        const [{ default: ArchiveRoutePage }, { archiveListLoaderFactory }] = await Promise.all([
          import("@/src/pages/archive"),
          import("@/features/archive/route/archive-list-data"),
        ]);
        return {
          Component: componentForScopedAudience(ArchiveRoutePage, scoped),
          ...(scoped ? {} : { loader: archiveListLoaderFactory(queryClient) }),
        };
      },
    },
    {
      path: "me/records",
      errorElement: <ArchiveRouteError />,
      hydrateFallbackElement: <ArchiveRouteLoading label="내 책별 기록을 불러오는 중" />,
      loader: scoped
        ? scopedGuestRouteLoader(async () => (await import("@/features/archive/route/my-records-data")).myRecordsLoader)
        : undefined,
      lazy: async () => {
        const [{ default: MyRecordsRoutePage }, { myRecordsLoader }] = await Promise.all([
          import("@/src/pages/my-records"),
          import("@/features/archive/route/my-records-data"),
        ]);
        return { Component: componentForScopedAudience(MyRecordsRoutePage, scoped), ...(scoped ? {} : { loader: myRecordsLoader }) };
      },
    },
    {
      path: "me/settings",
      errorElement: <ArchiveRouteError />,
      hydrateFallbackElement: <ArchiveRouteLoading label="계정 정보를 불러오는 중" />,
      loader: scoped
        ? scopedGuestRouteLoader(async () => (await import("@/features/archive/route/account-settings-data")).accountSettingsLoader)
        : undefined,
      lazy: async () => {
        const [{ default: AccountSettingsRoutePage }, { accountSettingsLoader }] = await Promise.all([
          import("@/src/pages/account-settings"),
          import("@/features/archive/route/account-settings-data"),
        ]);
        return {
          Component: componentForScopedAudience(AccountSettingsRoutePage, scoped),
          ...(scoped ? {} : { loader: accountSettingsLoader }),
        };
      },
    },
    {
      path: "me",
      errorElement: <ArchiveRouteError />,
      hydrateFallbackElement: <ArchiveRouteLoading label="내 공간을 불러오는 중" />,
      loader: scoped
        ? scopedGuestRouteLoader(async () => (await import("@/features/archive/route/my-page-data")).myPageLoader)
        : undefined,
      lazy: async () => {
        const [{ default: MyRoutePage }, { myPageLoader }] = await Promise.all([
          import("@/src/pages/my-page"),
          import("@/features/archive/route/my-page-data"),
        ]);
        return { Component: componentForScopedAudience(MyRoutePage, scoped), ...(scoped ? {} : { loader: myPageLoader }) };
      },
    },
    {
      path: "notifications",
      errorElement: <ArchiveRouteError />,
      hydrateFallbackElement: <ArchiveRouteLoading label="알림을 불러오는 중" />,
      loader: scoped
        ? scopedGuestRouteLoader(async () => (await import("@/features/notifications/route/member-notifications-data")).memberNotificationsLoader)
        : undefined,
      lazy: async () => {
        const [{ MemberNotificationsRoute }, { memberNotificationsLoader }] = await Promise.all([
          import("@/features/notifications/route/member-notifications-route"),
          import("@/features/notifications/route/member-notifications-data"),
        ]);
        return {
          Component: componentForScopedAudience(MemberNotificationsRoute, scoped),
          ...(scoped ? {} : { loader: memberNotificationsLoader }),
        };
      },
    },
    {
      path: "notifications/settings",
      errorElement: <ArchiveRouteError />,
      hydrateFallbackElement: <ArchiveRouteLoading label="알림 수신 설정을 불러오는 중" />,
      loader: scoped
        ? scopedGuestRouteLoader(async () => (await import("@/features/notifications/route/member-notification-settings-data")).memberNotificationSettingsLoader)
        : undefined,
      lazy: async () => {
        const [{ default: MemberNotificationSettingsRoutePage }, { memberNotificationSettingsLoader }] = await Promise.all([
          import("@/src/pages/member-notification-settings"),
          import("@/features/notifications/route/member-notification-settings-data"),
        ]);
        return {
          Component: componentForScopedAudience(MemberNotificationSettingsRoutePage, scoped),
          ...(scoped ? {} : { loader: memberNotificationSettingsLoader }),
        };
      },
    },
    {
      path: "sessions/:sessionId",
      errorElement: <ArchiveRouteError />,
      hydrateFallbackElement: <ArchiveRouteLoading label="지난 세션 기록을 불러오는 중" />,
      loader: scoped
        ? scopedGuestRouteLoader(async () => (await import("@/features/archive/route/member-session-detail-data")).memberSessionDetailLoaderFactory(queryClient))
        : undefined,
      lazy: async () => {
        const [{ default: MemberSessionDetailRoutePage }, { memberSessionDetailLoaderFactory }] = await Promise.all([
          import("@/src/pages/member-session"),
          import("@/features/archive/route/member-session-detail-data"),
        ]);
        return {
          Component: componentForScopedAudience(MemberSessionDetailRoutePage, scoped),
          ...(scoped ? {} : { loader: memberSessionDetailLoaderFactory(queryClient) }),
        };
      },
    },
    {
      path: "feedback/:sessionId",
      errorElement: <FeedbackRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="피드백 문서를 불러오는 중" variant="member" />,
      loader: scoped
        ? scopedGuestRouteLoader(async () => (await import("@/features/feedback/route/feedback-document-data")).feedbackDocumentLoaderFactory(queryClient))
        : undefined,
      lazy: async () => {
        const [{ default: FeedbackDocumentRoutePage }, { feedbackDocumentLoaderFactory }] = await Promise.all([
          import("@/src/pages/feedback-document"),
          import("@/features/feedback/route/feedback-document-data"),
        ]);
        return {
          Component: componentForScopedAudience(FeedbackDocumentRoutePage, scoped),
          ...(scoped ? {} : { loader: feedbackDocumentLoaderFactory(queryClient) }),
        };
      },
    },
    {
      path: "feedback/:sessionId/print",
      errorElement: <FeedbackRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="피드백 문서를 불러오는 중" variant="member" />,
      loader: scoped
        ? scopedGuestRouteLoader(async () => (await import("@/features/feedback/route/feedback-document-data")).feedbackDocumentLoaderFactory(queryClient))
        : undefined,
      lazy: async () => {
        const [{ default: FeedbackDocumentPrintRoutePage }, { feedbackDocumentLoaderFactory }] = await Promise.all([
          import("@/src/pages/feedback-print"),
          import("@/features/feedback/route/feedback-document-data"),
        ]);
        return {
          Component: componentForScopedAudience(FeedbackDocumentPrintRoutePage, scoped),
          ...(scoped ? {} : { loader: feedbackDocumentLoaderFactory(queryClient) }),
        };
      },
    },
    {
      path: "*",
      loader: scoped ? scopedGuestRouteLoader(async () => async () => null) : undefined,
      hydrateFallbackElement: <ReadmatesRouteLoading label="페이지를 불러오는 중" variant="member" />,
      element: scoped ? <ScopedAudienceNotFoundRoute /> : <NotFoundRoute variant="member" />,
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
      element: <ClubMemberAppRouteLayout />,
      loader: loadScopedClubAppAccess,
      errorElement: <RouteErrorBoundary variant="member" />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="멤버 공간을 불러오는 중" variant="member" />,
      children: memberAppRoutes(queryClient, { scoped: true }),
    },
  ];
}
