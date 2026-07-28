import { useLoaderData } from "react-router-dom";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { MemberAppAccess } from "@/shared/auth/member-app-loader";
import { RequireScopedMemberApp } from "@/src/app/route-guards";
import { AppRouteLayout } from "./app-route-layout";

export function ClubMemberAppRouteLayout() {
  const { auth, allowed } = useLoaderData() as MemberAppAccess;

  return (
    <RequireScopedMemberApp allowed={allowed}>
      <AppRouteLayout scopedAuth={auth} />
    </RequireScopedMemberApp>
  );
}

export function ClubHostAppRouteLayout() {
  const auth = useLoaderData() as AuthMeResponse;

  return <AppRouteLayout scopedAuth={auth} />;
}
