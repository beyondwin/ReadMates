import { z } from "zod";

export const HOST_SESSION_CHANGE_KINDS = ["BASIC_INFO", "ATTENDANCE", "LIFECYCLE"] as const;
export type HostSessionChangeKind = (typeof HOST_SESSION_CHANGE_KINDS)[number];

export const HOST_SESSION_RECOVERY_ACTIONS = [
  "RESTORE_CHANGE",
  "RESTORE_RECORD_DRAFT",
  "REVERSE_LIFECYCLE",
  "NONE",
] as const;
export type HostSessionRecoveryAction = (typeof HOST_SESSION_RECOVERY_ACTIONS)[number];

export const HOST_SESSION_RECOVERY_AVAILABILITIES = ["AVAILABLE", "UNAVAILABLE"] as const;
export type HostSessionRecoveryAvailability = (typeof HOST_SESSION_RECOVERY_AVAILABILITIES)[number];

export type HostSessionChangeReceipt = {
  changeId: string;
  kind: HostSessionChangeKind;
  undoAvailable: boolean;
};

export type HostSessionRestoreRequest = { expectedCurrentHash: string };

export type HostSessionRestoreItem = {
  field: string;
  subjectId?: string | null;
  currentValue: string | null;
  targetValue: string | null;
  sensitive: boolean;
};

export type HostSessionRestorePreview = {
  sessionId: string;
  changeId: string;
  kind: HostSessionChangeKind;
  items: HostSessionRestoreItem[];
  expectedCurrentHash: string;
  canRestore: boolean;
  blockedReason: string | null;
};

export type HostSessionHistoryRecovery = {
  action: HostSessionRecoveryAction;
  availability: HostSessionRecoveryAvailability;
  blockedReason?: string | null;
};

export const HostSessionChangeReceiptSchema = z.object({
  changeId: z.string().min(1),
  kind: z.enum(HOST_SESSION_CHANGE_KINDS),
  undoAvailable: z.boolean(),
}).strict();

export const HostSessionRestoreRequestSchema = z.object({
  expectedCurrentHash: z.string().min(1),
}).strict();

export const HostSessionRestoreItemSchema = z.object({
  field: z.string().min(1),
  subjectId: z.string().nullable().optional(),
  currentValue: z.string().nullable(),
  targetValue: z.string().nullable(),
  sensitive: z.boolean(),
}).strict();

export const HostSessionRestorePreviewSchema = z.object({
  sessionId: z.string().min(1),
  changeId: z.string().min(1),
  kind: z.enum(HOST_SESSION_CHANGE_KINDS),
  items: z.array(HostSessionRestoreItemSchema),
  expectedCurrentHash: z.string().min(1),
  canRestore: z.boolean(),
  blockedReason: z.string().nullable(),
}).strict();

export const HostSessionHistoryRecoverySchema = z.object({
  action: z.enum(HOST_SESSION_RECOVERY_ACTIONS),
  availability: z.enum(HOST_SESSION_RECOVERY_AVAILABILITIES),
  blockedReason: z.string().nullable().optional(),
}).strict();

export const HostAttendanceResponseSchema = z.object({
  sessionId: z.string().min(1),
  count: z.number().int().nonnegative(),
  changeReceipt: HostSessionChangeReceiptSchema.nullable().optional(),
}).strict();

export function parseHostSessionChangeReceipt(value: unknown): HostSessionChangeReceipt {
  return HostSessionChangeReceiptSchema.parse(value);
}

export function parseOptionalHostSessionChangeReceipt(value: unknown): HostSessionChangeReceipt | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  if (!("changeReceipt" in value)) {
    return null;
  }
  const receipt = (value as { changeReceipt: unknown }).changeReceipt;
  if (receipt == null) {
    return null;
  }
  return parseHostSessionChangeReceipt(receipt);
}

export function parseHostSessionRestoreRequest(value: unknown): HostSessionRestoreRequest {
  return HostSessionRestoreRequestSchema.parse(value);
}

export function parseHostSessionRestorePreview(value: unknown): HostSessionRestorePreview {
  return HostSessionRestorePreviewSchema.parse(value);
}

export function parseHostSessionHistoryRecovery(value: unknown): HostSessionHistoryRecovery {
  return HostSessionHistoryRecoverySchema.parse(value);
}
