import { describe, expect, it } from "vitest";
import {
  buildHostSessionEditorUrl,
  parseHostSessionEditorLocation,
  type HostSessionEditorLocation,
} from "./host-session-editor-navigation";

describe("host session editor navigation", () => {
  it("returns an independent default location for each parse", () => {
    const first = parseHostSessionEditorLocation("");
    first.section = "records";
    first.source = "json";

    expect(parseHostSessionEditorLocation("")).toEqual({
      section: "overview",
      source: "manual",
    });
  });

  it.each([
    ["empty search", "", { section: "overview", source: "manual" }],
    ["overview section", "?section=overview", { section: "overview", source: "manual" }],
    ["basic section", "?section=basic", { section: "basic", source: "manual" }],
    ["attendance section", "?section=attendance", { section: "attendance", source: "manual" }],
    ["records manual", "?section=records", { section: "records", source: "manual" }],
    ["records AI", "?section=records&source=ai", { section: "records", source: "ai" }],
    ["records JSON", "?section=records&source=json", { section: "records", source: "json" }],
    ["history section", "?section=history", { section: "history", source: "manual" }],
    ["invalid section", "?section=unknown", { section: "overview", source: "manual" }],
    ["invalid records source", "?section=records&source=unknown", { section: "overview", source: "manual" }],
    ["invalid non-record source", "?section=basic&source=unknown", { section: "overview", source: "manual" }],
    ["source outside records", "?section=basic&source=ai", { section: "basic", source: "manual" }],
    ["legacy AI", "?aigen=1", { section: "records", source: "ai" }],
    ["legacy JSON", "?records=json", { section: "records", source: "json" }],
    [
      "canonical section and source over legacy values",
      "?section=records&source=json&aigen=1",
      { section: "records", source: "json" },
    ],
    [
      "canonical section over legacy values",
      "?section=basic&aigen=1&records=json",
      { section: "basic", source: "manual" },
    ],
  ] satisfies Array<[string, string, HostSessionEditorLocation]>)(
    "parses %s",
    (_name, search, expected) => {
      expect(parseHostSessionEditorLocation(search)).toEqual(expected);
    },
  );

  it.each([
    [
      "preserves unrelated parameters and hash while writing records AI",
      "https://readmates.test/app/host/sessions/session-1/edit?returnTo=%2Fapp%2Fhost&from=dashboard#audit",
      { section: "records", source: "ai" },
      "/app/host/sessions/session-1/edit?returnTo=%2Fapp%2Fhost&from=dashboard&section=records&source=ai#audit",
    ],
    [
      "removes section and source for overview",
      "https://readmates.test/app/host/sessions/session-1/edit?returnTo=%2Fapp%2Fhost&section=records&source=ai&aigen=1&records=json#audit",
      { section: "overview", source: "manual" },
      "/app/host/sessions/session-1/edit?returnTo=%2Fapp%2Fhost#audit",
    ],
    [
      "removes source for records manual",
      new URL("https://readmates.test/app/host/sessions/session-1/edit?from=closing&section=records&source=ai#audit"),
      { section: "records", source: "manual" },
      "/app/host/sessions/session-1/edit?from=closing&section=records#audit",
    ],
    [
      "does not retain a source outside records",
      "https://readmates.test/app/host/sessions/session-1/edit?from=dashboard&aigen=1",
      { section: "basic", source: "ai" },
      "/app/host/sessions/session-1/edit?from=dashboard&section=basic",
    ],
  ] satisfies Array<[string, string | URL, HostSessionEditorLocation, string]>)(
    "%s",
    (_name, currentUrl, next, expected) => {
      expect(buildHostSessionEditorUrl(currentUrl, next)).toBe(expected);
    },
  );
});
