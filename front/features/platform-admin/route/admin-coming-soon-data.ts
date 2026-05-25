import type { AdminRouteDescriptor } from "@/features/platform-admin/model/admin-route-catalog";

export function adminComingSoonLoader(descriptor: AdminRouteDescriptor) {
  return async () => descriptor;
}
