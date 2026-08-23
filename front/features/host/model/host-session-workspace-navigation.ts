import type {
  HostMeetingLocation,
  HostMeetingTask,
} from "./host-session-workspace-model";

export type { HostMeetingLocation, HostMeetingTask };

const HOST_MEETING_TASKS: readonly HostMeetingTask[] = [
  "overview",
  "responses",
  "attendance",
  "records",
  "notifications",
  "history",
];

const HOST_MEETING_RECORD_SOURCES: readonly HostMeetingLocation["recordSource"][] = [
  "manual",
  "ai",
  "json",
];

function overviewLocation(overviewEditOpen = false): HostMeetingLocation {
  return {
    task: "overview",
    overviewEditOpen,
    recordSource: "manual",
  };
}

export function parseHostMeetingLocation(search: string): HostMeetingLocation {
  const params = new URLSearchParams(search);
  const section = params.get("section");
  const requestedRecordSource = params.get("source");

  if (
    requestedRecordSource !== null
    && !isHostMeetingRecordSource(requestedRecordSource)
  ) {
    return overviewLocation();
  }

  if (section !== null) {
    if (section === "basic") {
      return overviewLocation(true);
    }
    if (!isHostMeetingTask(section)) {
      return overviewLocation();
    }
    if (section !== "records") {
      return {
        task: section,
        overviewEditOpen: false,
        recordSource: "manual",
      };
    }

    return {
      task: "records",
      overviewEditOpen: false,
      recordSource: requestedRecordSource ?? "manual",
    };
  }

  if (params.get("aigen") === "1") {
    return {
      task: "records",
      overviewEditOpen: false,
      recordSource: "ai",
    };
  }
  if (params.get("records") === "json") {
    return {
      task: "records",
      overviewEditOpen: false,
      recordSource: "json",
    };
  }
  return overviewLocation();
}

export function buildHostMeetingUrl(
  currentUrl: string | URL,
  next: HostMeetingLocation,
): string {
  const url = currentUrl instanceof URL
    ? new URL(currentUrl.toString())
    : new URL(currentUrl, "https://readmates.invalid");
  const params = url.searchParams;

  params.delete("section");
  params.delete("source");
  params.delete("aigen");
  params.delete("records");

  if (next.task === "overview" && next.overviewEditOpen) {
    params.set("section", "basic");
  } else if (next.task !== "overview") {
    params.set("section", next.task);
  }
  if (
    next.task === "records"
    && (next.recordSource === "ai" || next.recordSource === "json")
  ) {
    params.set("source", next.recordSource);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function isHostMeetingTask(value: string): value is HostMeetingTask {
  return HOST_MEETING_TASKS.some((task) => task === value);
}

function isHostMeetingRecordSource(
  value: string,
): value is HostMeetingLocation["recordSource"] {
  return HOST_MEETING_RECORD_SOURCES.some((source) => source === value);
}

/**
 * @deprecated Internal Task 5→8 compatibility only. New code uses
 * HostMeetingLocation and HostMeetingTask.
 */
export type HostSessionWorkspacePanel = "focus" | "basic" | "attendance" | "records" | "history";

/** @deprecated Internal Task 5→8 compatibility only. */
export type HostSessionWorkspaceLocation = {
  panel: HostSessionWorkspacePanel;
  source: HostMeetingLocation["recordSource"];
};

/** @deprecated Internal Task 5→8 compatibility only. */
export type HostSessionDraftSource = HostSessionWorkspaceLocation["source"];

/** @deprecated Internal Task 5→8 compatibility only. */
export function parseHostSessionWorkspaceLocation(search: string): HostSessionWorkspaceLocation {
  const location = parseHostMeetingLocation(search);
  if (location.task === "overview") {
    return {
      panel: location.overviewEditOpen ? "basic" : "focus",
      source: "manual",
    };
  }
  if (
    location.task === "attendance"
    || location.task === "records"
    || location.task === "history"
  ) {
    return {
      panel: location.task,
      source: location.task === "records" ? location.recordSource : "manual",
    };
  }
  return { panel: "focus", source: "manual" };
}

/** @deprecated Internal Task 5→8 compatibility only. */
export function buildHostSessionWorkspaceUrl(
  currentUrl: string | URL,
  next: HostSessionWorkspaceLocation,
): string {
  return buildHostMeetingUrl(currentUrl, hostMeetingLocationFromCompatibility(next));
}

function hostMeetingLocationFromCompatibility(
  location: HostSessionWorkspaceLocation,
): HostMeetingLocation {
  if (location.panel === "focus") {
    return overviewLocation();
  }
  if (location.panel === "basic") {
    return overviewLocation(true);
  }
  return {
    task: location.panel,
    overviewEditOpen: false,
    recordSource: location.panel === "records" ? location.source : "manual",
  };
}
