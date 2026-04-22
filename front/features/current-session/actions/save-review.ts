import { readmatesFetchResponse } from "@/shared/api/readmates";

export async function saveLongReview(body: string) {
  return readmatesFetchResponse("/api/sessions/current/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
}

export async function saveOneLineReview(text: string) {
  return readmatesFetchResponse("/api/sessions/current/one-line-reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}
