import { redirect } from "react-router-dom";
import { readmatesFetch } from "@/shared/api/client";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { canUseMemberApp } from "@/shared/auth/member-app-access";

type ClubScopedLoaderArgs = {
  clubSlug?: string;
  params?: {
    clubSlug?: string;
  };
};

export type MemberAppAccess = {
  auth: AuthMeResponse;
  allowed: boolean;
};

export function authMePath(clubSlug?: string) {
  return clubSlug ? `/api/auth/me?clubSlug=${encodeURIComponent(clubSlug)}` : "/api/auth/me";
}

export function scopedAppPath(clubSlug?: string) {
  return clubSlug ? `/clubs/${encodeURIComponent(clubSlug)}/app` : "/app";
}

export function clubSlugFromLoaderArgs(args?: ClubScopedLoaderArgs) {
  return args?.clubSlug ?? args?.params?.clubSlug;
}

export async function loadMemberAppAuth(args?: ClubScopedLoaderArgs): Promise<MemberAppAccess> {
  const clubSlug = clubSlugFromLoaderArgs(args);
  const auth = await readmatesFetch<AuthMeResponse>(authMePath(clubSlug), undefined, { clubSlug });

  if (!auth.authenticated) {
    throw redirect("/login");
  }

  return { auth, allowed: canUseMemberApp(auth) };
}
