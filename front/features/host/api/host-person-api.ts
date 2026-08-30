import { readmatesFetch, type ExplicitReadmatesApiContext } from "@/shared/api/client";
import { parseHostPersonDetail, type HostPersonDetail } from "./host-person-contracts";

export type HostPersonAttendancePage = {
  attendanceCursor?: string;
  limit?: number;
};

export function fetchHostPersonDetail(
  membershipId: string,
  page: HostPersonAttendancePage | undefined,
  context: ExplicitReadmatesApiContext,
): Promise<HostPersonDetail> {
  const params = new URLSearchParams();
  if (page?.attendanceCursor) params.set("attendanceCursor", page.attendanceCursor);
  if (page?.limit !== undefined) params.set("limit", String(page.limit));
  const search = params.toString();
  const path = `/api/host/people/${encodeURIComponent(membershipId)}${search ? `?${search}` : ""}`;
  return readmatesFetch<HostPersonDetail>(path, undefined, context).then(parseHostPersonDetail);
}
