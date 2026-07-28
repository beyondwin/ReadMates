import {
  fetchMyJourney,
  fetchMyPage,
} from "@/features/archive/api/archive-api";
import type {
  MyJourneyPage,
  MyPageResponse,
} from "@/features/archive/api/archive-contracts";
import { inactiveMyPageProfile } from "@/features/archive/model/archive-model";
import { emptyMyJourneyPage } from "@/features/archive/model/my-reading-shelf-model";
import { loadArchiveMemberAuth } from "@/features/archive/route/archive-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import type { LoaderFunctionArgs } from "react-router-dom";

export type MyPageRouteData = {
  profile: MyPageResponse;
  journey: MyJourneyPage;
};

export async function myPageLoader(args?: LoaderFunctionArgs): Promise<MyPageRouteData> {
  const access = await loadArchiveMemberAuth(args);

  if (!access.allowed) {
    return {
      profile: inactiveMyPageProfile(access.auth),
      journey: emptyMyJourneyPage(),
    };
  }

  const context = { clubSlug: clubSlugFromLoaderArgs(args) };
  const [profile, journey] = await Promise.all([
    fetchMyPage(context),
    fetchMyJourney(context, { limit: 1 }),
  ]);

  return { profile, journey };
}
