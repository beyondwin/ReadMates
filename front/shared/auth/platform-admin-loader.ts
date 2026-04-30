import { redirect } from "react-router-dom";
import { readmatesFetch } from "@/shared/api/client";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { loginPathForReturnTo } from "@/shared/auth/login-return";
import { returnToFromRequest } from "@/shared/auth/member-app-loader";
import { canUsePlatformAdmin } from "@/shared/auth/platform-admin-access";

type PlatformAdminLoaderArgs = {
  request?: Request;
};

export async function requirePlatformAdminLoaderAuth(args?: PlatformAdminLoaderArgs) {
  const auth = await readmatesFetch<AuthMeResponse>("/api/auth/me", undefined, { clubSlug: undefined });

  if (!auth.authenticated) {
    throw redirect(loginPathForReturnTo(returnToFromRequest(args?.request)));
  }

  if (!canUsePlatformAdmin(auth)) {
    throw redirect("/app");
  }

  return auth;
}
