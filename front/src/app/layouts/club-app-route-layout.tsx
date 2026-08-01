import { useLoaderData } from "react-router-dom";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { ClubAppAccess } from "@/features/guest-browse/route/club-app-audience-loader";
import { ClubAppAudienceProvider } from "@/features/guest-browse/route/club-app-audience-context";
import { GuestAppHead } from "@/features/guest-browse/ui/guest-app-head";
import { GuestNavigationProvider } from "@/features/guest-browse/ui/guest-navigation-dialog";
import { Link } from "@/src/app/router-link";
import { AppRouteLayout } from "./app-route-layout";

export function ClubMemberAppRouteLayout() {
  const access = useLoaderData() as ClubAppAccess;

  const shell = (
    <ClubAppAudienceProvider value={access}>
      <GuestAppHead audience={access.audience} />
      <AppRouteLayout scopedAuth={access.auth} audience={access.audience} />
    </ClubAppAudienceProvider>
  );

  return access.audience === "GUEST" ? <GuestNavigationProvider LinkComponent={Link}>{shell}</GuestNavigationProvider> : shell;
}

export function ClubHostAppRouteLayout() {
  const auth = useLoaderData() as AuthMeResponse;

  return <AppRouteLayout scopedAuth={auth} />;
}
