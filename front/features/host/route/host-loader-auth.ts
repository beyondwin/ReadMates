import { redirect } from "react-router-dom";
import { readmatesFetch } from "@/shared/api/client";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { loginPathForReturnTo } from "@/shared/auth/login-return";
import { canUseHostApp } from "@/shared/auth/member-app-access";
import { authMePath, clubSlugFromLoaderArgs, returnToFromRequest, scopedAppPath } from "@/shared/auth/member-app-loader";

type ClubScopedLoaderArgs = {
  clubSlug?: string;
  params?: {
    clubSlug?: string;
  };
  request?: Request;
};

export async function requireHostLoaderAuth(args?: ClubScopedLoaderArgs): Promise<AuthMeResponse> {
  const clubSlug = clubSlugFromLoaderArgs(args);
  const auth = await readmatesFetch<AuthMeResponse>(authMePath(clubSlug), undefined, { clubSlug });

  if (!auth.authenticated) {
    throw redirect(loginPathForReturnTo(returnToFromRequest(args?.request)));
  }

  if (!canUseHostApp(auth)) {
    throw redirect(scopedAppPath(clubSlug));
  }

  return auth;
}
