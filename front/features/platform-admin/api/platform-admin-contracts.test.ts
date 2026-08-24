import { describe, expect, it } from "vitest";
import {
  parsePlatformAdminClubCommandReceipt,
  parsePlatformAdminClubDetail,
  parsePlatformAdminClubList,
  parsePlatformAdminOnboardingPreview,
  parsePlatformAdminOnboardingResult,
} from "./platform-admin-contracts";

const CLUB_ID = "123e4567-e89b-42d3-a456-426614174000";
const DOMAIN_ID = "123e4567-e89b-42d3-a456-426614174001";

const club = {
  clubId: CLUB_ID,
  slug: "sample-club",
  name: "샘플 클럽",
  tagline: "함께 읽습니다",
  about: "공개 소개",
  status: "ACTIVE",
  publicVisibility: "PRIVATE",
  domainCount: 1,
  domainActionRequiredCount: 1,
  notificationFailureCount: 0,
  aiFailureCount: 0,
  firstHostOnboardingState: "ASSIGNED",
  adminRevision: 7,
};

describe("platform-admin club wire contracts", () => {
  it("parses a cursor page with a required revision token", () => {
    expect(
      parsePlatformAdminClubList({ items: [club], nextCursor: "opaque-next" }),
    ).toEqual({
      items: [club],
      nextCursor: "opaque-next",
    });
  });

  it("rejects a list item that omits the revision token", () => {
    const withoutRevision = { ...club } as Partial<typeof club>;
    delete withoutRevision.adminRevision;

    expect(() =>
      parsePlatformAdminClubList({
        items: [withoutRevision],
        nextCursor: null,
      }),
    ).toThrow();
  });

  it("parses an authoritative detail with its own domains", () => {
    const detail = {
      ...club,
      domains: [
        {
          id: DOMAIN_ID,
          clubId: CLUB_ID,
          hostname: "club.example.test",
          kind: "CUSTOM_DOMAIN",
          status: "ACTION_REQUIRED",
          desiredState: "ENABLED",
          manualAction: "CLOUDFLARE_PAGES_CUSTOM_DOMAIN",
          errorCode: null,
          isPrimary: true,
          verifiedAt: null,
          lastCheckedAt: null,
        },
      ],
    };

    expect(parsePlatformAdminClubDetail(detail)).toEqual(detail);
  });

  it("rejects a command receipt with an unknown convergence state", () => {
    expect(() =>
      parsePlatformAdminClubCommandReceipt({
        receiptId: "123e4567-e89b-42d3-a456-426614174010",
        commandType: "club.domain.recheck",
        clubId: CLUB_ID,
        beforeAdminRevision: 7,
        afterAdminRevision: 7,
        outcome: "SUCCEEDED",
        resultCode: "DOMAIN_RECHECKED",
        targetId: DOMAIN_ID,
        convergenceId: "123e4567-e89b-42d3-a456-426614174011",
        convergenceState: "LOST",
      }),
    ).toThrow();
  });
});

describe("platform-admin onboarding public-safe contracts", () => {
  it("parses preview labels and codes without operational contact fields", () => {
    const preview = {
      previewId: "123e4567-e89b-42d3-a456-426614174020",
      expiresAt: "2026-08-24T12:10:00Z",
      clubSlug: "sample-club",
      firstHostKind: "NEW_USER",
      requiredConfirmation: null,
      impactCodes: ["CREATE_CLUB", "INVITE_FIRST_HOST"],
      prerequisiteCodes: ["SLUG_AVAILABLE"],
      requestFingerprintPrefix: "a1b2c3d4",
    };

    expect(parsePlatformAdminOnboardingPreview(preview)).toEqual(preview);
    expect(JSON.stringify(preview)).not.toMatch(
      /email|acceptUrl|hostname|token/i,
    );
  });

  it("parses a durable origin receipt and invitation convergence only", () => {
    const result = {
      receiptId: "123e4567-e89b-42d3-a456-426614174021",
      club,
      originStatus: "SUCCEEDED",
      firstHostKind: "INVITATION_CREATED",
      invitationDelivery: "PENDING",
    };

    expect(parsePlatformAdminOnboardingResult(result)).toEqual(result);
    expect(JSON.stringify(result)).not.toMatch(
      /email|acceptUrl|hostname|token/i,
    );
  });

  it.each([
    [
      "preview",
      () =>
        parsePlatformAdminOnboardingPreview({
          previewId: "123e4567-e89b-42d3-a456-426614174020",
          expiresAt: "2026-08-24T12:10:00Z",
          clubSlug: "sample-club",
          firstHostKind: "NEW_USER",
          requiredConfirmation: null,
          impactCodes: ["CREATE_CLUB"],
          prerequisiteCodes: [],
          requestFingerprintPrefix: "a1b2c3d4",
          acceptUrl: "https://private.example.test/invite",
        }),
    ],
    [
      "result",
      () =>
        parsePlatformAdminOnboardingResult({
          receiptId: "123e4567-e89b-42d3-a456-426614174021",
          club: { ...club, email: "private@example.test" },
          originStatus: "SUCCEEDED",
          firstHostKind: "INVITATION_CREATED",
          invitationDelivery: "PENDING",
          invitationToken: "private-token",
          providerResponse: { raw: true },
        }),
    ],
  ])("rejects extra private fields in the %s contract", (_label, parse) => {
    expect(parse).toThrow();
  });

  it("rejects extra raw fields in command receipts", () => {
    expect(() =>
      parsePlatformAdminClubCommandReceipt({
        receiptId: "123e4567-e89b-42d3-a456-426614174010",
        commandType: "club.domain.recheck",
        clubId: CLUB_ID,
        beforeAdminRevision: 7,
        afterAdminRevision: 7,
        outcome: "SUCCEEDED",
        resultCode: "DOMAIN_RECHECKED",
        targetId: DOMAIN_ID,
        convergenceId: null,
        convergenceState: null,
        providerResponse: "raw fixture",
      }),
    ).toThrow();
  });
});
