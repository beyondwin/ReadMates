import {
  BUILTIN_SCHEDULE_DEFAULTS,
  type HostSessionScheduleDefaults,
} from "./host-schedule-defaults-state";
import type { SessionAccessScope } from "./session-exposure-model";

export { BUILTIN_SCHEDULE_DEFAULTS };
export type { HostSessionScheduleDefaults };

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
  startTime: (defaults: HostSessionScheduleDefaults) => defaults.automatic.startTime,
  endTime: (defaults: HostSessionScheduleDefaults) => defaults.automatic.endTime,
  locationLabel: (defaults: HostSessionScheduleDefaults) => defaults.automatic.locationLabel,
  date: (defaults: HostSessionScheduleDefaults) => defaults.automatic.suggestedDate,
  accessScope: (defaults: HostSessionScheduleDefaults) => defaults.automatic.accessScope,
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

export function resolvedScheduleDefaults(
  data: HostSessionScheduleDefaults | null | undefined,
): HostSessionScheduleDefaults {
  return data ?? BUILTIN_SCHEDULE_DEFAULTS;
}
