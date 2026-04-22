import type { LoaderFunctionArgs } from "react-router-dom";
import { fetchMemberArchiveSession } from "@/features/archive/api/archive-api";

export type MemberSessionDetailRouteData = Awaited<ReturnType<typeof fetchMemberArchiveSession>>;

export async function memberSessionDetailLoader({
  params,
}: LoaderFunctionArgs): Promise<MemberSessionDetailRouteData> {
  return params.sessionId ? fetchMemberArchiveSession(params.sessionId) : null;
}
