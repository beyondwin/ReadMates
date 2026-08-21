import type { LoaderFunctionArgs } from "react-router";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import { requireHostLoaderAuth } from "./host-loader-auth";

export type HostOperationsRouteData = {
  auth: AuthMeResponse;
  clubSlug: string | undefined;
};

export async function hostOperationsLoader(args?: LoaderFunctionArgs): Promise<HostOperationsRouteData> {
  const auth = await requireHostLoaderAuth(args);
  return { auth, clubSlug: clubSlugFromLoaderArgs(args) };
}
