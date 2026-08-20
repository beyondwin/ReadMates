import type { HostSessionScheduleDefaults } from "@/features/host/api/host-contracts";
import type { SessionAccessScope } from "./session-exposure-model";

export type { HostSessionScheduleDefaults };

export const BUILTIN_SCHEDULE_DEFAULTS: HostSessionScheduleDefaults = {
  startTime: "20:00",
  endTime: "22:00",
  locationLabel: "온라인",
  meetingUrl: null,
  meetingPasscode: null,
  accessScope: "HOST_ONLY",
  suggestedDate: null,
  questionDeadlineOffsetDays: 1,
  hints: [],
};

export type HostScheduleFormValues = {
  bookTitle: string;
  bookAuthor: string;
  date: string;
  startTime: string;
  endTime: string;
  locationLabel: string;
  meetingUrl: string;
  meetingPasscode: string;
  accessScope: SessionAccessScope;
};

const mappedFields = {
  startTime: (defaults: HostSessionScheduleDefaults) => defaults.startTime,
  endTime: (defaults: HostSessionScheduleDefaults) => defaults.endTime,
  locationLabel: (defaults: HostSessionScheduleDefaults) => defaults.locationLabel,
  date: (defaults: HostSessionScheduleDefaults) => defaults.suggestedDate,
  meetingUrl: (defaults: HostSessionScheduleDefaults) => defaults.meetingUrl,
  meetingPasscode: (defaults: HostSessionScheduleDefaults) => defaults.meetingPasscode,
  accessScope: (defaults: HostSessionScheduleDefaults) => defaults.accessScope,
} as const;

function isEmptyField(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

export function applyScheduleDefaults<T extends object>(
  form: T,
  defaults: HostSessionScheduleDefaults,
): T {
  const next = { ...form } as T & Record<string, unknown>;
  for (const key of Object.keys(mappedFields) as Array<keyof typeof mappedFields>) {
    if (!Object.prototype.hasOwnProperty.call(form, key)) {
      continue;
    }
    if (!isEmptyField(next[key])) {
      continue;
    }
    const incoming = mappedFields[key](defaults);
    if (incoming == null || incoming === "") {
      continue;
    }
    next[key] = incoming;
  }
  return next;
}

export function scheduleTimeHint(defaults: Pick<HostSessionScheduleDefaults, "hints">): string | null {
  return defaults.hints[0] ?? null;
}
