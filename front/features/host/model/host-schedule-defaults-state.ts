import type { SessionAccessScope } from "./session-exposure-model";

export type HostSessionAutomaticScheduleDefaults = {
  startTime: string;
  endTime: string;
  locationLabel: string;
  accessScope: SessionAccessScope;
  suggestedDate: string | null;
  questionDeadlineOffsetDays: number;
};

export type PreviousOnlineMeeting = {
  meetingUrl: string;
  meetingPasscode: string | null;
};

export type HostSessionScheduleDefaults = {
  automatic: HostSessionAutomaticScheduleDefaults;
  previousOnlineMeeting: PreviousOnlineMeeting | null;
  hints: string[];
};

export const BUILTIN_SCHEDULE_DEFAULTS: HostSessionScheduleDefaults = {
  automatic: {
    startTime: "20:00",
    endTime: "22:00",
    locationLabel: "온라인",
    accessScope: "HOST_ONLY",
    suggestedDate: null,
    questionDeadlineOffsetDays: 1,
  },
  previousOnlineMeeting: null,
  hints: [],
};

export type HostSessionScheduleDefaultsWire = {
  automatic?: HostSessionAutomaticScheduleDefaults;
  previousOnlineMeeting?: PreviousOnlineMeeting | null;
  hints?: string[];
  startTime?: string;
  endTime?: string;
  locationLabel?: string;
  meetingUrl?: string | null;
  meetingPasscode?: string | null;
  accessScope?: SessionAccessScope;
  suggestedDate?: string | null;
  questionDeadlineOffsetDays?: number;
};

function automaticFromLegacy(wire: HostSessionScheduleDefaultsWire): HostSessionAutomaticScheduleDefaults {
  return {
    startTime: wire.startTime ?? BUILTIN_SCHEDULE_DEFAULTS.automatic.startTime,
    endTime: wire.endTime ?? BUILTIN_SCHEDULE_DEFAULTS.automatic.endTime,
    locationLabel: wire.locationLabel ?? BUILTIN_SCHEDULE_DEFAULTS.automatic.locationLabel,
    accessScope: wire.accessScope ?? BUILTIN_SCHEDULE_DEFAULTS.automatic.accessScope,
    suggestedDate: wire.suggestedDate ?? null,
    questionDeadlineOffsetDays: wire.questionDeadlineOffsetDays ?? 1,
  };
}

function previousOnlineFromLegacy(wire: HostSessionScheduleDefaultsWire): PreviousOnlineMeeting | null {
  return wire.meetingUrl
    ? { meetingUrl: wire.meetingUrl, meetingPasscode: wire.meetingPasscode ?? null }
    : null;
}

export function normalizeHostSessionScheduleDefaults(wire: HostSessionScheduleDefaultsWire): HostSessionScheduleDefaults {
  return {
    automatic: wire.automatic ?? automaticFromLegacy(wire),
    previousOnlineMeeting: wire.previousOnlineMeeting ?? previousOnlineFromLegacy(wire),
    hints: wire.hints ?? [],
  };
}
