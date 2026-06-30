import type { AuthJoinedClub, AuthMeResponse, MemberRole, MembershipStatus } from "@/shared/auth/auth-contracts";
import { loginPathForReturnTo, safeRelativeReturnTo } from "@/shared/auth/login-return";

export type AdminWorkspaceDestination = {
  id: string;
  clubName: string;
  clubSlug: string;
  role: MemberRole;
  status: MembershipStatus;
  label: "호스트 공간" | "멤버 공간";
  href: string;
  priority: "primary" | "secondary";
};

const readableStatuses = new Set<MembershipStatus>(["VIEWER", "ACTIVE", "SUSPENDED"]);

function clubAppHref(clubSlug: string) {
  return `/clubs/${encodeURIComponent(clubSlug)}/app`;
}

function clubHostHref(clubSlug: string) {
  return `${clubAppHref(clubSlug)}/host`;
}

function memberDestination(club: AuthJoinedClub): AdminWorkspaceDestination {
  return {
    id: `${club.membershipId}:member`,
    clubName: club.clubName,
    clubSlug: club.clubSlug,
    role: club.role,
    status: club.status,
    label: "멤버 공간",
    href: clubAppHref(club.clubSlug),
    priority: "secondary",
  };
}

export function deriveAdminWorkspaceDestinations(
  auth: Pick<AuthMeResponse, "joinedClubs"> | null | undefined,
): AdminWorkspaceDestination[] {
  const destinations: AdminWorkspaceDestination[] = [];

  for (const club of auth?.joinedClubs ?? []) {
    if (club.role === "HOST" && club.status === "ACTIVE") {
      destinations.push({
        id: `${club.membershipId}:host`,
        clubName: club.clubName,
        clubSlug: club.clubSlug,
        role: club.role,
        status: club.status,
        label: "호스트 공간",
        href: clubHostHref(club.clubSlug),
        priority: "primary",
      });
      destinations.push(memberDestination(club));
      continue;
    }

    if (readableStatuses.has(club.status)) {
      destinations.push(memberDestination(club));
    }
  }

  return destinations;
}

export function adminWorkspaceAccountLabel(
  auth: Pick<AuthMeResponse, "email" | "accountName" | "displayName"> | null | undefined,
): string {
  return auth?.accountName || auth?.displayName || auth?.email || "현재 계정";
}

export function adminOtherAccountLoginPath(pathname: string, search: string, hash: string): string {
  const returnTo = safeRelativeReturnTo(`${pathname}${search}${hash}`);
  return loginPathForReturnTo(returnTo?.startsWith("/admin") ? returnTo : "/admin");
}
