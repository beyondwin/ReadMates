import { readmatesFetch, type ExplicitReadmatesApiContext } from "@/shared/api/client";
import { parseHostPersonDetail, type HostPersonDetail } from "./host-person-contracts";

export type HostPersonAttendancePage = {
  attendanceCursor?: string;
  limit?: number;
};

export function parseHostPersonAttendancePage(
  page: HostPersonAttendancePage | undefined,
): HostPersonAttendancePage | undefined {
  if (!page) return undefined;
  if (page.attendanceCursor !== undefined && page.attendanceCursor.trim().length === 0) {
    throw new Error("host person cursor must contain a non-whitespace byte");
  }
  return { ...page };
}

export function fetchHostPersonDetail(
  membershipId: string,
  page: HostPersonAttendancePage | undefined,
  context: ExplicitReadmatesApiContext,
): Promise<HostPersonDetail> {
  const parsedPage = parseHostPersonAttendancePage(page);
  const params = new URLSearchParams();
  if (parsedPage?.attendanceCursor !== undefined) params.set("attendanceCursor", parsedPage.attendanceCursor);
  if (parsedPage?.limit !== undefined) params.set("limit", String(parsedPage.limit));
  const search = params.toString();
  const path = `/api/host/people/${encodeURIComponent(membershipId)}${search ? `?${search}` : ""}`;
  return readmatesFetch<HostPersonDetail>(path, undefined, context).then(parseHostPersonDetail);
}
