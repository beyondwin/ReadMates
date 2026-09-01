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

  const candidates: AvailableClubSpaceV1[] = [];
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
      candidates.push(normalizedClub);
    }
  }
  return mergeIdenticalClubRows(candidates);
}

function normalizeClubs(value: unknown): AvailableClubSpaceV1[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const candidates: AvailableClubSpaceV1[] = [];
  for (const candidate of value) {
    const club = normalizeClub(candidate);
    if (club) {
      candidates.push(club);
    }
  }
  return mergeIdenticalClubRows(candidates);
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

function mergeIdenticalClubRows(candidates: AvailableClubSpaceV1[]): AvailableClubSpaceV1[] {
  const byId = new Map<string, AvailableClubSpaceV1>();
  const bySlug = new Map<string, AvailableClubSpaceV1>();

  for (const candidate of candidates) {
    const sameId = byId.get(candidate.clubId);
    const sameSlug = bySlug.get(candidate.clubSlug);
    if ((sameId && !sameIdentity(sameId, candidate)) || (sameSlug && !sameIdentity(sameSlug, candidate))) {
      return [];
    }

    if (!sameId) {
      byId.set(candidate.clubId, candidate);
      bySlug.set(candidate.clubSlug, candidate);
      continue;
    }

    sameId.perspectives = CLUB_PERSPECTIVE_ORDER.filter(
      (perspective) => sameId.perspectives.includes(perspective) || candidate.perspectives.includes(perspective),
    );
  }

  return [...byId.values()];
}

function sameIdentity(left: AvailableClubSpaceV1, right: AvailableClubSpaceV1) {
  return left.clubId === right.clubId && left.clubSlug === right.clubSlug && left.clubName === right.clubName;
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
