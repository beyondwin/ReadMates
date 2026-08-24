import type { ExplicitReadmatesApiContext } from "@/shared/api/client";
import { hostClubQueryPrefix } from "./host-state-purge";

export function hostNotificationManualOptionsRootKey(
  context: ExplicitReadmatesApiContext,
) {
  return [
    ...hostClubQueryPrefix(context.clubSlug),
    "notifications",
    "manual",
    "options",
  ] as const;
}
