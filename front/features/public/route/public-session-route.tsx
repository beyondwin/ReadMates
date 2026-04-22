import { useLoaderData, useLocation } from "react-router-dom";
import type { PublicSessionRouteData } from "@/features/public/route/public-route-data";
import {
  publicRecordsReturnTarget,
  readPublicReadmatesReturnTarget,
} from "@/features/public/ui/public-route-continuity";
import { PublicMissingSessionPage } from "@/features/public/ui/public-missing-session-page";
import PublicSession from "@/features/public/ui/public-session";

export function PublicSessionRoute() {
  const session = useLoaderData() as PublicSessionRouteData;
  const location = useLocation();
  const returnTarget = readPublicReadmatesReturnTarget(location.state, publicRecordsReturnTarget);

  return session ? (
    <PublicSession session={session} returnTarget={returnTarget} />
  ) : (
    <PublicMissingSessionPage returnTarget={returnTarget} />
  );
}
