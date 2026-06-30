import { readmatesApiPath } from "@/shared/api/client";

export function logoutCurrentSession() {
  return fetch(`/api/bff${readmatesApiPath("/api/auth/logout", { clubSlug: undefined })}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
}
