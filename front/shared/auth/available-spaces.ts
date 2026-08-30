import type {
  AuthMeResponse,
  AvailableClubSpaceV1,
  AvailableSpacesV1,
  ClubPerspective,
  ProductSpaceKind,
} from "./auth-contracts";
import { normalizedClubSlug } from "@/shared/security/club-slug";

const PRODUCT_SPACE_ORDER: ProductSpaceKind[] = ["PLATFORM", "CLUBS"];
const CLUB_PERSPECTIVE_ORDER: ClubPerspective[] = ["MEMBER", "HOST"];
const READABLE_MEMBERSHIP_STATUSES = new Set(["VIEWER", "ACTIVE", "SUSPENDED"]);

export function normalizeAuthAvailableSpaces(auth: AuthMeResponse): AuthMeResponse {
  if (auth.availableSpaces === undefined) {
    return Object.defineProperty({ ...auth }, "availableSpaces", {
      value: fallbackAvailableSpaces(auth),
      enumerable: false,
    });
  }

  return {
    ...auth,
    availableSpaces: normalizeAvailableSpacesV1(auth.availableSpaces),
  };
}

export function normalizeAvailableSpacesV1(value: unknown): AvailableSpacesV1 {
  if (!isRecord(value) || value.version !== 1) {
    return emptyAvailableSpaces();
  }

  const requestedKinds = normalizeKinds(value.kinds);
  const clubs = requestedKinds.includes("CLUBS") ? normalizeClubs(value.clubs) : [];
  const kinds = PRODUCT_SPACE_ORDER.filter(
    (kind) => requestedKinds.includes(kind) && (kind !== "CLUBS" || clubs.length > 0),
  );

  return { version: 1, kinds, clubs };
}

function fallbackAvailableSpaces(auth: AuthMeResponse): AvailableSpacesV1 {
  if (auth.authenticated !== true) {
    return emptyAvailableSpaces();
  }

  const clubs = normalizeClubsFromLegacy(auth.joinedClubs);
  const kinds: ProductSpaceKind[] = [];
  if (auth.platformAdmin != null) {
    kinds.push("PLATFORM");
  }
  if (clubs.length > 0) {
    kinds.push("CLUBS");
  }

  return { version: 1, kinds, clubs };
}

function normalizeClubsFromLegacy(joinedClubs: unknown): AvailableClubSpaceV1[] {
  if (!Array.isArray(joinedClubs)) {
    return [];
  }

  const normalized: AvailableClubSpaceV1[] = [];
  for (const club of joinedClubs) {
    if (!isRecord(club)) {
      continue;
    }

    const perspectives: ClubPerspective[] = [];
    if (READABLE_MEMBERSHIP_STATUSES.has(club.status)) {
      perspectives.push("MEMBER");
    }
    if (club.role === "HOST" && club.status === "ACTIVE" && club.approvalState === "ACTIVE") {
      perspectives.push("HOST");
    }

    const normalizedClub = normalizeClub({
      clubId: club.clubId,
      clubSlug: club.clubSlug,
      clubName: club.clubName,
      perspectives,
    });
    if (normalizedClub) {
      mergeClub(normalized, normalizedClub);
    }
  }
  return normalized;
}

function normalizeClubs(value: unknown): AvailableClubSpaceV1[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: AvailableClubSpaceV1[] = [];
  for (const candidate of value) {
    const club = normalizeClub(candidate);
    if (club) {
      mergeClub(normalized, club);
    }
  }
  return normalized;
}

function normalizeClub(value: unknown): AvailableClubSpaceV1 | null {
  if (!isRecord(value)) {
    return null;
  }

  const clubId = nonEmptyString(value.clubId);
  const clubSlug = canonicalClubSlug(value.clubSlug);
  const clubName = nonEmptyString(value.clubName);
  const perspectives = normalizePerspectives(value.perspectives);
  if (!clubId || !clubSlug || !clubName || perspectives.length === 0) {
    return null;
  }

  return { clubId, clubSlug, clubName, perspectives };
}

function mergeClub(clubs: AvailableClubSpaceV1[], candidate: AvailableClubSpaceV1) {
  const existing = clubs.find((club) => club.clubId === candidate.clubId);
  if (!existing) {
    clubs.push(candidate);
    return;
  }

  existing.perspectives = CLUB_PERSPECTIVE_ORDER.filter(
    (perspective) => existing.perspectives.includes(perspective) || candidate.perspectives.includes(perspective),
  );
}

function normalizeKinds(value: unknown): ProductSpaceKind[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return PRODUCT_SPACE_ORDER.filter((kind) => value.includes(kind));
}

function normalizePerspectives(value: unknown): ClubPerspective[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return CLUB_PERSPECTIVE_ORDER.filter((perspective) => value.includes(perspective));
}

function canonicalClubSlug(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = normalizedClubSlug(value);
  return normalized === value ? normalized : "";
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() === value && value.length > 0 ? value : "";
}

function emptyAvailableSpaces(): AvailableSpacesV1 {
  return { version: 1, kinds: [], clubs: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
