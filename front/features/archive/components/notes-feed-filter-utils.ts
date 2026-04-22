import type { FeedFilter } from "@/features/archive/components/notes-feed-list";

export function feedFilterFromSearchParam(value: string | null): FeedFilter {
  if (value === "questions" || value === "oneliners" || value === "highlights" || value === "checkins") {
    return value;
  }

  return "all";
}
