import { Link, useLoaderData } from "react-router-dom";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { ClubSelectionPage } from "@/features/club-selection/ui/club-selection-page";

export function ClubSelectionRoute() {
  const auth = useLoaderData() as AuthMeResponse;

  return <ClubSelectionPage auth={auth} linkComponent={Link} />;
}
