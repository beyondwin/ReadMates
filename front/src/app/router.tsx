import type { QueryClient } from "@tanstack/react-query";
import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { authRoutes } from "@/src/app/routes/auth";
import { hostRoutes } from "@/src/app/routes/host";
import { memberRoutes } from "@/src/app/routes/member";
import { publicRoutes } from "@/src/app/routes/public";
import { createReadmatesQueryClient } from "@/src/app/query-client";

export function buildRoutes(queryClient: QueryClient): RouteObject[] {
  return [
    publicRoutes(queryClient),
    ...authRoutes(queryClient),
    ...memberRoutes(queryClient),
    ...hostRoutes(queryClient),
  ];
}

export const routesQueryClient = createReadmatesQueryClient();
export const routes: RouteObject[] = buildRoutes(routesQueryClient);

export function createReadmatesRouter() {
  const queryClient = createReadmatesQueryClient();
  const router = createBrowserRouter(buildRoutes(queryClient));
  return { router, queryClient };
}
