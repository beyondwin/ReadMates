import { readmatesFetchResponse } from "@/shared/api/readmates";

export type RsvpStatus = "GOING" | "MAYBE" | "DECLINED";

export async function updateRsvp(status: RsvpStatus) {
  return readmatesFetchResponse("/api/sessions/current/rsvp", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}
