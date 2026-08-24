import type { PlatformAdminRole } from "@/features/platform-admin/model/platform-admin-domain-types";

export const PLATFORM_ADMIN_CAPABILITIES = [
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

export type PlatformAdminCapability = (typeof PLATFORM_ADMIN_CAPABILITIES)[number];

export type PlatformAdminCapabilities = {
  schemaVersion: 1;
  role: PlatformAdminRole;
  status: "ACTIVE";
  capabilities: PlatformAdminCapability[];
  generatedAt: string;
};

const CAPABILITY_SET: ReadonlySet<string> = new Set(PLATFORM_ADMIN_CAPABILITIES);
const ROLE_SET: ReadonlySet<string> = new Set(["OWNER", "OPERATOR", "SUPPORT"]);
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

export class PlatformAdminCapabilitiesParseError extends Error {
  readonly code = "PLATFORM_ADMIN_CAPABILITIES_INVALID" as const;

  constructor(reason: string) {
    super(`Invalid platform-admin capabilities: ${reason}`);
    this.name = "PlatformAdminCapabilitiesParseError";
  }
}

export function parsePlatformAdminCapabilities(payload: unknown): PlatformAdminCapabilities {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new PlatformAdminCapabilitiesParseError("payload must be an object");
  }

  const record = payload as Record<string, unknown>;
  if (record.schemaVersion !== 1) {
    throw new PlatformAdminCapabilitiesParseError("unknown schemaVersion");
  }
  if (typeof record.role !== "string" || !ROLE_SET.has(record.role)) {
    throw new PlatformAdminCapabilitiesParseError("unknown role");
  }
  if (record.status !== "ACTIVE") {
    throw new PlatformAdminCapabilitiesParseError("unknown status");
  }
  if (!Array.isArray(record.capabilities)) {
    throw new PlatformAdminCapabilitiesParseError("capabilities must be an array");
  }

  const seen = new Set<string>();
  const capabilities: PlatformAdminCapability[] = [];
  for (const item of record.capabilities) {
    if (typeof item !== "string" || !CAPABILITY_SET.has(item)) {
      throw new PlatformAdminCapabilitiesParseError("unknown capability");
    }
    if (seen.has(item)) {
      throw new PlatformAdminCapabilitiesParseError("duplicate capability");
    }
    seen.add(item);
    capabilities.push(item as PlatformAdminCapability);
  }

  if (typeof record.generatedAt !== "string" || !isUtcInstant(record.generatedAt)) {
    throw new PlatformAdminCapabilitiesParseError("invalid generatedAt");
  }

  return {
    schemaVersion: 1,
    role: record.role as PlatformAdminRole,
    status: "ACTIVE",
    capabilities,
    generatedAt: record.generatedAt,
  };
}

export function canAdmin(
  capabilities: PlatformAdminCapabilities,
  action: PlatformAdminCapability,
): boolean {
  return capabilities.capabilities.includes(action);
}

function isUtcInstant(value: string): boolean {
  if (!UTC_INSTANT.test(value)) {
    return false;
  }
  return Number.isFinite(Date.parse(value));
}
