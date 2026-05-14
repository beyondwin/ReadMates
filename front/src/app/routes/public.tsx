import type { RouteObject } from "react-router-dom";
import { PublicRouteError } from "@/features/public/route/public-route-state";
import { PublicRouteLayout } from "@/src/app/layouts";
import { NotFoundRoute, RouteErrorBoundary } from "@/src/app/route-error";
import { ReadmatesRouteLoading } from "@/src/pages/readmates-page";

export function publicRoutes(): RouteObject {
  return {
    element: <PublicRouteLayout />,
    errorElement: <RouteErrorBoundary variant="public" />,
    children: [
      {
        path: "/",
        errorElement: <PublicRouteError />,
        hydrateFallbackElement: <ReadmatesRouteLoading label="공개 홈을 불러오는 중" variant="public" />,
        lazy: async () => {
          const [{ default: PublicHomePage }, { publicClubLoader }] = await Promise.all([
            import("@/src/pages/public-home"),
            import("@/features/public/route/public-route-data"),
          ]);
          return { Component: PublicHomePage, loader: publicClubLoader };
        },
      },
      {
        path: "/about",
        errorElement: <PublicRouteError />,
        hydrateFallbackElement: <ReadmatesRouteLoading label="클럽 소개를 불러오는 중" variant="public" />,
        lazy: async () => {
          const [{ default: AboutPage }, { publicClubLoader }] = await Promise.all([
            import("@/src/pages/about"),
            import("@/features/public/route/public-route-data"),
          ]);
          return { Component: AboutPage, loader: publicClubLoader };
        },
      },
      {
        path: "/records",
        errorElement: <PublicRouteError />,
        hydrateFallbackElement: <ReadmatesRouteLoading label="공개 기록을 불러오는 중" variant="public" />,
        lazy: async () => {
          const [{ default: PublicRecordsPage }, { publicClubLoader }] = await Promise.all([
            import("@/src/pages/public-records"),
            import("@/features/public/route/public-route-data"),
          ]);
          return { Component: PublicRecordsPage, loader: publicClubLoader };
        },
      },
      {
        path: "/sessions/:sessionId",
        errorElement: <PublicRouteError />,
        hydrateFallbackElement: <ReadmatesRouteLoading label="공개 세션 기록을 불러오는 중" variant="public" />,
        lazy: async () => {
          const [{ default: PublicSessionPage }, { publicSessionLoader }] = await Promise.all([
            import("@/src/pages/public-session"),
            import("@/features/public/route/public-route-data"),
          ]);
          return { Component: PublicSessionPage, loader: publicSessionLoader };
        },
      },
      {
        path: "/clubs/:clubSlug",
        errorElement: <PublicRouteError />,
        hydrateFallbackElement: <ReadmatesRouteLoading label="공개 홈을 불러오는 중" variant="public" />,
        lazy: async () => {
          const [{ default: PublicHomePage }, { publicClubLoader }] = await Promise.all([
            import("@/src/pages/public-home"),
            import("@/features/public/route/public-route-data"),
          ]);
          return { Component: PublicHomePage, loader: publicClubLoader };
        },
      },
      {
        path: "/clubs/:clubSlug/about",
        errorElement: <PublicRouteError />,
        hydrateFallbackElement: <ReadmatesRouteLoading label="클럽 소개를 불러오는 중" variant="public" />,
        lazy: async () => {
          const [{ default: AboutPage }, { publicClubLoader }] = await Promise.all([
            import("@/src/pages/about"),
            import("@/features/public/route/public-route-data"),
          ]);
          return { Component: AboutPage, loader: publicClubLoader };
        },
      },
      {
        path: "/clubs/:clubSlug/records",
        errorElement: <PublicRouteError />,
        hydrateFallbackElement: <ReadmatesRouteLoading label="공개 기록을 불러오는 중" variant="public" />,
        lazy: async () => {
          const [{ default: PublicRecordsPage }, { publicClubLoader }] = await Promise.all([
            import("@/src/pages/public-records"),
            import("@/features/public/route/public-route-data"),
          ]);
          return { Component: PublicRecordsPage, loader: publicClubLoader };
        },
      },
      {
        path: "/clubs/:clubSlug/sessions/:sessionId",
        errorElement: <PublicRouteError />,
        hydrateFallbackElement: <ReadmatesRouteLoading label="공개 세션 기록을 불러오는 중" variant="public" />,
        lazy: async () => {
          const [{ default: PublicSessionPage }, { publicSessionLoader }] = await Promise.all([
            import("@/src/pages/public-session"),
            import("@/features/public/route/public-route-data"),
          ]);
          return { Component: PublicSessionPage, loader: publicSessionLoader };
        },
      },
      {
        path: "/login",
        hydrateFallbackElement: <ReadmatesRouteLoading label="로그인을 준비하는 중" variant="public" />,
        lazy: async () => {
          const { default: LoginPage } = await import("@/src/pages/login");
          return { Component: LoginPage };
        },
      },
      {
        path: "/clubs/:clubSlug/invite/:token",
        hydrateFallbackElement: <ReadmatesRouteLoading label="초대를 확인하는 중" variant="public" />,
        lazy: async () => {
          const { default: InvitePage } = await import("@/src/pages/invite");
          return { Component: InvitePage };
        },
      },
      {
        path: "/invite/:token",
        hydrateFallbackElement: <ReadmatesRouteLoading label="초대를 확인하는 중" variant="public" />,
        lazy: async () => {
          const { default: InvitePage } = await import("@/src/pages/invite");
          return { Component: InvitePage };
        },
      },
      {
        path: "/reset-password/:token",
        hydrateFallbackElement: <ReadmatesRouteLoading label="로그인 안내를 불러오는 중" variant="public" />,
        lazy: async () => {
          const { default: ResetPasswordPage } = await import("@/src/pages/reset-password");
          return { Component: ResetPasswordPage };
        },
      },
      { path: "*", element: <NotFoundRoute variant="public" /> },
    ],
  };
}
