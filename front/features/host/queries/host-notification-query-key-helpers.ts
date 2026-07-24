import type { ReadmatesApiContext } from "@/shared/api/client";

export function hostNotificationManualOptionsRootKey(
  context?: ReadmatesApiContext,
) {
  return [
    "host",
    "notifications",
    "scope",
    context?.clubSlug ?? null,
    "manual",
    "options",
  ] as const;
}
