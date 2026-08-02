import { redirect } from "react-router";
import { readmatesFetch, readmatesPublicFetch } from "@/shared/api/client";
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

const pendingScopedHostAuthorizations = new WeakMap<Request, Promise<AuthMeResponse>>();

async function requireScopedHostLoaderAuth(clubSlug: string): Promise<AuthMeResponse> {
  const auth = await readmatesPublicFetch<AuthMeResponse>(authMePath(clubSlug));
  if (!auth.authenticated || !canUseHostApp(auth)) {
    throw redirect(scopedAppPath(clubSlug));
  }
  return auth;
}

function requireScopedHostLoaderAuthForRequest(clubSlug: string, request?: Request): Promise<AuthMeResponse> {
  if (!request) {
    return requireScopedHostLoaderAuth(clubSlug);
  }

  const existing = pendingScopedHostAuthorizations.get(request);
  if (existing) {
    return existing;
  }

  const pending = requireScopedHostLoaderAuth(clubSlug);
  pendingScopedHostAuthorizations.set(request, pending);
  void pending.then(
    () => pendingScopedHostAuthorizations.delete(request),
    () => pendingScopedHostAuthorizations.delete(request),
  );
  return pending;
}

export async function requireHostLoaderAuth(args?: ClubScopedLoaderArgs): Promise<AuthMeResponse> {
  const clubSlug = clubSlugFromLoaderArgs(args);

  if (clubSlug) {
    return requireScopedHostLoaderAuthForRequest(clubSlug, args?.request);
  }

  const auth = await readmatesFetch<AuthMeResponse>(authMePath(clubSlug), undefined, { clubSlug });

  if (!auth.authenticated) {
    throw redirect(loginPathForReturnTo(returnToFromRequest(args?.request)));
  }

  if (!canUseHostApp(auth)) {
    throw redirect(scopedAppPath(clubSlug));
  }

  return auth;
}
