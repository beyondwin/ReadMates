import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkPlatformAdminDomainProvisioning,
  commitPlatformAdminOnboarding,
  confirmPlatformAdminClubVisibility,
  confirmPlatformAdminDomain,
  fetchPlatformAdminClub,
  fetchPlatformAdminClubs,
  previewPlatformAdminClubVisibility,
  previewPlatformAdminDomain,
  updatePlatformAdminClubMetadata,
} from "./platform-admin-api";

const CLUB_ID = "123e4567-e89b-42d3-a456-426614174000";
const DOMAIN_ID = "123e4567-e89b-42d3-a456-426614174001";
const PREVIEW_ID = "123e4567-e89b-42d3-a456-426614174002";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function successfulFetch(body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(body));
}

function requestBody(fetchSpy: ReturnType<typeof successfulFetch>) {
  return JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body)) as unknown;
}

const club = {
  clubId: CLUB_ID,
  slug: "sample-club",
  name: "샘플 클럽",
  tagline: "함께 읽습니다",
  about: "공개 소개",
  status: "ACTIVE",
  publicVisibility: "PRIVATE",
  domainCount: 0,
  domainActionRequiredCount: 0,
  notificationFailureCount: 0,
  aiFailureCount: 0,
  firstHostOnboardingState: "ASSIGNED",
  adminRevision: 7,
};

const receipt = {
  receiptId: "123e4567-e89b-42d3-a456-426614174010",
  commandType: "club.visibility.change",
  clubId: CLUB_ID,
  beforeAdminRevision: 7,
  afterAdminRevision: 8,
  outcome: "SUCCEEDED",
  resultCode: "VISIBILITY_CHANGED",
  targetId: null,
  convergenceId: null,
  convergenceState: null,
};

afterEach(() => vi.restoreAllMocks());

describe("platform admin club API", () => {
  it("serializes server-owned filters and cursor without a club slug", async () => {
    const fetchSpy = successfulFetch({ items: [club], nextCursor: null });

    await fetchPlatformAdminClubs({
      search: " 샘플 ",
      lifecycle: "ACTIVE",
      visibility: "PRIVATE",
      domainStatus: "ACTION_REQUIRED",
      onboardingState: "ASSIGNED",
      cursor: "opaque-next",
      limit: 25,
    });

    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "/api/bff/api/admin/clubs?search=+%EC%83%98%ED%94%8C+&lifecycle=ACTIVE&visibility=PRIVATE&domainStatus=ACTION_REQUIRED&onboardingState=ASSIGNED&cursor=opaque-next&limit=25",
    );
  });

  it("loads an authoritative club detail by UUID", async () => {
    const fetchSpy = successfulFetch({ ...club, domains: [] });

    await fetchPlatformAdminClub(CLUB_ID);

    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      `/api/bff/api/admin/clubs/${CLUB_ID}`,
    );
  });

  it("sends metadata revision CAS to the exact endpoint", async () => {
    const fetchSpy = successfulFetch({
      ...club,
      name: "새 이름",
      adminRevision: 8,
      domains: [],
    });

    await updatePlatformAdminClubMetadata(CLUB_ID, {
      expectedAdminRevision: 7,
      name: "새 이름",
    });

    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      `/api/bff/api/admin/clubs/${CLUB_ID}/metadata`,
    );
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH" });
    expect(requestBody(fetchSpy)).toEqual({
      expectedAdminRevision: 7,
      name: "새 이름",
    });
  });

  it("uses distinct visibility preview and confirm payloads", async () => {
    const previewFetch = successfulFetch({
      previewId: PREVIEW_ID,
      expiresAt: "2026-08-24T12:10:00Z",
      currentVisibility: "PRIVATE",
      targetVisibility: "PUBLIC",
      impactCodes: ["ENABLE_PUBLIC_ACCESS"],
      requestFingerprintPrefix: "a1b2c3d4",
    });
    await previewPlatformAdminClubVisibility(CLUB_ID, {
      expectedAdminRevision: 7,
      targetVisibility: "PUBLIC",
    });
    expect(previewFetch.mock.calls[0]?.[0]).toBe(
      `/api/bff/api/admin/clubs/${CLUB_ID}/visibility/preview`,
    );
    expect(requestBody(previewFetch)).toEqual({
      expectedAdminRevision: 7,
      targetVisibility: "PUBLIC",
    });
    previewFetch.mockRestore();

    const confirmFetch = successfulFetch(receipt);
    await confirmPlatformAdminClubVisibility(CLUB_ID, {
      previewId: PREVIEW_ID,
      idempotencyKey: "intent_visibility_1",
      expectedAdminRevision: 7,
      targetVisibility: "PUBLIC",
      confirmed: true,
    });
    expect(confirmFetch.mock.calls[0]?.[0]).toBe(
      `/api/bff/api/admin/clubs/${CLUB_ID}/visibility/confirm`,
    );
    expect(requestBody(confirmFetch)).toMatchObject({
      previewId: PREVIEW_ID,
      idempotencyKey: "intent_visibility_1",
      targetVisibility: "PUBLIC",
      confirmed: true,
    });
  });

  it("binds domain preview, confirm, and recheck to their full intent", async () => {
    const previewFetch = successfulFetch({
      previewId: PREVIEW_ID,
      expiresAt: "2026-08-24T12:10:00Z",
      kind: "CUSTOM_DOMAIN",
      isPrimary: true,
      impactCodes: ["CREATE_DOMAIN"],
      requestFingerprintPrefix: "b1c2d3e4",
    });
    await previewPlatformAdminDomain(CLUB_ID, {
      expectedAdminRevision: 7,
      hostname: "club.example.test",
      kind: "CUSTOM_DOMAIN",
      isPrimary: true,
    });
    expect(previewFetch.mock.calls[0]?.[0]).toBe(
      `/api/bff/api/admin/clubs/${CLUB_ID}/domains/preview`,
    );
    previewFetch.mockRestore();

    const confirmFetch = successfulFetch({
      ...receipt,
      commandType: "club.domain.create",
      targetId: DOMAIN_ID,
    });
    await confirmPlatformAdminDomain(CLUB_ID, {
      previewId: PREVIEW_ID,
      idempotencyKey: "intent_domain_1",
      expectedAdminRevision: 7,
      hostname: "club.example.test",
      kind: "CUSTOM_DOMAIN",
      isPrimary: true,
      confirmed: true,
    });
    expect(requestBody(confirmFetch)).toMatchObject({
      hostname: "club.example.test",
      confirmed: true,
    });
    confirmFetch.mockRestore();

    const recheckFetch = successfulFetch({
      ...receipt,
      commandType: "club.domain.recheck",
      targetId: DOMAIN_ID,
      convergenceId: "123e4567-e89b-42d3-a456-426614174011",
      convergenceState: "PENDING",
    });
    await checkPlatformAdminDomainProvisioning(DOMAIN_ID, {
      idempotencyKey: "intent_recheck_1",
      expectedStatus: "ACTION_REQUIRED",
    });
    expect(recheckFetch.mock.calls[0]?.[0]).toBe(
      `/api/bff/api/admin/domains/${DOMAIN_ID}/check`,
    );
    expect(requestBody(recheckFetch)).toEqual({
      idempotencyKey: "intent_recheck_1",
      expectedStatus: "ACTION_REQUIRED",
    });
  });
});

describe("platform admin onboarding API", () => {
  it("confirms a full command with a stable intent and returns only durable public-safe state", async () => {
    const fetchSpy = successfulFetch({
      receiptId: "123e4567-e89b-42d3-a456-426614174020",
      club,
      originStatus: "SUCCEEDED",
      firstHostKind: "INVITATION_CREATED",
      invitationDelivery: "PENDING",
    });

    await commitPlatformAdminOnboarding({
      previewId: PREVIEW_ID,
      idempotencyKey: "intent_onboarding_1",
      club: {
        name: "샘플 클럽",
        slug: "sample-club",
        tagline: "함께 읽습니다",
        about: "공개 소개",
      },
      firstHost: { email: "contact-fixture", name: "새 호스트" },
      confirmed: true,
    });

    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "/api/bff/api/admin/clubs/onboarding",
    );
    expect(requestBody(fetchSpy)).toMatchObject({
      previewId: PREVIEW_ID,
      idempotencyKey: "intent_onboarding_1",
      confirmed: true,
    });
  });
});
