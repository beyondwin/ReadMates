import { readmatesFetchResponse } from "@/shared/api/readmates";

export async function saveCheckin(readingProgress: number, note: string) {
  return readmatesFetchResponse("/api/sessions/current/checkin", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ readingProgress, note }),
  });
}
