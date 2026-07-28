export type HostSessionEditorSection =
  | "overview"
  | "basic"
  | "attendance"
  | "records"
  | "history";

export type HostSessionDraftSource = "manual" | "ai" | "json";

export type HostSessionEditorLocation = {
  section: HostSessionEditorSection;
  source: HostSessionDraftSource;
};

const HOST_SESSION_EDITOR_SECTION_ORDER: readonly HostSessionEditorSection[] = [
  "overview",
  "basic",
  "attendance",
  "records",
  "history",
];

const HOST_SESSION_DRAFT_SOURCES: readonly HostSessionDraftSource[] = ["manual", "ai", "json"];

function defaultLocation(): HostSessionEditorLocation {
  return { section: "overview", source: "manual" };
}

export function parseHostSessionEditorLocation(search: string): HostSessionEditorLocation {
  const params = new URLSearchParams(search);
  const section = params.get("section");

  if (section !== null) {
    if (!isHostSessionEditorSection(section)) {
      return defaultLocation();
    }
    const source = params.get("source");
    if (source !== null && !isHostSessionDraftSource(source)) {
      return defaultLocation();
    }
    if (section !== "records") {
      return { section, source: "manual" };
    }

    return { section, source: source ?? "manual" };
  }

  if (params.get("aigen") === "1") {
    return { section: "records", source: "ai" };
  }
  if (params.get("records") === "json") {
    return { section: "records", source: "json" };
  }
  return defaultLocation();
}

export function buildHostSessionEditorUrl(
  currentUrl: string | URL,
  next: HostSessionEditorLocation,
): string {
  const url = currentUrl instanceof URL
    ? new URL(currentUrl)
    : new URL(currentUrl, "https://readmates.invalid");
  const params = url.searchParams;

  params.delete("section");
  params.delete("source");
  params.delete("aigen");
  params.delete("records");

  if (next.section !== "overview") {
    params.set("section", next.section);
  }
  if (next.section === "records" && (next.source === "ai" || next.source === "json")) {
    params.set("source", next.source);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function isHostSessionEditorSection(value: string): value is HostSessionEditorSection {
  return HOST_SESSION_EDITOR_SECTION_ORDER.some((section) => section === value);
}

function isHostSessionDraftSource(value: string): value is HostSessionDraftSource {
  return HOST_SESSION_DRAFT_SOURCES.some((source) => source === value);
}
