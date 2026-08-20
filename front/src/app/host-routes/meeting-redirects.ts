export function canonicalMeetingPath(pathname: string, search: string): string {
  const next = pathname.replace(/\/(edit|closing)$/, "");
  return `${next}${search}`;
}
