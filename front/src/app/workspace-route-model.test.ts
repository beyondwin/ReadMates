import { describe, expect, it } from "vitest";
import {
  buildClubSwitchTarget,
  candidateRoleSwitchTarget,
  canonicalizeCompatibilityEntry,
  resolveAuthorizedRoleSwitchTarget,
  workspaceFromCanonicalPath,
} from "./workspace-route-model";

describe("workspace route model", () => {
  it.each([
    ["/clubs/reading-sai/app", "member"],
    ["/clubs/reading-sai/app/archive", "member"],
    ["/clubs/reading-sai/app/host", "host"],
    ["/clubs/reading-sai/app/host/sessions/meeting-7", "host"],
  ] as const)("derives the %s workspace from its canonical pathname", (pathname, workspace) => {
    expect(workspaceFromCanonicalPath(pathname)).toBe(workspace);
  });

  it("replaces an unscoped compatibility entry with the same scoped route", () => {
    expect(
      canonicalizeCompatibilityEntry({
        pathname: "/app/host/sessions/meeting-7",
        search: "?section=attendance",
        hash: "#participant-3",
        currentClubSlug: "reading-sai",
      }),
    ).toBe("/clubs/reading-sai/app/host/sessions/meeting-7?section=attendance#participant-3");
  });

  it.each([
    ["member today", "/clubs/reading-sai/app", "host", "/clubs/reading-sai/app/host", false],
    ["member notes list", "/clubs/reading-sai/app/notes", "host", "/clubs/reading-sai/app/host", false],
    ["member note detail", "/clubs/reading-sai/app/notes/note-7", "host", "/clubs/reading-sai/app/host", false],
    ["member records list", "/clubs/reading-sai/app/archive", "host", "/clubs/reading-sai/app/host/sessions", false],
    ["member record detail", "/clubs/reading-sai/app/sessions/meeting-7", "host", "/clubs/reading-sai/app/host/sessions/meeting-7", true],
    ["member profile", "/clubs/reading-sai/app/me", "host", "/clubs/reading-sai/app/host", false],
    ["member notifications", "/clubs/reading-sai/app/notifications", "host", "/clubs/reading-sai/app/host/notifications", false],
    ["member account", "/clubs/reading-sai/app/me/settings", "host", "/clubs/reading-sai/app/host", false],
    ["member personal records", "/clubs/reading-sai/app/me/records", "host", "/clubs/reading-sai/app/host/sessions", false],
    ["member notification settings", "/clubs/reading-sai/app/notifications/settings", "host", "/clubs/reading-sai/app/host/notifications", false],
    ["host today", "/clubs/reading-sai/app/host", "member", "/clubs/reading-sai/app", false],
    ["host operations", "/clubs/reading-sai/app/host/operations", "member", "/clubs/reading-sai/app", false],
    ["host members", "/clubs/reading-sai/app/host/members", "member", "/clubs/reading-sai/app", false],
    ["host invitations", "/clubs/reading-sai/app/host/invitations", "member", "/clubs/reading-sai/app", false],
    ["host records list", "/clubs/reading-sai/app/host/sessions", "member", "/clubs/reading-sai/app/archive", false],
    ["host meeting detail", "/clubs/reading-sai/app/host/sessions/meeting-7", "member", "/clubs/reading-sai/app/sessions/meeting-7", true],
    ["host draft", "/clubs/reading-sai/app/host/sessions/new", "member", "/clubs/reading-sai/app", false],
    ["host edit", "/clubs/reading-sai/app/host/sessions/meeting-7/edit", "member", "/clubs/reading-sai/app", false],
    ["host closing", "/clubs/reading-sai/app/host/sessions/meeting-7/closing", "member", "/clubs/reading-sai/app", false],
    ["host feedback preview", "/clubs/reading-sai/app/host/sessions/meeting-7/feedback-document", "member", "/clubs/reading-sai/app", false],
    ["host notifications", "/clubs/reading-sai/app/host/notifications", "member", "/clubs/reading-sai/app/notifications", false],
  ] as const)("maps %s to only its safe role counterpart", (_name, pathname, targetWorkspace, target, requiresCorrespondence) => {
    const candidate = candidateRoleSwitchTarget({ pathname, targetWorkspace });

    expect(candidate).toMatchObject({ target, requiresCorrespondence, navigation: "push" });
  });

  it("offers the corresponding same-meeting path only as a loader-authorized role candidate", () => {
    const candidate = candidateRoleSwitchTarget({
      pathname: "/clubs/reading-sai/app/sessions/meeting-7",
      targetWorkspace: "host",
    });

    expect(
      resolveAuthorizedRoleSwitchTarget({
        candidate,
        authorizedWorkspaces: ["member", "host"],
        correspondence: "authorized",
        lastSafeTarget: "/clubs/reading-sai/app/host/sessions",
      }),
    ).toBe("/clubs/reading-sai/app/host/sessions/meeting-7");
  });

  it("keeps an unknown same-meeting target for the route loader to authorize", () => {
    const candidate = candidateRoleSwitchTarget({
      pathname: "/clubs/reading-sai/app/host/sessions/meeting-7",
      targetWorkspace: "member",
    });

    expect(
      resolveAuthorizedRoleSwitchTarget({
        candidate,
        authorizedWorkspaces: ["member", "host"],
        correspondence: "unknown",
        lastSafeTarget: "/clubs/reading-sai/app/archive",
      }),
    ).toBe("/clubs/reading-sai/app/sessions/meeting-7");
  });

  it("uses a same-club last-safe target when the detail loader marks a counterpart unavailable", () => {
    const candidate = candidateRoleSwitchTarget({
      pathname: "/clubs/reading-sai/app/host/sessions/meeting-7",
      targetWorkspace: "member",
    });

    expect(
      resolveAuthorizedRoleSwitchTarget({
        candidate,
        authorizedWorkspaces: ["member", "host"],
        correspondence: "unavailable",
        lastSafeTarget: "/clubs/reading-sai/app/notes",
      }),
    ).toBe("/clubs/reading-sai/app/notes");
  });

  it("prefers a same-club last-safe target for an authorized workspace-home transition", () => {
    const candidate = candidateRoleSwitchTarget({
      pathname: "/clubs/reading-sai/app/host/operations",
      targetWorkspace: "member",
    });

    expect(
      resolveAuthorizedRoleSwitchTarget({
        candidate,
        authorizedWorkspaces: ["member", "host"],
        correspondence: "unknown",
        lastSafeTarget: "/clubs/reading-sai/app/notes",
      }),
    ).toBe("/clubs/reading-sai/app/notes");
  });

  it("does not preserve a host-only draft when changing to the member workspace", () => {
    const candidate = candidateRoleSwitchTarget({
      pathname: "/clubs/reading-sai/app/host/sessions/draft-7/edit",
      targetWorkspace: "member",
    });

    expect(candidate).toMatchObject({
      target: "/clubs/reading-sai/app",
      fallback: "/clubs/reading-sai/app",
      requiresCorrespondence: false,
    });
  });

  it("uses a last safe authorized target when the requested workspace is no longer authorized", () => {
    const candidate = candidateRoleSwitchTarget({
      pathname: "/clubs/reading-sai/app/host/operations",
      targetWorkspace: "host",
    });

    expect(
      resolveAuthorizedRoleSwitchTarget({
        candidate,
        authorizedWorkspaces: ["member"],
        correspondence: "unknown",
        lastSafeTarget: "/clubs/reading-sai/app/notes",
      }),
    ).toBe("/clubs/reading-sai/app/notes");
  });

  it("never uses a last-safe target from a different club", () => {
    const candidate = candidateRoleSwitchTarget({
      pathname: "/clubs/reading-sai/app/host/sessions/meeting-7",
      targetWorkspace: "member",
    });

    expect(
      resolveAuthorizedRoleSwitchTarget({
        candidate,
        authorizedWorkspaces: ["member", "host"],
        correspondence: "unavailable",
        lastSafeTarget: "/clubs/other-club/app/me",
      }),
    ).toBe("/clubs/reading-sai/app/archive");
  });

  it.each([
    ["/clubs/reading-sai/app", "member", "/clubs/next-club/app"],
    ["/clubs/reading-sai/app/notes", "member", "/clubs/next-club/app/notes"],
    ["/clubs/reading-sai/app/archive", "member", "/clubs/next-club/app/archive"],
    ["/clubs/reading-sai/app/me", "member", "/clubs/next-club/app/me"],
    ["/clubs/reading-sai/app/me/records", "member", "/clubs/next-club/app/archive"],
    ["/clubs/reading-sai/app/me/settings", "member", "/clubs/next-club/app/me/settings"],
    ["/clubs/reading-sai/app/notifications", "member", "/clubs/next-club/app/notifications"],
    ["/clubs/reading-sai/app/notifications/settings", "member", "/clubs/next-club/app/notifications"],
    ["/clubs/reading-sai/app/session/current", "member", "/clubs/next-club/app"],
    ["/clubs/reading-sai/app/host", "host", "/clubs/next-club/app/host"],
    ["/clubs/reading-sai/app/host/sessions", "host", "/clubs/next-club/app/host/sessions"],
    ["/clubs/reading-sai/app/host/notifications", "host", "/clubs/next-club/app/host/notifications"],
    ["/clubs/reading-sai/app/sessions/meeting-7", "member", "/clubs/next-club/app/archive"],
    ["/clubs/reading-sai/app/feedback/meeting-7/print", "member", "/clubs/next-club/app/archive"],
    ["/clubs/reading-sai/app/host/sessions/meeting-7/edit", "host", "/clubs/next-club/app/host"],
  ] as const)("builds a safe club switch for %s", (pathname, targetWorkspace, expected) => {
    expect(buildClubSwitchTarget({ pathname, targetClubSlug: "next-club", targetWorkspace })).toBe(expected);
  });

  it("marks involuntary authority loss as a safe replace transition", () => {
    const candidate = candidateRoleSwitchTarget({
      pathname: "/clubs/reading-sai/app/host/sessions/meeting-7",
      targetWorkspace: "member",
      transition: "authority-loss",
    });

    expect(candidate.navigation).toBe("replace");
  });

  it("handles malformed scoped club slugs without throwing or trusting a decoded value", () => {
    expect(workspaceFromCanonicalPath("/clubs/%E0%A4%A/app/host")).toBe("host");
    expect(
      buildClubSwitchTarget({
        pathname: "/clubs/%E0%A4%A/app/archive",
        targetClubSlug: "next-club",
        targetWorkspace: "member",
      }),
    ).toBe("/clubs/next-club/app/archive");
  });
});
