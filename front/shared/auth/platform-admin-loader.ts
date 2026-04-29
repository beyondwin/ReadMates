import { redirect } from "react-router-dom";
import { readmatesFetch } from "@/shared/api/client";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { canUsePlatformAdmin } from "@/shared/auth/platform-admin-access";

export async function requirePlatformAdminLoaderAuth() {
  const auth = await readmatesFetch<AuthMeResponse>("/api/auth/me", undefined, { clubSlug: undefined });

  if (!auth.authenticated) {
    throw redirect("/login");
  }

  if (!canUsePlatformAdmin(auth)) {
    throw redirect("/app");
  }

  return auth;
}
