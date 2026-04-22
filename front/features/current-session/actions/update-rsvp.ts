import { updateCurrentSessionRsvp } from "@/features/current-session/api/current-session-api";

export type RsvpStatus = "GOING" | "MAYBE" | "DECLINED";

export async function updateRsvp(status: RsvpStatus) {
  return updateCurrentSessionRsvp(status);
}
