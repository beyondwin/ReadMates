import { fetchMyPage } from "@/features/archive/api/archive-api";
import type { MyPageResponse } from "@/features/archive/api/archive-contracts";
import { inactiveMyPageProfile } from "@/features/archive/model/archive-model";
import { loadArchiveMemberAuth } from "@/features/archive/route/archive-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import type { LoaderFunctionArgs } from "react-router";

export async function accountSettingsLoader(args?: LoaderFunctionArgs): Promise<MyPageResponse> {
  const access = await loadArchiveMemberAuth(args);

  if (!access.allowed) {
    return inactiveMyPageProfile(access.auth);
  }

  return fetchMyPage({ clubSlug: clubSlugFromLoaderArgs(args) });
}
