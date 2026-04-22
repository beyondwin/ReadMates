import type { LoaderFunctionArgs } from "react-router-dom";
import { fetchMemberArchiveSession } from "@/features/archive/api/archive-api";
import { loadArchiveMemberAuth } from "@/features/archive/route/archive-loader-auth";

export type MemberSessionDetailRouteData = Awaited<ReturnType<typeof fetchMemberArchiveSession>>;

export async function memberSessionDetailLoader({
  params,
}: LoaderFunctionArgs): Promise<MemberSessionDetailRouteData> {
  const access = await loadArchiveMemberAuth();

  if (!access.allowed) {
    return null;
  }

  return params.sessionId ? fetchMemberArchiveSession(params.sessionId) : null;
}
