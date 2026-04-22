import { readmatesFetch } from "@/shared/api/client";
import type {
  MemberHomeCurrentSessionResponse,
  MemberHomeMyPageResponse,
  MemberHomeNoteFeedItem,
} from "@/features/member-home/api/member-home-contracts";

export function fetchMemberHomeCurrentSession() {
  return readmatesFetch<MemberHomeCurrentSessionResponse>("/api/sessions/current");
}

export function fetchMemberHomeNoteFeed() {
  return readmatesFetch<MemberHomeNoteFeedItem[]>("/api/notes/feed");
}

export function fetchMemberHomeMyPage() {
  return readmatesFetch<MemberHomeMyPageResponse>("/api/app/me");
}
