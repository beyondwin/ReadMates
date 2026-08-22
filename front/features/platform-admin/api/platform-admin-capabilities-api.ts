import { readmatesFetch } from "@/shared/api/client";
import {
  parsePlatformAdminCapabilities,
  type PlatformAdminCapabilities,
} from "@/features/platform-admin/model/platform-admin-capabilities";

export function fetchPlatformAdminCapabilities(): Promise<PlatformAdminCapabilities> {
  return readmatesFetch<unknown>("/api/admin/capabilities", undefined, { clubSlug: undefined }).then(
    parsePlatformAdminCapabilities,
  );
}
