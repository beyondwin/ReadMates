/**
 * Tests for host-side Zod runtime validators.
 *
 * DEV tests: schemas parse valid payloads and throw on missing required fields.
 * Production tests: parsers return the value as-is without throwing, even for invalid payloads.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---- Fixtures -----------------------------------------------------------------

const validHostSessionDetail = {
  sessionId: "abc-123",
  sessionNumber: 1,
  title: "Session 1",
  bookTitle: "The Book",
  bookAuthor: "Author",
  bookLink: null,
  bookImageUrl: null,
  locationLabel: "Seoul",
  meetingUrl: null,
  meetingPasscode: null,
  date: "2024-01-01",
  startTime: "19:00",
  endTime: "21:00",
  questionDeadlineAt: "2024-01-01T18:00:00Z",
  visibility: "MEMBER" as const,
  publication: null,
  state: "OPEN" as const,
  attendees: [
    {
      membershipId: "m-1",
      displayName: "Alice",
      accountName: "alice",
      rsvpStatus: "GOING" as const,
      attendanceStatus: "ATTENDED" as const,
    },
  ],
  feedbackDocument: { uploaded: false, fileName: null, uploadedAt: null },
};

const validDeliveryList = {
  items: [
    {
      id: "d-1",
      eventId: "e-1",
      channel: "EMAIL" as const,
      status: "SENT" as const,
      recipientEmail: "user@example.com",
      attemptCount: 1,
      updatedAt: "2024-01-01T00:00:00Z",
    },
  ],
  nextCursor: null,
};

const validInvitationListPage = {
  items: [
    {
      invitationId: "inv-1",
      email: "user@example.com",
      name: "User",
      role: "MEMBER" as const,
      status: "PENDING" as const,
      effectiveStatus: "PENDING" as const,
      expiresAt: "2024-02-01T00:00:00Z",
      acceptedAt: null,
      createdAt: "2024-01-01T00:00:00Z",
      applyToCurrentSession: true,
      canRevoke: true,
      canReissue: false,
    },
  ],
  nextCursor: null,
};

// ---- DEV mode tests -----------------------------------------------------------

describe("host-contract zod validators (DEV mode)", () => {
  it("parses valid HostSessionDetailResponse", async () => {
    const { parseHostSessionDetailResponse } = await import("@/features/host/api/host-contracts");
    const result = parseHostSessionDetailResponse(validHostSessionDetail);
    expect(result).toMatchObject({ sessionId: "abc-123", state: "OPEN" });
  });

  it("throws when HostSessionDetailResponse is missing required field", async () => {
    const { parseHostSessionDetailResponse } = await import("@/features/host/api/host-contracts");
    const invalid = { ...validHostSessionDetail, sessionId: undefined };
    expect(() => parseHostSessionDetailResponse(invalid)).toThrow();
  });

  it("parses valid HostNotificationDeliveryListResponse", async () => {
    const { parseHostNotificationDeliveryListResponse } = await import("@/features/host/api/host-contracts");
    const result = parseHostNotificationDeliveryListResponse(validDeliveryList);
    expect(result).toMatchObject({ items: [{ id: "d-1" }] });
  });

  it("throws when HostNotificationDeliveryListResponse is missing required field", async () => {
    const { parseHostNotificationDeliveryListResponse } = await import("@/features/host/api/host-contracts");
    const invalid = { items: [{ id: "d-1" /* missing eventId, channel, etc */ }], nextCursor: null };
    expect(() => parseHostNotificationDeliveryListResponse(invalid)).toThrow();
  });

  it("parses valid HostInvitationListPage", async () => {
    const { parseHostInvitationListPage } = await import("@/features/host/api/host-contracts");
    const result = parseHostInvitationListPage(validInvitationListPage);
    expect(result).toMatchObject({ items: [{ invitationId: "inv-1" }] });
  });

  it("throws when HostInvitationListPage is missing required field", async () => {
    const { parseHostInvitationListPage } = await import("@/features/host/api/host-contracts");
    const invalid = { items: [{ invitationId: "inv-1" /* missing email, name, role, etc */ }], nextCursor: null };
    expect(() => parseHostInvitationListPage(invalid)).toThrow();
  });

  it("accepts nextCursor as undefined (omitted by backend)", async () => {
    const { parseHostNotificationDeliveryListResponse } = await import("@/features/host/api/host-contracts");
    const withoutCursor = { items: validDeliveryList.items };
    // Should not throw — nextCursor is nullable().optional()
    const result = parseHostNotificationDeliveryListResponse(withoutCursor);
    expect(result).toBeDefined();
  });
});

// ---- Production mode tests ---------------------------------------------------

describe("host-contract zod validators (production mode)", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", false);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not throw for invalid HostSessionDetailResponse in production mode", async () => {
    const { parseHostSessionDetailResponse } = await import("@/features/host/api/host-contracts");
    const invalid = { totally: "wrong" };
    expect(() => parseHostSessionDetailResponse(invalid)).not.toThrow();
  });

  it("does not throw for invalid HostNotificationDeliveryListResponse in production mode", async () => {
    const { parseHostNotificationDeliveryListResponse } = await import("@/features/host/api/host-contracts");
    const invalid = { totally: "wrong" };
    expect(() => parseHostNotificationDeliveryListResponse(invalid)).not.toThrow();
  });

  it("does not throw for invalid HostInvitationListPage in production mode", async () => {
    const { parseHostInvitationListPage } = await import("@/features/host/api/host-contracts");
    const invalid = { totally: "wrong" };
    expect(() => parseHostInvitationListPage(invalid)).not.toThrow();
  });
});
