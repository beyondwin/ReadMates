import type {
  AuthMeResponse,
  AvailableClubSpaceV1,
  AvailableSpacesV1,
  ClubPerspective,
  NormalizedAuthMeResponse,
  ProductSpaceKind,
} from "./auth-contracts";
import { normalizedClubSlug } from "@/shared/security/club-slug";

const PRODUCT_SPACE_ORDER: ProductSpaceKind[] = ["PLATFORM", "CLUBS"];
const CLUB_PERSPECTIVE_ORDER: ClubPerspective[] = ["MEMBER", "HOST"];
const READABLE_MEMBERSHIP_STATUSES = new Set(["VIEWER", "ACTIVE", "SUSPENDED"]);

export function normalizeAuthAvailableSpaces(auth: AuthMeResponse): NormalizedAuthMeResponse {
  return {
    ...auth,
    availableSpaces:
      auth.availableSpaces === undefined
        ? fallbackAvailableSpaces(auth)
        : normalizeAvailableSpacesV1(auth.availableSpaces),
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
  const rejected = emptyRejectedClubIdentity();
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
      mergeClub(normalized, normalizedClub, rejected);
    }
  }
  return normalized;
}

function normalizeClubs(value: unknown): AvailableClubSpaceV1[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: AvailableClubSpaceV1[] = [];
  const rejected = emptyRejectedClubIdentity();
  for (const candidate of value) {
    const club = normalizeClub(candidate);
    if (club) {
      mergeClub(normalized, club, rejected);
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

type RejectedClubIdentity = {
  ids: Set<string>;
  slugs: Set<string>;
};

function emptyRejectedClubIdentity(): RejectedClubIdentity {
  return { ids: new Set(), slugs: new Set() };
}

function mergeClub(
  clubs: AvailableClubSpaceV1[],
  candidate: AvailableClubSpaceV1,
  rejected: RejectedClubIdentity,
) {
  if (rejected.ids.has(candidate.clubId) || rejected.slugs.has(candidate.clubSlug)) {
    rejectConflictingClubIdentity(clubs, candidate, undefined, undefined, rejected);
    return;
  }

  const sameId = clubs.find((club) => club.clubId === candidate.clubId);
  const sameSlug = clubs.find((club) => club.clubSlug === candidate.clubSlug);
  if ((sameId && !sameIdentity(sameId, candidate)) || (sameSlug && sameSlug.clubId !== candidate.clubId)) {
    rejectConflictingClubIdentity(clubs, candidate, sameId, sameSlug, rejected);
    return;
  }

  if (!sameId) {
    clubs.push(candidate);
    return;
  }

  sameId.perspectives = CLUB_PERSPECTIVE_ORDER.filter(
    (perspective) => sameId.perspectives.includes(perspective) || candidate.perspectives.includes(perspective),
  );
}

function sameIdentity(left: AvailableClubSpaceV1, right: AvailableClubSpaceV1) {
  return left.clubId === right.clubId && left.clubSlug === right.clubSlug && left.clubName === right.clubName;
}

function rejectConflictingClubIdentity(
  clubs: AvailableClubSpaceV1[],
  candidate: AvailableClubSpaceV1,
  sameId: AvailableClubSpaceV1 | undefined,
  sameSlug: AvailableClubSpaceV1 | undefined,
  rejected: RejectedClubIdentity,
) {
  const conflicts = [candidate, sameId, sameSlug].filter((club): club is AvailableClubSpaceV1 => club !== undefined);
  for (const club of conflicts) {
    rejected.ids.add(club.clubId);
    rejected.slugs.add(club.clubSlug);
  }
  for (let index = clubs.length - 1; index >= 0; index -= 1) {
    if (rejected.ids.has(clubs[index].clubId) || rejected.slugs.has(clubs[index].clubSlug)) {
      clubs.splice(index, 1);
    }
  }
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

export function emptyAvailableSpaces(): AvailableSpacesV1 {
  return { version: 1, kinds: [], clubs: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
