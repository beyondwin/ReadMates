import { queryOptions } from "@tanstack/react-query";
import {
  fetchHostPersonDetail,
  parseHostPersonAttendancePage,
  type HostPersonAttendancePage,
} from "../api/host-person-api";
import type { ExplicitReadmatesApiContext } from "@/shared/api/client";
import { hostClubQueryPrefix } from "./host-state-purge";

export const hostPersonKeys = {
  scope: (context: ExplicitReadmatesApiContext) =>
    [...hostClubQueryPrefix(context.clubSlug), "people"] as const,
  person: (membershipId: string, context: ExplicitReadmatesApiContext) =>
    [...hostPersonKeys.scope(context), membershipId] as const,
  detail: (
    membershipId: string,
    page: HostPersonAttendancePage | undefined,
    context: ExplicitReadmatesApiContext,
  ) => [...hostPersonKeys.person(membershipId, context), "detail", page ?? {}] as const,
} as const;

export function hostPersonDetailQuery(
  membershipId: string,
  page: HostPersonAttendancePage | undefined,
  context: ExplicitReadmatesApiContext,
) {
  const parsedPage = parseHostPersonAttendancePage(page);
  return queryOptions({
    queryKey: hostPersonKeys.detail(membershipId, parsedPage, context),
    queryFn: () => fetchHostPersonDetail(membershipId, parsedPage, context),
  });
}
