import type { HostWorkboxPage } from "@/features/host/api/host-workbox-contracts";

export function mergeCoherentWorkboxPages(
  root: HostWorkboxPage | undefined,
  pages: readonly HostWorkboxPage[],
): HostWorkboxPage | null {
  if (!root) return null;
  const coherentPages = pages.filter((page) => (
    page.state === root.state && page.evaluatedAt === root.evaluatedAt
  ));
  const last = coherentPages.at(-1);
  if (!last) return null;
  const seen = new Set<string>();
  return {
    ...last,
    evaluatedAt: root.evaluatedAt,
    items: coherentPages.flatMap((page) => page.items.filter((item) => {
      if (seen.has(item.key)) return false;
      seen.add(item.key);
      return true;
    })),
  };
}
