import type { QueryClient } from "@tanstack/react-query";
import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { adminRoutes } from "@/src/app/routes/admin";
import { authRoutes } from "@/src/app/routes/auth";
import { hostRoutes } from "@/src/app/routes/host";
import { memberRoutes } from "@/src/app/routes/member";
import { publicRoutes } from "@/src/app/routes/public";
import { createReadmatesQueryClient } from "@/src/app/query-client";
import { attachRouteObservability, installGlobalRuntimeErrorObservers } from "@/src/app/route-observability";

export function buildRoutes(queryClient: QueryClient): RouteObject[] {
  return [
    ...authRoutes(queryClient),
    ...hostRoutes(queryClient),
    ...memberRoutes(queryClient),
    ...adminRoutes(queryClient),
    publicRoutes(queryClient),
  ];
}

export const routesQueryClient = createReadmatesQueryClient();
export const routes: RouteObject[] = buildRoutes(routesQueryClient);

let runtimeObserversInstalled = false;

export function createReadmatesRouter() {
  const queryClient = createReadmatesQueryClient();
  const router = createBrowserRouter(buildRoutes(queryClient));
  attachRouteObservability(router);
  if (!runtimeObserversInstalled && typeof globalThis.addEventListener === "function") {
    installGlobalRuntimeErrorObservers();
    runtimeObserversInstalled = true;
  }
  return { router, queryClient };
}
