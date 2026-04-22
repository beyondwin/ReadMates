import type { LoaderFunctionArgs, ShouldRevalidateFunctionArgs } from "react-router-dom";
import { loadNotesFeedRouteData, type NotesFeedRouteData } from "@/features/archive/api/archive-api";

export async function notesFeedLoader({ request }: LoaderFunctionArgs): Promise<NotesFeedRouteData> {
  const url = new URL(request.url);

  return loadNotesFeedRouteData(url.searchParams.get("sessionId"));
}

export function notesFeedShouldRevalidate({
  currentUrl,
  nextUrl,
}: ShouldRevalidateFunctionArgs) {
  return currentUrl.searchParams.get("sessionId") !== nextUrl.searchParams.get("sessionId");
}
