import { createBrowserRouter, type RouteObject } from "react-router-dom";
import {
  CurrentSessionRoute,
  CurrentSessionRouteError,
  currentSessionAction,
  currentSessionLoader,
  type InternalLinkComponent,
} from "@/features/current-session";
import { archiveListLoader } from "@/features/archive/route/archive-list-data";
import {
  ArchiveRouteError,
  ArchiveRouteLoading,
} from "@/features/archive/route/archive-route-state";
import { clubSelectionLoader } from "@/features/club-selection/route/club-selection-data";
import { ClubSelectionRoute } from "@/features/club-selection/route/club-selection-route";
import { publicClubLoader, publicSessionLoader } from "@/features/public/route/public-route-data";
import { PublicRouteError } from "@/features/public/route/public-route-state";
import { platformAdminLoader } from "@/features/platform-admin/route/platform-admin-data";
import { PlatformAdminRoute } from "@/features/platform-admin/route/platform-admin-route";
import { feedbackDocumentLoader } from "@/features/feedback/route/feedback-document-data";
import { FeedbackRouteError } from "@/features/feedback/route/feedback-route-state";
import { memberHomeLoader } from "@/features/member-home/route/member-home-data";
import { memberNotificationsLoader } from "@/features/notifications/route/member-notifications-data";
import { MemberNotificationsRoute } from "@/features/notifications/route/member-notifications-route";
import { memberSessionDetailLoader } from "@/features/archive/route/member-session-detail-data";
import { myPageLoader } from "@/features/archive/route/my-page-data";
import {
  notesFeedLoader,
  notesFeedShouldRevalidate,
} from "@/features/archive/route/notes-feed-data";
import {
  HostRouteError,
  hostDashboardLoader,
  hostInvitationsLoader,
  hostMembersLoader,
  hostNotificationsLoader,
  hostSessionEditorLoader,
} from "@/features/host";
import {
  EditHostSessionRouteElement,
  HostDashboardRouteElement,
  HostInvitationsRouteElement,
  HostMembersRouteElement,
  HostNotificationsRouteElement,
  NewHostSessionRouteElement,
} from "@/src/app/host-route-elements";
import { requireHostLoaderAuth } from "@/features/host/route/host-loader-auth";
import { loadMemberAppAuth } from "@/shared/auth/member-app-loader";
import { AppRouteLayout, PublicRouteLayout } from "@/src/app/layouts";
import { RequireAuth, RequireHost, RequireMemberApp, RequirePlatformAdmin } from "@/src/app/route-guards";
import { Link } from "@/src/app/router-link";
import AboutPage from "@/src/pages/about";
import AppHomePage from "@/src/pages/app-home";
import ArchiveRoutePage from "@/src/pages/archive";
import FeedbackDocumentRoutePage from "@/src/pages/feedback-document";
import FeedbackDocumentPrintRoutePage from "@/src/pages/feedback-print";
import InvitePage from "@/src/pages/invite";
import LoginPage from "@/src/pages/login";
import MemberSessionDetailRoutePage from "@/src/pages/member-session";
import MyRoutePage from "@/src/pages/my-page";
import NotesPage from "@/src/pages/notes";
import PendingApprovalPage from "@/src/pages/pending-approval";
import PublicHomePage from "@/src/pages/public-home";
import PublicRecordsPage from "@/src/pages/public-records";
import PublicSessionPage from "@/src/pages/public-session";
import { ReadmatesRouteLoading } from "@/src/pages/readmates-page";
import ResetPasswordPage from "@/src/pages/reset-password";

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
    element: <AppHomePage />,
    loader: memberHomeLoader,
    errorElement: <ArchiveRouteError />,
    hydrateFallbackElement: <ReadmatesRouteLoading label="멤버 홈을 불러오는 중" variant="member" />,
  };
}

function memberAppRoutes(options: { includeIndex?: boolean } = {}): RouteObject[] {
  const { includeIndex = true } = options;
  return [
    ...(includeIndex ? [memberHomeRoute()] : []),
    {
      path: "session/current",
      element: <CurrentSessionRoute internalLinkComponent={currentSessionInternalLink} />,
      loader: currentSessionLoader,
      action: currentSessionAction,
      errorElement: <CurrentSessionRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="세션을 불러오는 중" variant="member" />,
    },
    {
      path: "notes",
      element: <NotesPage />,
      loader: notesFeedLoader,
      shouldRevalidate: notesFeedShouldRevalidate,
      errorElement: <ArchiveRouteError />,
      hydrateFallbackElement: <ArchiveRouteLoading label="클럽 노트를 불러오는 중" />,
    },
    {
      path: "archive",
      element: <ArchiveRoutePage />,
      loader: archiveListLoader,
      errorElement: <ArchiveRouteError />,
      hydrateFallbackElement: <ArchiveRouteLoading label="아카이브를 불러오는 중" />,
    },
    {
      path: "me",
      element: <MyRoutePage />,
      loader: myPageLoader,
      errorElement: <ArchiveRouteError />,
      hydrateFallbackElement: <ArchiveRouteLoading label="내 공간을 불러오는 중" />,
    },
    {
      path: "notifications",
      element: <MemberNotificationsRoute />,
      loader: memberNotificationsLoader,
      errorElement: <ArchiveRouteError />,
      hydrateFallbackElement: <ArchiveRouteLoading label="알림을 불러오는 중" />,
    },
    {
      path: "sessions/:sessionId",
      element: <MemberSessionDetailRoutePage />,
      loader: memberSessionDetailLoader,
      errorElement: <ArchiveRouteError />,
      hydrateFallbackElement: <ArchiveRouteLoading label="지난 세션 기록을 불러오는 중" />,
    },
    {
      path: "feedback/:sessionId",
      element: <FeedbackDocumentRoutePage />,
      loader: feedbackDocumentLoader,
      errorElement: <FeedbackRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="피드백 문서를 불러오는 중" variant="member" />,
    },
    {
      path: "feedback/:sessionId/print",
      element: <FeedbackDocumentPrintRoutePage />,
      loader: feedbackDocumentLoader,
      errorElement: <FeedbackRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="피드백 문서를 불러오는 중" variant="member" />,
    },
  ];
}

function hostAppRoutes(): RouteObject[] {
  return [
    {
      index: true,
      element: <HostDashboardRouteElement />,
      loader: hostDashboardLoader,
      errorElement: <HostRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="모임 운영 화면을 불러오는 중" variant="host" />,
    },
    {
      path: "members",
      element: <HostMembersRouteElement />,
      loader: hostMembersLoader,
      errorElement: <HostRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="멤버 목록을 불러오는 중" variant="host" />,
    },
    {
      path: "invitations",
      element: <HostInvitationsRouteElement />,
      loader: hostInvitationsLoader,
      errorElement: <HostRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="초대 목록을 불러오는 중" variant="host" />,
    },
    {
      path: "notifications",
      element: <HostNotificationsRouteElement />,
      loader: hostNotificationsLoader,
      errorElement: <HostRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="알림 발송 장부를 불러오는 중" variant="host" />,
    },
    {
      path: "sessions/new",
      element: <NewHostSessionRouteElement />,
      errorElement: <HostRouteError />,
    },
    {
      path: "sessions/:sessionId/edit",
      element: <EditHostSessionRouteElement />,
      loader: hostSessionEditorLoader,
      errorElement: <HostRouteError />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="세션 문서 정보를 불러오는 중" variant="host" />,
    },
  ];
}

export const routes: RouteObject[] = [
  {
    element: <PublicRouteLayout />,
    children: [
      {
        path: "/",
        element: <PublicHomePage />,
        loader: publicClubLoader,
        errorElement: <PublicRouteError />,
        hydrateFallbackElement: <ReadmatesRouteLoading label="공개 홈을 불러오는 중" variant="public" />,
      },
      {
        path: "/about",
        element: <AboutPage />,
        loader: publicClubLoader,
        errorElement: <PublicRouteError />,
        hydrateFallbackElement: <ReadmatesRouteLoading label="클럽 소개를 불러오는 중" variant="public" />,
      },
      {
        path: "/records",
        element: <PublicRecordsPage />,
        loader: publicClubLoader,
        errorElement: <PublicRouteError />,
        hydrateFallbackElement: <ReadmatesRouteLoading label="공개 기록을 불러오는 중" variant="public" />,
      },
      {
        path: "/sessions/:sessionId",
        element: <PublicSessionPage />,
        loader: publicSessionLoader,
        errorElement: <PublicRouteError />,
        hydrateFallbackElement: <ReadmatesRouteLoading label="공개 세션 기록을 불러오는 중" variant="public" />,
      },
      {
        path: "/clubs/:clubSlug",
        element: <PublicHomePage />,
        loader: publicClubLoader,
        errorElement: <PublicRouteError />,
        hydrateFallbackElement: <ReadmatesRouteLoading label="공개 홈을 불러오는 중" variant="public" />,
      },
      {
        path: "/clubs/:clubSlug/about",
        element: <AboutPage />,
        loader: publicClubLoader,
        errorElement: <PublicRouteError />,
        hydrateFallbackElement: <ReadmatesRouteLoading label="클럽 소개를 불러오는 중" variant="public" />,
      },
      {
        path: "/clubs/:clubSlug/records",
        element: <PublicRecordsPage />,
        loader: publicClubLoader,
        errorElement: <PublicRouteError />,
        hydrateFallbackElement: <ReadmatesRouteLoading label="공개 기록을 불러오는 중" variant="public" />,
      },
      {
        path: "/clubs/:clubSlug/sessions/:sessionId",
        element: <PublicSessionPage />,
        loader: publicSessionLoader,
        errorElement: <PublicRouteError />,
        hydrateFallbackElement: <ReadmatesRouteLoading label="공개 세션 기록을 불러오는 중" variant="public" />,
      },
      { path: "/login", element: <LoginPage /> },
      { path: "/clubs/:clubSlug/invite/:token", element: <InvitePage /> },
      { path: "/invite/:token", element: <InvitePage /> },
      { path: "/reset-password/:token", element: <ResetPasswordPage /> },
    ],
  },
  {
    path: "/admin",
    element: (
      <RequirePlatformAdmin>
        <PlatformAdminRoute />
      </RequirePlatformAdmin>
    ),
    loader: platformAdminLoader,
    errorElement: <ArchiveRouteError />,
    hydrateFallbackElement: <ReadmatesRouteLoading label="플랫폼 관리를 불러오는 중" variant="member" />,
  },
  {
    path: "/app/pending",
    element: (
      <RequireAuth>
        <PendingApprovalPage />
      </RequireAuth>
    ),
  },
  {
    path: "/clubs/:clubSlug/app/pending",
    element: (
      <RequireAuth>
        <PendingApprovalPage />
      </RequireAuth>
    ),
  },
  {
    path: "/app",
    children: [
      {
        index: true,
        element: (
          <RequireAuth>
            <ClubSelectionRoute />
          </RequireAuth>
        ),
        loader: clubSelectionLoader,
        errorElement: <ArchiveRouteError />,
        hydrateFallbackElement: <ReadmatesRouteLoading label="클럽을 확인하는 중" variant="member" />,
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
    hydrateFallbackElement: <ReadmatesRouteLoading label="모임 운영 권한을 확인하는 중" variant="host" />,
    children: hostAppRoutes(),
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
    hydrateFallbackElement: <ReadmatesRouteLoading label="모임 운영 권한을 확인하는 중" variant="host" />,
    children: hostAppRoutes(),
  },
];

export function createReadmatesRouter() {
  return createBrowserRouter(routes);
}
