import type {
  HostSessionWorkspaceLocation,
  HostSessionWorkspacePanel,
} from "./host-session-workspace-model";

export type { HostSessionWorkspaceLocation, HostSessionWorkspacePanel };

export type HostSessionDraftSource = HostSessionWorkspaceLocation["source"];

const HOST_SESSION_SECTION_PANELS: readonly Exclude<HostSessionWorkspacePanel, "focus">[] = [
  "basic",
  "attendance",
  "records",
  "history",
];

const HOST_SESSION_DRAFT_SOURCES: readonly HostSessionDraftSource[] = ["manual", "ai", "json"];

function defaultLocation(): HostSessionWorkspaceLocation {
  return { panel: "focus", source: "manual" };
}

export function parseHostSessionWorkspaceLocation(search: string): HostSessionWorkspaceLocation {
  const params = new URLSearchParams(search);
  const section = params.get("section");

  if (section !== null) {
    if (section === "overview") {
      return defaultLocation();
    }
    if (!isHostSessionSectionPanel(section)) {
      return defaultLocation();
    }
    const source = params.get("source");
    if (source !== null && !isHostSessionDraftSource(source)) {
      return defaultLocation();
    }
    if (section !== "records") {
      return { panel: section, source: "manual" };
    }

    return { panel: section, source: source ?? "manual" };
  }

  if (params.get("aigen") === "1") {
    return { panel: "records", source: "ai" };
  }
  if (params.get("records") === "json") {
    return { panel: "records", source: "json" };
  }
  return defaultLocation();
}

export function buildHostSessionWorkspaceUrl(
  currentUrl: string | URL,
  next: HostSessionWorkspaceLocation,
): string {
  const url = currentUrl instanceof URL
    ? new URL(currentUrl)
    : new URL(currentUrl, "https://readmates.invalid");
  const params = url.searchParams;

  params.delete("section");
  params.delete("source");
  params.delete("aigen");
  params.delete("records");

  if (next.panel !== "focus") {
    params.set("section", next.panel);
  }
  if (next.panel === "records" && (next.source === "ai" || next.source === "json")) {
    params.set("source", next.source);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function isHostSessionSectionPanel(
  value: string,
): value is Exclude<HostSessionWorkspacePanel, "focus"> {
  return HOST_SESSION_SECTION_PANELS.some((panel) => panel === value);
}

function isHostSessionDraftSource(value: string): value is HostSessionDraftSource {
  return HOST_SESSION_DRAFT_SOURCES.some((source) => source === value);
}
