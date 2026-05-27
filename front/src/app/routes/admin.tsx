import type { QueryClient } from "@tanstack/react-query";
import { Navigate, type RouteObject } from "react-router-dom";
import { NotFoundRoute, RouteErrorBoundary } from "@/src/app/route-error";
import { RequirePlatformAdmin } from "@/src/app/route-guards";
import { ReadmatesRouteLoading } from "@/src/pages/readmates-page";
import { adminShellLoaderFactory } from "@/features/platform-admin/route/admin-shell-data";
import {
  ADMIN_CLUB_DETAIL_ROUTE,
  ADMIN_ROUTES,
  type AdminRouteDescriptor,
} from "@/features/platform-admin/model/admin-route-catalog";

export function adminRoutes(queryClient: QueryClient): RouteObject[] {
  return [
    {
      id: "app-admin",
      path: "/admin",
      errorElement: <RouteErrorBoundary variant="auth" />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="플랫폼 관리를 불러오는 중" variant="auth" />,
      loader: adminShellLoaderFactory(queryClient),
      lazy: async () => {
        const { AdminShellLayout } = await import(
          "@/features/platform-admin/route/admin-shell-layout"
        );
        function AdminShellElement() {
          return (
            <RequirePlatformAdmin>
              <AdminShellLayout />
            </RequirePlatformAdmin>
          );
        }
        return { Component: AdminShellElement };
      },
      children: buildChildren(queryClient),
    },
  ];
}

function buildChildren(queryClient: QueryClient): RouteObject[] {
  const children: RouteObject[] = [
    { index: true, element: <Navigate to="today" replace /> },
  ];
  for (const route of ADMIN_ROUTES) {
    children.push(
      route.status === "ready"
        ? readyChild(route, queryClient)
        : comingSoonChild(route),
    );
  }
  children.push(clubDetailChild(queryClient));
  children.push({ path: "*", element: <NotFoundRoute variant="auth" /> });
  return children;
}

const adminChildHydrateFallback = <ReadmatesRouteLoading label="플랫폼 관리 화면 불러오는 중" variant="auth" />;

function readyChild(route: AdminRouteDescriptor, queryClient: QueryClient): RouteObject {
  switch (route.path) {
    case "today":
      return {
        path: "today",
        hydrateFallbackElement: adminChildHydrateFallback,
        lazy: async () => {
          const [{ AdminTodayRoute }, { adminTodayLoaderFactory }] = await Promise.all([
            import("@/features/platform-admin/route/admin-today-route"),
            import("@/features/platform-admin/route/admin-today-data"),
          ]);
          return { Component: AdminTodayRoute, loader: adminTodayLoaderFactory(queryClient) };
        },
      };
    case "clubs":
      return {
        path: "clubs",
        hydrateFallbackElement: adminChildHydrateFallback,
        lazy: async () => {
          const [{ AdminClubsRoute }, { adminClubsLoaderFactory }] = await Promise.all([
            import("@/features/platform-admin/route/admin-clubs-route"),
            import("@/features/platform-admin/route/admin-clubs-data"),
          ]);
          return { Component: AdminClubsRoute, loader: adminClubsLoaderFactory(queryClient) };
        },
      };
    case "ai-ops":
      return {
        path: "ai-ops",
        hydrateFallbackElement: adminChildHydrateFallback,
        lazy: async () => {
          const [{ AdminAiOpsRoute }, { adminAiOpsLoaderFactory }] = await Promise.all([
            import("@/features/platform-admin/route/admin-ai-ops-route"),
            import("@/features/platform-admin/route/admin-ai-ops-data"),
          ]);
          return { Component: AdminAiOpsRoute, loader: adminAiOpsLoaderFactory(queryClient) };
        },
      };
    case "support":
      return {
        path: "support",
        hydrateFallbackElement: adminChildHydrateFallback,
        lazy: async () => {
          const [{ AdminSupportRoute }, { adminSupportLoaderFactory }] = await Promise.all([
            import("@/features/platform-admin/route/admin-support-route"),
            import("@/features/platform-admin/route/admin-support-data"),
          ]);
          return { Component: AdminSupportRoute, loader: adminSupportLoaderFactory(queryClient) };
        },
      };
    case "health":
      return {
        path: "health",
        hydrateFallbackElement: adminChildHydrateFallback,
        lazy: async () => {
          const [{ AdminHealthRoute }, { adminHealthLoaderFactory }] = await Promise.all([
            import("@/features/platform-admin/route/admin-health-route"),
            import("@/features/platform-admin/route/admin-health-data"),
          ]);
          return { Component: AdminHealthRoute, loader: adminHealthLoaderFactory(queryClient) };
        },
      };
    case "notifications":
      return {
        path: "notifications",
        hydrateFallbackElement: adminChildHydrateFallback,
        lazy: async () => {
          const [{ AdminNotificationsRoute }, { adminNotificationsLoaderFactory }] = await Promise.all([
            import("@/features/platform-admin/route/admin-notifications-route"),
            import("@/features/platform-admin/route/admin-notifications-data"),
          ]);
          return {
            Component: AdminNotificationsRoute,
            loader: adminNotificationsLoaderFactory(queryClient),
          };
        },
      };
    default:
      throw new Error(`No ready route wired for catalog path ${route.path}`);
  }
}

function comingSoonChild(descriptor: AdminRouteDescriptor): RouteObject {
  return {
    path: descriptor.path,
    hydrateFallbackElement: adminChildHydrateFallback,
    lazy: async () => {
      const [{ AdminComingSoonRoute }, { adminComingSoonLoader }] = await Promise.all([
        import("@/features/platform-admin/route/admin-coming-soon-route"),
        import("@/features/platform-admin/route/admin-coming-soon-data"),
      ]);
      return {
        Component: AdminComingSoonRoute,
        loader: adminComingSoonLoader(descriptor),
      };
    },
  };
}

function clubDetailChild(queryClient: QueryClient): RouteObject {
  return {
    path: ADMIN_CLUB_DETAIL_ROUTE.path,
    hydrateFallbackElement: adminChildHydrateFallback,
    lazy: async () => {
      const [{ AdminClubDetailRoute }, { adminClubDetailLoaderFactory }] = await Promise.all([
        import("@/features/platform-admin/route/admin-club-detail-route"),
        import("@/features/platform-admin/route/admin-club-detail-data"),
      ]);
      return {
        Component: AdminClubDetailRoute,
        loader: adminClubDetailLoaderFactory(queryClient),
      };
    },
  };
}
