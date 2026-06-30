import { readmatesFetchResponse } from "@/shared/api/client";

export function logoutCurrentSession() {
  return readmatesFetchResponse("/api/auth/logout", { method: "POST" }, { clubSlug: undefined });
}
