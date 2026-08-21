import { describe, expect, it } from "vitest";
import {
  buildHostSessionWorkspaceUrl,
  parseHostSessionWorkspaceLocation,
  type HostSessionWorkspaceLocation,
} from "./host-session-workspace-navigation";

describe("host session workspace navigation", () => {
  it("returns an independent default location for each parse", () => {
    const first = parseHostSessionWorkspaceLocation("");
    first.panel = "records";
    first.source = "json";

    expect(parseHostSessionWorkspaceLocation("")).toEqual({
      panel: "focus",
      source: "manual",
    });
  });

  it.each([
    ["empty search", "", { panel: "focus", source: "manual" }],
    ["overview section", "?section=overview", { panel: "focus", source: "manual" }],
    ["basic section", "?section=basic", { panel: "basic", source: "manual" }],
    ["attendance section", "?section=attendance", { panel: "attendance", source: "manual" }],
    ["records manual", "?section=records", { panel: "records", source: "manual" }],
    ["records AI", "?section=records&source=ai", { panel: "records", source: "ai" }],
    ["records JSON", "?section=records&source=json", { panel: "records", source: "json" }],
    ["history section", "?section=history", { panel: "history", source: "manual" }],
    ["invalid section", "?section=unknown", { panel: "focus", source: "manual" }],
    ["invalid records source", "?section=records&source=unknown", { panel: "focus", source: "manual" }],
    ["invalid non-record source", "?section=basic&source=unknown", { panel: "focus", source: "manual" }],
    ["source outside records", "?section=basic&source=ai", { panel: "basic", source: "manual" }],
    ["legacy AI", "?aigen=1", { panel: "records", source: "ai" }],
    ["legacy JSON", "?records=json", { panel: "records", source: "json" }],
    [
      "canonical section and source over legacy values",
      "?section=records&source=json&aigen=1",
      { panel: "records", source: "json" },
    ],
    [
      "canonical section over legacy values",
      "?section=basic&aigen=1&records=json",
      { panel: "basic", source: "manual" },
    ],
  ] satisfies Array<[string, string, HostSessionWorkspaceLocation]>)(
    "parses %s",
    (_name, search, expected) => {
      expect(parseHostSessionWorkspaceLocation(search)).toEqual(expected);
    },
  );

  it("parses records JSON deep link from the plan example", () => {
    expect(parseHostSessionWorkspaceLocation("?section=records&source=json")).toEqual({
      panel: "records",
      source: "json",
    });
  });

  it.each([
    [
      "preserves unrelated parameters and hash while writing records AI",
      "https://readmates.test/app/host/sessions/session-1?returnTo=%2Fapp%2Fhost&from=dashboard#audit",
      { panel: "records", source: "ai" },
      "/app/host/sessions/session-1?returnTo=%2Fapp%2Fhost&from=dashboard&section=records&source=ai#audit",
    ],
    [
      "omits section for focus the same way overview omitted it",
      "https://readmates.test/app/host/sessions/session-1?returnTo=%2Fapp%2Fhost&section=records&source=ai&aigen=1&records=json#audit",
      { panel: "focus", source: "manual" },
      "/app/host/sessions/session-1?returnTo=%2Fapp%2Fhost#audit",
    ],
    [
      "writes legacy section keys for history bookmarks",
      "/app/host/sessions/s-1?from=home#record",
      { panel: "history", source: "manual" },
      "/app/host/sessions/s-1?from=home&section=history#record",
    ],
    [
      "removes source for records manual",
      new URL("https://readmates.test/app/host/sessions/session-1?from=closing&section=records&source=ai#audit"),
      { panel: "records", source: "manual" },
      "/app/host/sessions/session-1?from=closing&section=records#audit",
    ],
    [
      "does not retain a source outside records",
      "https://readmates.test/app/host/sessions/session-1?from=dashboard&aigen=1",
      { panel: "basic", source: "ai" },
      "/app/host/sessions/session-1?from=dashboard&section=basic",
    ],
  ] satisfies Array<[string, string | URL, HostSessionWorkspaceLocation, string]>)(
    "%s",
    (_name, currentUrl, next, expected) => {
      expect(buildHostSessionWorkspaceUrl(currentUrl, next)).toBe(expected);
    },
  );
});
