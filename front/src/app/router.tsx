import { createBrowserRouter, type RouteObject } from "react-router-dom";
import {
  CurrentSessionRoute,
  CurrentSessionRouteError,
  currentSessionAction,
  currentSessionLoader,
  type InternalLinkComponent,
} from "@/features/current-session";
import { AppRouteLayout, PublicRouteLayout } from "@/src/app/layouts";
import { RequireAuth, RequireHost, RequireMemberApp } from "@/src/app/route-guards";
import { Link } from "@/src/app/router-link";
import AboutPage from "@/src/pages/about";
import AppHomePage from "@/src/pages/app-home";
import ArchiveRoutePage from "@/src/pages/archive";
import FeedbackDocumentRoutePage from "@/src/pages/feedback-document";
import FeedbackDocumentPrintRoutePage from "@/src/pages/feedback-print";
import HostPage from "@/src/pages/host-dashboard";
import HostInvitationsPage from "@/src/pages/host-invitations";
import HostMembersPage from "@/src/pages/host-members";
import EditHostSessionPage, { NewHostSessionPage } from "@/src/pages/host-session-editor";
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
      { index: true, element: <HostPage /> },
      { path: "members", element: <HostMembersPage /> },
      { path: "invitations", element: <HostInvitationsPage /> },
      { path: "sessions/new", element: <NewHostSessionPage /> },
      { path: "sessions/:sessionId/edit", element: <EditHostSessionPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
