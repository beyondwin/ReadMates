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
  scheduleRevision: 7,
  scheduleSeenAvailability: "AVAILABLE" as const,
  scheduleSeenSummary: {
    currentCount: 1,
    staleCount: 0,
    unseenCount: 0,
    eligibleCount: 1,
  },
  versions: {
    sessionRevision: 3,
    scheduleRevision: 7,
    exposureRevision: 2,
    participantSetRevision: 4,
    recordDraftRevision: null,
    liveRecordRevision: null,
    publicationRevision: 1,
  },
  attendanceSnapshotId: "attendance-snapshot-4",
  attendees: [
    {
      membershipId: "m-1",
      avatarKey: "banana-green-book",
      displayName: "Alice",
      accountName: "alice",
      rsvpStatus: "GOING" as const,
      attendanceStatus: "ATTENDED" as const,
      attendanceRevision: 6,
      seenScheduleRevision: 7,
      scheduleSeenAt: "2026-08-29T00:00:00Z",
      scheduleSeenState: "CURRENT" as const,
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

const validHostSessionListItem = {
  sessionId: "session-1",
  sessionNumber: 1,
  title: "함께 읽기",
  bookTitle: "The Book",
  bookAuthor: "Author",
  bookImageUrl: null,
  date: "2026-08-30",
  startTime: "19:00",
  endTime: "21:00",
  locationLabel: "온라인",
  state: "OPEN" as const,
  visibility: "MEMBER" as const,
  accessScope: "GUEST_READABLE" as const,
  siteVisibility: "HIDDEN" as const,
  recordStatus: "NOT_STARTED" as const,
  needsAttention: false,
  hasDraft: false,
  liveRevision: 1,
  draftRevision: null,
  lastModifiedAt: null,
};

// ---- DEV mode tests -----------------------------------------------------------

describe("host-contract zod validators (DEV mode)", () => {
  it("parses a non-baseline schedule revision across host detail projection receipt and reconciliation", async () => {
    const {
      HostMutationReceiptSchema,
      HostMutationReconciliationSchema,
      HostProjectionSnapshotSchema,
      HostSessionDetailResponseSchema,
      HostVersionVectorSchema,
    } = await import("@/features/host/api/host-contracts");
    const versions = {
      sessionRevision: 3,
      scheduleRevision: 7,
      exposureRevision: 2,
      participantSetRevision: 4,
      recordDraftRevision: null,
      liveRecordRevision: null,
      publicationRevision: 1,
    };
    const projection = {
      snapshotId: "session-1:3:7:2:4:none:none:1",
      sessionId: "session-1",
      sessionNumber: 1,
      title: "Session 1",
      bookTitle: "The Book",
      bookAuthor: "Author",
      date: "2024-01-01",
      startTime: "19:00",
      endTime: "21:00",
      locationLabel: "Seoul",
      state: "OPEN" as const,
      versions,
      accessScope: "HOST_ONLY" as const,
      siteVisibility: "HIDDEN" as const,
      visibility: "HOST_ONLY" as const,
    };
    const receipt = {
      receiptId: "receipt-1",
      operation: "SESSION_BASIC_SAVE" as const,
      resourceId: "session-1",
      resultingVersions: versions,
      notificationDecision: "NOT_SENT" as const,
      projection,
    };
    const reconciliation = {
      status: "COMMITTED" as const,
      receipt,
      current: projection,
      attendanceVersions: null,
      attendanceSnapshotId: null,
    };

    expect(HostVersionVectorSchema.parse(versions).scheduleRevision).toBe(7);
    expect(HostSessionDetailResponseSchema.parse(validHostSessionDetail).scheduleRevision).toBe(7);
    expect(HostProjectionSnapshotSchema.parse(projection).versions.scheduleRevision).toBe(7);
    expect(HostMutationReceiptSchema.parse(receipt).resultingVersions.scheduleRevision).toBe(7);
    expect(HostMutationReconciliationSchema.parse(reconciliation).current?.versions.scheduleRevision).toBe(7);
    expect(HostVersionVectorSchema.safeParse({ ...versions, scheduleRevision: 0 }).success).toBe(false);
    const { scheduleRevision: _scheduleRevision, ...withoutScheduleRevision } = versions;
    expect(HostVersionVectorSchema.safeParse(withoutScheduleRevision).success).toBe(false);
  });

  it("enforces strict action-specific v3 expected revision schemas", async () => {
    const {
      CorrectionPublicationVersionVectorSchema,
      ExpectedAttendanceVersionsSchema,
      ExpectedCloseRevisionsSchema,
      ExpectedCreateHostSessionSchema,
      ExpectedExposureRevisionSchema,
      ExpectedPublicationRevisionSchema,
      ExpectedSessionRevisionSchema,
      PublicationVersionVectorSchema,
    } = await import("@/features/host/api/host-contracts");
    const cases = [
      {
        schema: ExpectedCreateHostSessionSchema,
        valid: {},
        missing: null,
        extra: { sessionRevision: 0 },
        wrong: { exposureRevision: 0 },
      },
      {
        schema: ExpectedSessionRevisionSchema,
        valid: { sessionRevision: 3 },
        missing: {},
        extra: { sessionRevision: 3, publicationRevision: 1 },
        wrong: { exposureRevision: 3 },
      },
      {
        schema: ExpectedAttendanceVersionsSchema,
        valid: { rows: [{ membershipId: "membership-1", attendanceRevision: 2 }] },
        missing: { rows: [{ membershipId: "membership-1" }] },
        extra: { rows: [{ membershipId: "membership-1", attendanceRevision: 2 }], sessionRevision: 3 },
        wrong: { participantSetRevision: 3 },
      },
      {
        schema: ExpectedCloseRevisionsSchema,
        valid: { sessionRevision: 3, participantSetRevision: 5, attendanceSnapshotId: "snapshot-5" },
        missing: { sessionRevision: 3, participantSetRevision: 5 },
        extra: {
          sessionRevision: 3,
          participantSetRevision: 5,
          attendanceSnapshotId: "snapshot-5",
          publicationRevision: 1,
        },
        wrong: { sessionRevision: 3, exposureRevision: 5, attendanceSnapshotId: "snapshot-5" },
      },
      {
        schema: ExpectedExposureRevisionSchema,
        valid: { exposureRevision: 4 },
        missing: {},
        extra: { exposureRevision: 4, publicationRevision: 1 },
        wrong: { sessionRevision: 4 },
      },
      {
        schema: ExpectedPublicationRevisionSchema,
        valid: { publicationRevision: 4 },
        missing: {},
        extra: { publicationRevision: 4, sessionRevision: 1 },
        wrong: { exposureRevision: 4 },
      },
      {
        schema: PublicationVersionVectorSchema,
        valid: { sessionRevision: 3, liveRecordRevision: 2, exposureRevision: 4, publicationRevision: 5 },
        missing: { sessionRevision: 3, liveRecordRevision: 2, exposureRevision: 4 },
        extra: {
          sessionRevision: 3,
          liveRecordRevision: 2,
          exposureRevision: 4,
          publicationRevision: 5,
          participantSetRevision: 1,
        },
        wrong: { sessionRevision: 3, recordDraftRevision: 2, exposureRevision: 4, publicationRevision: 5 },
      },
      {
        schema: CorrectionPublicationVersionVectorSchema,
        valid: {
          sessionRevision: 3,
          recordDraftRevision: 4,
          liveRecordRevision: 2,
          exposureRevision: 4,
          publicationRevision: 5,
        },
        missing: {
          sessionRevision: 3,
          liveRecordRevision: 2,
          exposureRevision: 4,
          publicationRevision: 5,
        },
        extra: {
          sessionRevision: 3,
          recordDraftRevision: 4,
          liveRecordRevision: 2,
          exposureRevision: 4,
          publicationRevision: 5,
          participantSetRevision: 1,
        },
        wrong: {
          sessionRevision: 3,
          recordDraftRevision: 4,
          liveRecordRevision: 2,
          participantSetRevision: 4,
          publicationRevision: 5,
        },
      },
    ];

    for (const { schema, valid, missing, extra, wrong } of cases) {
      expect(schema.safeParse(valid).success).toBe(true);
      expect(schema.safeParse(missing).success).toBe(false);
      expect(schema.safeParse(extra).success).toBe(false);
      expect(schema.safeParse(wrong).success).toBe(false);
    }
  });

  it("parses an exact receipt with resource identity, projection, and version vector", async () => {
    const { HostMutationReceiptSchema } = await import("@/features/host/api/host-contracts");
    const versions = {
      sessionRevision: 3,
      scheduleRevision: 9,
      exposureRevision: 4,
      participantSetRevision: 5,
      recordDraftRevision: 6,
      liveRecordRevision: 7,
      publicationRevision: 8,
    };
    const receipt = {
      receiptId: "receipt-1",
      operation: "SESSION_BASIC_SAVE",
      resourceId: "session-1",
      resultingVersions: versions,
      notificationDecision: "NOT_SENT",
      projection: {
        snapshotId: "snapshot-1",
        sessionId: "session-1",
        sessionNumber: 1,
        title: "함께 읽기",
        bookTitle: "The Book",
        bookAuthor: "Author",
        date: "2026-08-30",
        startTime: "19:00",
        endTime: "21:00",
        locationLabel: "온라인",
        state: "OPEN",
        versions,
        accessScope: "HOST_ONLY",
        siteVisibility: "HIDDEN",
        visibility: "HOST_ONLY",
      },
    };

    expect(HostMutationReceiptSchema.parse(receipt)).toEqual(receipt);
    expect(HostMutationReceiptSchema.safeParse({ ...receipt, resourceId: undefined }).success).toBe(false);
    expect(HostMutationReceiptSchema.safeParse({ ...receipt, resourceId: "session-2", extra: true }).success).toBe(false);
  });

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

  it("accepts only the lifecycle states owned by the requested host list mode", async () => {
    const { parseHostSessionListPage } = await import("@/features/host/api/host-contracts");
    const page = {
      items: [validHostSessionListItem],
      nextCursor: "opaque",
      summary: { needsAttentionCount: 0, incompletePublishedCount: 0, draftCount: 0 },
    };

    expect(parseHostSessionListPage(page, "meeting")).toMatchObject({
      items: [{ state: "OPEN" }],
    });
    expect(() => parseHostSessionListPage(page, "record")).toThrow();
    expect(() => parseHostSessionListPage({
      ...page,
      items: [{ ...validHostSessionListItem, state: "PUBLISHED" }],
    }, "meeting")).toThrow();
  });

  it("rejects provider detail from the public convergence browser contract", async () => {
    const { HostPublicConvergenceViewSchema } = await import("@/features/host/api/host-contracts");
    expect(() => HostPublicConvergenceViewSchema.parse({
      convergenceId: "10000000-0000-4000-8000-000000000001",
      originResult: "APPLIED",
      committedGeneration: 7,
      lastAttemptAt: "2026-08-26T04:30:00Z",
      status: "FAILED",
      retryable: true,
      providerError: "upstream response body",
    })).toThrow();
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
