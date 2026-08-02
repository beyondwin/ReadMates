import type { ShouldRevalidateFunctionArgs } from "react-router";

export function notesFeedShouldRevalidate({ currentUrl, nextUrl }: ShouldRevalidateFunctionArgs) {
  return currentUrl.searchParams.get("sessionId") !== nextUrl.searchParams.get("sessionId");
}
