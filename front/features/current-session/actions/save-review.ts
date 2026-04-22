import {
  saveCurrentSessionLongReview,
  saveCurrentSessionOneLineReview,
} from "@/features/current-session/api/current-session-api";

export async function saveLongReview(body: string) {
  return saveCurrentSessionLongReview(body);
}

export async function saveOneLineReview(text: string) {
  return saveCurrentSessionOneLineReview(text);
}
