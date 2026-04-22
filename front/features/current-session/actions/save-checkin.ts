import { saveCurrentSessionCheckin } from "@/features/current-session/api/current-session-api";

export async function saveCheckin(readingProgress: number, note: string) {
  return saveCurrentSessionCheckin(readingProgress, note);
}
