import { execFileSync } from "node:child_process";

import type { Page } from "@playwright/test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createViewerGoogleUserFixture,
  ensureSecondClubFixture,
  loginWithGoogleFixture,
  resetE2eState,
} from "../e2e/readmates-e2e-db";

vi.mock("node:child_process", () => ({
  default: {
    execFileSync: vi.fn(() => Buffer.from("1")),
  },
  execFileSync: vi.fn(() => Buffer.from("1")),
}));

const execFileSyncMock = vi.mocked(execFileSync);

describe("E2E database helper batching", () => {
  beforeEach(() => {
    execFileSyncMock.mockClear();
  });

  it("batches generated session cleanup and Google fixture reset into one mysql call", () => {
    resetE2eState({
      cleanupGeneratedSessions: true,
      googleLoginEmails: ["host@example.com", "member1@example.com"],
    });

    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    const sql = execFileSyncMock.mock.calls[0]?.[1]?.at(-1);

    expect(sql).toContain("delete from sessions");
    expect(sql).toContain("where club_id = '00000000-0000-0000-0000-000000000001'");
    expect(sql).toContain("update users");
    expect(sql).toContain("'host@example.com'");
    expect(sql).toContain("'member1@example.com'");
  });

  it("assigns intentional stable avatar keys in direct membership fixtures", () => {
    ensureSecondClubFixture();
    createViewerGoogleUserFixture("fixture.viewer@example.test");

    const secondClubSql = execFileSyncMock.mock.calls[0]?.[1]?.at(-1);
    const viewerSql = execFileSyncMock.mock.calls[1]?.[1]?.at(-1);

    expect(secondClubSql).toContain("avatar_key");
    expect(secondClubSql).toContain("'reading-lamp'");
    expect(viewerSql).toContain("avatar_key");
    expect(viewerSql).toContain("'question-card'");
  });

  it("assigns intentional stable avatar keys in Google login membership fixtures", async () => {
    const addCookies = vi.fn();
    const page = {
      context: () => ({ addCookies }),
    } as unknown as Page;

    await loginWithGoogleFixture(page, "fixture.uninvited@example.test");
    const viewerSql = execFileSyncMock.mock.calls[0]?.[1]?.at(-1);
    expect(viewerSql).toContain("avatar_key");
    expect(viewerSql).toContain("'archive-box'");

    execFileSyncMock.mockClear();
    await loginWithGoogleFixture(page, "fixture.invited@example.test", { inviteToken: "fixture-token" });
    const acceptedInviteSql = execFileSyncMock.mock.calls[0]?.[1]?.at(-1);
    expect(acceptedInviteSql).toContain("avatar_key");
    expect(acceptedInviteSql).toContain("'open-book-pencil'");
  });
});
