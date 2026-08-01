import type { ShouldRevalidateFunctionArgs } from "react-router-dom";

export function notesFeedShouldRevalidate({ currentUrl, nextUrl }: ShouldRevalidateFunctionArgs) {
  return currentUrl.searchParams.get("sessionId") !== nextUrl.searchParams.get("sessionId");
}
