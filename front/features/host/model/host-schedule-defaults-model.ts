import {
  BUILTIN_SCHEDULE_DEFAULTS,
  type HostSessionScheduleDefaults,
  type HostSessionAutomaticScheduleDefaults,
  type PreviousOnlineMeeting,
} from "./host-schedule-defaults-state";
import type { SessionAccessScope } from "./session-exposure-model";

export { BUILTIN_SCHEDULE_DEFAULTS };
export type { HostSessionScheduleDefaults, PreviousOnlineMeeting };

export const SCHEDULE_DEFAULTS_LOAD_WARNING = "기본 일정을 불러오지 못해 기본값을 사용합니다";

export type HostScheduleDefaultsLoadState = {
  defaults: HostSessionScheduleDefaults;
  status: "loading" | "ready" | "warning";
  warning: string | null;
  retry: () => void;
};

export type ScheduleField = "date" | "startTime" | "endTime" | "locationLabel" | "accessScope";
export type TouchedScheduleFields = ReadonlySet<ScheduleField>;

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

const automaticFieldEntries = [
  ["date", (value: HostSessionAutomaticScheduleDefaults) => value.suggestedDate ?? ""],
  ["startTime", (value: HostSessionAutomaticScheduleDefaults) => value.startTime],
  ["endTime", (value: HostSessionAutomaticScheduleDefaults) => value.endTime],
  ["locationLabel", (value: HostSessionAutomaticScheduleDefaults) => value.locationLabel],
  ["accessScope", (value: HostSessionAutomaticScheduleDefaults) => value.accessScope],
] as const;

export function mergeUntouchedScheduleDefaults<T extends HostScheduleFormValues>(
  form: T,
  defaults: HostSessionScheduleDefaults,
  touched: TouchedScheduleFields,
): T {
  return automaticFieldEntries.reduce(
    (next, [field, read]) => touched.has(field) ? next : { ...next, [field]: read(defaults.automatic) },
    form,
  );
}

export function scheduleTimeHint(defaults: Pick<HostSessionScheduleDefaults, "hints">): string | null {
  return defaults.hints[0] ?? null;
}

export function resolvedScheduleDefaults(
  data: HostSessionScheduleDefaults | null | undefined,
): HostSessionScheduleDefaults {
  return data ?? BUILTIN_SCHEDULE_DEFAULTS;
}
