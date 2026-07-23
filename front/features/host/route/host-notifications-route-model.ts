import type { ManualNotificationOptionsResponse } from "@/features/host/api/host-contracts";

export function combineManualOptions(
  pages: Array<ManualNotificationOptionsResponse | undefined>,
): ManualNotificationOptionsResponse {
  const first = pages.find(Boolean);
  const last = [...pages].reverse().find(Boolean);
  if (!first) {
    return {
      session: null,
      templates: [],
      members: { items: [], nextCursor: null },
      recentDispatches: [],
    };
  }

  return {
    ...first,
    members: {
      items: [
        ...new Map(
          pages
            .flatMap((page) => page?.members.items ?? [])
            .map((member) => [member.membershipId, member]),
        ).values(),
      ],
      nextCursor: last?.members.nextCursor ?? null,
    },
  };
}
