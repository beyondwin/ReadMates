export function canonicalMeetingPath(pathname: string, search: string): string {
  const closing = /\/closing$/.test(pathname);
  const next = pathname.replace(/\/(edit|closing)$/, "");
  if (!closing) return `${next}${search}`;

  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  // Owned meeting keys stay under host-session-workspace-navigation.ts ownership.
  // Landing on the diary records step always sets section=records; preserve unrelated keys.
  params.set("section", "records");
  const query = params.toString();
  return `${next}?${query}`;
}
