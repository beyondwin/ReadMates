import { describe, expect, it } from "vitest";
import {
  buildHostMeetingUrl,
  parseHostMeetingLocation,
  type HostMeetingLocation,
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

  it("gives canonical task parameters precedence over legacy record parameters", () => {
    expect(parseHostMeetingLocation("?section=responses&aigen=1&records=json")).toEqual({
      task: "responses",
      overviewEditOpen: false,
      recordSource: "manual",
    });
    expect(parseHostMeetingLocation("?section=records&source=json&aigen=1")).toEqual({
      task: "records",
      overviewEditOpen: false,
      recordSource: "json",
    });
  });

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
