import { createBrowserRouter, type RouteObject } from "react-router-dom";
import {
  CurrentSessionRoute,
  CurrentSessionRouteError,
  currentSessionAction,
  currentSessionLoader,
  type InternalLinkComponent,
} from "@/features/current-session";
import {
  HostInvitationsRoute,
  HostMembersRoute,
  HostRouteError,
  hostDashboardLoader,
  hostInvitationsLoader,
  hostMembersLoader,
  hostSessionEditorLoader,
} from "@/features/host";
import {
  EditHostSessionRouteElement,
  HostDashboardRouteElement,
  NewHostSessionRouteElement,
} from "@/src/app/host-route-elements";
import { AppRouteLayout, PublicRouteLayout } from "@/src/app/layouts";
import { RequireAuth, RequireHost, RequireMemberApp } from "@/src/app/route-guards";
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

export const routes: RouteObject[] = [
  {
    element: <PublicRouteLayout />,
    children: [
      { path: "/", element: <PublicHomePage /> },
      { path: "/about", element: <AboutPage /> },
      { path: "/records", element: <PublicRecordsPage /> },
      { path: "/sessions/:sessionId", element: <PublicSessionPage /> },
      { path: "/login", element: <LoginPage /> },
      { path: "/invite/:token", element: <InvitePage /> },
      { path: "/reset-password/:token", element: <ResetPasswordPage /> },
    ],
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
    path: "/app",
    element: (
      <RequireMemberApp>
        <AppRouteLayout />
      </RequireMemberApp>
    ),
    children: [
      { index: true, element: <AppHomePage /> },
      {
        path: "session/current",
        element: <CurrentSessionRoute internalLinkComponent={currentSessionInternalLink} />,
        loader: currentSessionLoader,
        action: currentSessionAction,
        errorElement: <CurrentSessionRouteError />,
        hydrateFallbackElement: <ReadmatesRouteLoading label="세션을 불러오는 중" variant="member" />,
      },
      { path: "notes", element: <NotesPage /> },
      { path: "archive", element: <ArchiveRoutePage /> },
      { path: "me", element: <MyRoutePage /> },
      { path: "sessions/:sessionId", element: <MemberSessionDetailRoutePage /> },
      { path: "feedback/:sessionId", element: <FeedbackDocumentRoutePage /> },
      { path: "feedback/:sessionId/print", element: <FeedbackDocumentPrintRoutePage /> },
    ],
  },
  {
    path: "/app/host",
    element: (
      <RequireHost>
        <AppRouteLayout />
      </RequireHost>
    ),
    children: [
      {
        index: true,
        element: <HostDashboardRouteElement />,
        loader: hostDashboardLoader,
        errorElement: <HostRouteError />,
        hydrateFallbackElement: <ReadmatesRouteLoading label="운영 원장을 불러오는 중" variant="host" />,
      },
      {
        path: "members",
        element: <HostMembersRoute />,
        loader: hostMembersLoader,
        errorElement: <HostRouteError />,
        hydrateFallbackElement: <ReadmatesRouteLoading label="멤버 목록을 불러오는 중" variant="host" />,
      },
      {
        path: "invitations",
        element: <HostInvitationsRoute />,
        loader: hostInvitationsLoader,
        errorElement: <HostRouteError />,
        hydrateFallbackElement: <ReadmatesRouteLoading label="초대 목록을 불러오는 중" variant="host" />,
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
        hydrateFallbackElement: <ReadmatesRouteLoading label="세션 편집 정보를 불러오는 중" variant="host" />,
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
