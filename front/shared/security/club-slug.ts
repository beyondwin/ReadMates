export const CLUB_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export function normalizedClubSlug(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  return CLUB_SLUG_PATTERN.test(normalized) && !normalized.includes("--") ? normalized : "";
}
