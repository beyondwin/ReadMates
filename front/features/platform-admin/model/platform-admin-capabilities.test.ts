import { describe, expect, it } from "vitest";
import {
  PLATFORM_ADMIN_CAPABILITIES,
  PlatformAdminCapabilitiesParseError,
  canAdmin,
  parsePlatformAdminCapabilities,
  type PlatformAdminCapabilities,
} from "./platform-admin-capabilities";

const OWNER_CAPABILITIES = [
  "VIEW_TODAY",
  "VIEW_CLUBS",
  "VIEW_CLUB_OPERATIONS",
  "VIEW_SERVICE_HEALTH",
  "VIEW_NOTIFICATION_OPERATIONS",
  "REPLAY_NOTIFICATIONS",
  "VIEW_AI_OPERATIONS",
  "MANAGE_AI_OPERATIONS",
  "VIEW_SUPPORT",
  "MANAGE_SUPPORT_ACCESS",
  "VIEW_AUDIT",
  "VIEW_SENSITIVE_AUDIT",
  "VIEW_ANALYTICS",
  "EXPORT_ANALYTICS",
  "CREATE_CLUB",
  "MANAGE_CLUBS",
  "MANAGE_CLUB_DOMAINS",
  "MANAGE_PLATFORM_ADMINS",
  "EMERGENCY_PUBLIC_TAKEDOWN",
] as const;

const validPayload = {
  schemaVersion: 1,
  role: "OWNER",
  status: "ACTIVE",
  capabilities: [...OWNER_CAPABILITIES],
  generatedAt: "2026-08-22T00:00:00Z",
};

function expectParseRejected(payload: unknown) {
  expect(() => parsePlatformAdminCapabilities(payload)).toThrow(PlatformAdminCapabilitiesParseError);
}

describe("parsePlatformAdminCapabilities", () => {
  it("accepts the server OWNER projection", () => {
    expect(parsePlatformAdminCapabilities(validPayload)).toEqual(validPayload);
  });

  it("keeps the capability union aligned with the server enum", () => {
    expect([...PLATFORM_ADMIN_CAPABILITIES]).toEqual([...OWNER_CAPABILITIES]);
  });

  it("allows additive unknown fields", () => {
    expect(parsePlatformAdminCapabilities({ ...validPayload, extra: "ignored" })).toEqual(validPayload);
  });

  it("rejects a non-object payload", () => {
    expectParseRejected(null);
    expectParseRejected(undefined);
    expectParseRejected("OWNER");
    expectParseRejected(1);
  });

  it("rejects an unknown schema version", () => {
    expectParseRejected({ ...validPayload, schemaVersion: 2 });
    expectParseRejected({ ...validPayload, schemaVersion: "1" });
  });

  it("rejects an unknown role", () => {
    expectParseRejected({ ...validPayload, role: "ADMIN" });
    expectParseRejected({ ...validPayload, role: "owner" });
  });

  it("rejects a non-ACTIVE status", () => {
    expectParseRejected({ ...validPayload, status: "INACTIVE" });
    expectParseRejected({ ...validPayload, status: "active" });
  });

  it("rejects a non-array capabilities payload", () => {
    expectParseRejected({ ...validPayload, capabilities: { VIEW_TODAY: true } });
    expectParseRejected({ ...validPayload, capabilities: "VIEW_TODAY" });
    expectParseRejected({ ...validPayload, capabilities: null });
  });

  it("rejects an unknown capability instead of dropping it", () => {
    expectParseRejected({
      ...validPayload,
      capabilities: ["VIEW_TODAY", "VIEW_SECRET_AUDIT"],
    });
  });

  it("rejects duplicate capabilities instead of uniquing them", () => {
    expectParseRejected({
      ...validPayload,
      capabilities: ["VIEW_TODAY", "VIEW_CLUBS", "VIEW_TODAY"],
    });
  });

  it("rejects an invalid generatedAt timestamp", () => {
    expectParseRejected({ ...validPayload, generatedAt: "not-a-date" });
    expectParseRejected({ ...validPayload, generatedAt: "2026-08-22" });
    expectParseRejected({ ...validPayload, generatedAt: "2026-08-22T00:00:00+00:00" });
    expectParseRejected({ ...validPayload, generatedAt: 1755811200 });
  });
});

describe("canAdmin", () => {
  const ownerProjection: PlatformAdminCapabilities = {
    schemaVersion: 1,
    role: "OWNER",
    status: "ACTIVE",
    capabilities: ["VIEW_TODAY", "VIEW_CLUBS"],
    generatedAt: "2026-08-22T00:00:00Z",
  };

  it("allows an action only when it is present in the returned list", () => {
    expect(canAdmin(ownerProjection, "VIEW_TODAY")).toBe(true);
    expect(canAdmin(ownerProjection, "CREATE_CLUB")).toBe(false);
  });

  it("does not infer an allowlist from role", () => {
    const supportWithCreate: PlatformAdminCapabilities = {
      schemaVersion: 1,
      role: "SUPPORT",
      status: "ACTIVE",
      capabilities: ["VIEW_TODAY", "CREATE_CLUB"],
      generatedAt: "2026-08-22T00:00:00Z",
    };

    expect(canAdmin(ownerProjection, "CREATE_CLUB")).toBe(false);
    expect(canAdmin(supportWithCreate, "CREATE_CLUB")).toBe(true);
    expect(canAdmin(supportWithCreate, "MANAGE_PLATFORM_ADMINS")).toBe(false);
  });
});
