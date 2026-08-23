import { describe, expect, it } from "vitest";
import {
  buildHostMeetingUrl,
  buildHostSessionWorkspaceUrl,
  parseHostMeetingLocation,
  parseHostSessionWorkspaceLocation,
  type HostMeetingLocation,
  type HostSessionWorkspaceLocation,
} from "./host-session-workspace-navigation";

describe("host meeting local task navigation", () => {
  it("returns an independent overview location for each parse", () => {
    const first = parseHostMeetingLocation("");
    first.task = "records";
    first.overviewEditOpen = true;
    first.recordSource = "json";

    expect(parseHostMeetingLocation("")).toEqual({
      task: "overview",
      overviewEditOpen: false,
      recordSource: "manual",
    });
  });

  it.each([
    ["empty search", "", { task: "overview", overviewEditOpen: false, recordSource: "manual" }],
    ["overview section", "?section=overview", { task: "overview", overviewEditOpen: false, recordSource: "manual" }],
    ["basic editor", "?section=basic", { task: "overview", overviewEditOpen: true, recordSource: "manual" }],
    ["responses", "?section=responses", { task: "responses", overviewEditOpen: false, recordSource: "manual" }],
    ["attendance", "?section=attendance", { task: "attendance", overviewEditOpen: false, recordSource: "manual" }],
    ["records manual", "?section=records", { task: "records", overviewEditOpen: false, recordSource: "manual" }],
    ["records AI", "?section=records&source=ai", { task: "records", overviewEditOpen: false, recordSource: "ai" }],
    ["records JSON", "?section=records&source=json", { task: "records", overviewEditOpen: false, recordSource: "json" }],
    ["notifications", "?section=notifications", { task: "notifications", overviewEditOpen: false, recordSource: "manual" }],
    ["history", "?section=history", { task: "history", overviewEditOpen: false, recordSource: "manual" }],
    ["legacy AI", "?aigen=1", { task: "records", overviewEditOpen: false, recordSource: "ai" }],
    ["legacy JSON", "?records=json", { task: "records", overviewEditOpen: false, recordSource: "json" }],
    ["invalid section", "?section=unknown", { task: "overview", overviewEditOpen: false, recordSource: "manual" }],
    ["invalid records source", "?section=records&source=unknown", { task: "overview", overviewEditOpen: false, recordSource: "manual" }],
    ["invalid non-record source", "?section=basic&source=unknown", { task: "overview", overviewEditOpen: false, recordSource: "manual" }],
  ] satisfies Array<[string, string, HostMeetingLocation]>) (
    "maps %s to one semantic target",
    (_name, search, expected) => {
      expect(parseHostMeetingLocation(search)).toEqual(expected);
    },
  );

  it.each([
    ["task", "?task=records&task=records"],
    ["section", "?section=records&section=records"],
    ["encoded section", "?%73ection=records&section=records"],
    ["source", "?section=records&source=json&source=json"],
    ["records", "?records=json&records=json"],
    ["aigen", "?aigen=1&aigen=1"],
  ])("rejects repeated owned %s keys even when every occurrence is identical", (_name, search) => {
    expect(parseHostMeetingLocation(search)).toEqual({
      task: "overview",
      overviewEditOpen: false,
      recordSource: "manual",
    });
  });

  it.each([
    ["reserved task", "?task=records"],
    ["section", "?section=unknown"],
    ["source", "?section=records&source=unknown"],
    ["legacy records", "?section=records&source=json&records=xml"],
    ["legacy aigen", "?section=records&source=ai&aigen=0"],
  ])("rejects any invalid owned %s occurrence instead of hiding it", (_name, search) => {
    expect(parseHostMeetingLocation(search)).toEqual({
      task: "overview",
      overviewEditOpen: false,
      recordSource: "manual",
    });
  });

  it.each([
    ["different canonical tasks", "?section=records&section=attendance"],
    ["canonical versus legacy task", "?section=responses&records=json"],
    ["record sources", "?section=records&source=json&aigen=1"],
    ["legacy record sources", "?records=json&aigen=1"],
  ])("rejects conflicting owned query evidence: %s", (_name, search) => {
    expect(parseHostMeetingLocation(search)).toEqual({
      task: "overview",
      overviewEditOpen: false,
      recordSource: "manual",
    });
  });

  it.each([
    [
      "JSON",
      "?section=records&source=json&records=json",
      { task: "records", overviewEditOpen: false, recordSource: "json" },
    ],
    [
      "AI",
      "?section=records&source=ai&aigen=1",
      { task: "records", overviewEditOpen: false, recordSource: "ai" },
    ],
  ] satisfies Array<[string, string, HostMeetingLocation]>) (
    "accepts non-duplicated owned evidence when canonical and legacy %s agree",
    (_name, search, expected) => {
      expect(parseHostMeetingLocation(search)).toEqual(expected);
    },
  );

  it.each([
    [
      "records AI",
      "https://readmates.test/clubs/alpha/app/host/sessions/session-1?returnTo=%2Fclubs%2Falpha%2Fapp%2Fhost&from=dashboard#audit",
      { task: "records", overviewEditOpen: false, recordSource: "ai" },
      "/clubs/alpha/app/host/sessions/session-1?returnTo=%2Fclubs%2Falpha%2Fapp%2Fhost&from=dashboard&section=records&source=ai#audit",
    ],
    [
      "overview editor",
      "/clubs/alpha/app/host/sessions/session-1?from=dashboard&aigen=1#basic",
      { task: "overview", overviewEditOpen: true, recordSource: "manual" },
      "/clubs/alpha/app/host/sessions/session-1?from=dashboard&section=basic#basic",
    ],
    [
      "overview",
      "https://readmates.test/clubs/alpha/app/host/sessions/session-1?from=dashboard&section=records&source=json&records=json#audit",
      { task: "overview", overviewEditOpen: false, recordSource: "manual" },
      "/clubs/alpha/app/host/sessions/session-1?from=dashboard#audit",
    ],
    [
      "notifications",
      new URL("https://readmates.test/clubs/alpha/app/host/sessions/session-1?from=meeting#dispatch"),
      { task: "notifications", overviewEditOpen: false, recordSource: "manual" },
      "/clubs/alpha/app/host/sessions/session-1?from=meeting&section=notifications#dispatch",
    ],
  ] satisfies Array<[string, string | URL, HostMeetingLocation, string]>) (
    "preserves scoped path, unrelated query, and hash while building %s",
    (_name, currentUrl, next, expected) => {
      expect(buildHostMeetingUrl(currentUrl, next)).toBe(expected);
    },
  );

  it("preserves every unrelated raw query token, separator order, and hash byte-for-byte", () => {
    expect(
      buildHostMeetingUrl(
        "/clubs/alpha/app/host/sessions/s-1/?space=%20&plus=+&lower=%2f&upper=%2F&dup=one&dup=two&&bare&blank=&section=overview#Frag%2f+?x",
        { task: "records", overviewEditOpen: false, recordSource: "ai" },
      ),
    ).toBe(
      "/clubs/alpha/app/host/sessions/s-1/?space=%20&plus=+&lower=%2f&upper=%2F&dup=one&dup=two&&bare&blank=&section=records&source=ai#Frag%2f+?x",
    );
  });

  it("removes encoded owned keys without normalizing adjacent unrelated tokens", () => {
    expect(
      buildHostMeetingUrl(
        "/app/host/sessions/s-1?keep=%2f&task=records&%73ection=records&%73ource=json&records=json&aigen=1&blank=&bare#hash%2f",
        { task: "attendance", overviewEditOpen: false, recordSource: "manual" },
      ),
    ).toBe("/app/host/sessions/s-1?keep=%2f&blank=&bare&section=attendance#hash%2f");
  });

  it.each([
    [
      "relative compatibility",
      "/app/host/sessions/s-1/?raw=%20#tail",
      "/app/host/sessions/s-1/?raw=%20&section=history#tail",
    ],
    [
      "scoped",
      "/clubs/alpha/app/host/sessions/s-1/?raw=%2f#tail",
      "/clubs/alpha/app/host/sessions/s-1/?raw=%2f&section=history#tail",
    ],
    [
      "absolute input emitted as an app href",
      "https://readmates.test/clubs/alpha/app/host/sessions/s-1/?raw=+#tail",
      "/clubs/alpha/app/host/sessions/s-1/?raw=+&section=history#tail",
    ],
  ])("preserves the %s path, trailing slash, raw query, and hash contract", (_name, currentUrl, expected) => {
    expect(
      buildHostMeetingUrl(currentUrl, {
        task: "history",
        overviewEditOpen: false,
        recordSource: "manual",
      }),
    ).toBe(expected);
  });

  it.each([
    ["malformed absolute URL", "http://[::1"],
    ["unsupported scheme", "javascript:alert(1)"],
    ["network-path origin injection", "//evil.example/steal?keep=1"],
    ["path-shaped origin injection", "https://readmates.test//evil.example/steal?keep=1"],
    ["credential-bearing URL object", new URL("https://user:secret@readmates.test/app/host/sessions/s-1")],
  ] satisfies Array<[string, string | URL]>) (
    "returns the safe overview href for %s",
    (_name, currentUrl) => {
    expect(() => buildHostMeetingUrl(currentUrl, {
      task: "records",
      overviewEditOpen: false,
      recordSource: "json",
    })).not.toThrow();
    expect(buildHostMeetingUrl(currentUrl, {
      task: "records",
      overviewEditOpen: false,
      recordSource: "json",
    })).toBe("/");
    },
  );

  it("maps Back and Forward URL snapshots to the same deterministic semantic targets", () => {
    const snapshots = [
      new URL("https://readmates.test/clubs/alpha/app/host/sessions/s-1?returnTo=%2Fclubs%2Falpha%2Fapp%2Fhost#top"),
      new URL("https://readmates.test/clubs/alpha/app/host/sessions/s-1?returnTo=%2Fclubs%2Falpha%2Fapp%2Fhost&section=records&source=json#draft"),
      new URL("https://readmates.test/clubs/alpha/app/host/sessions/s-1?returnTo=%2Fclubs%2Falpha%2Fapp%2Fhost&section=attendance#ledger"),
    ];
    const expected: HostMeetingLocation[] = [
      { task: "overview", overviewEditOpen: false, recordSource: "manual" },
      { task: "records", overviewEditOpen: false, recordSource: "json" },
      { task: "attendance", overviewEditOpen: false, recordSource: "manual" },
    ];

    const parseSnapshot = (url: URL) => parseHostMeetingLocation(url.search);
    expect(snapshots.map(parseSnapshot)).toEqual(expected);
    expect([...snapshots].reverse().map(parseSnapshot)).toEqual([...expected].reverse());
    expect(snapshots.map(parseSnapshot)).toEqual(expected);
  });
});

describe("HostSessionWorkspace navigation compatibility until B8", () => {
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
  ] satisfies Array<[string, string, HostSessionWorkspaceLocation]>) (
    "parses %s",
    (_name, search, expected) => {
      expect(parseHostSessionWorkspaceLocation(search)).toEqual(expected);
    },
  );

  it("parses the legacy records JSON deep link", () => {
    expect(parseHostSessionWorkspaceLocation("?section=records&source=json")).toEqual({
      panel: "records",
      source: "json",
    });
  });

  it.each([
    "?section=records&section=records",
    "?section=records&source=json&source=json",
    "?records=json&records=json",
    "?aigen=1&aigen=1",
    "?task=overview&task=overview",
  ])("fails closed for repeated owned compatibility query keys: %s", (search) => {
    expect(parseHostSessionWorkspaceLocation(search)).toEqual({
      panel: "focus",
      source: "manual",
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
  ] satisfies Array<[string, string | URL, HostSessionWorkspaceLocation, string]>) (
    "%s",
    (_name, currentUrl, next, expected) => {
      expect(buildHostSessionWorkspaceUrl(currentUrl, next)).toBe(expected);
    },
  );
});
