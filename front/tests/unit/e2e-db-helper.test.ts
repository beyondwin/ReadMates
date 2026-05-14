import { execFileSync } from "node:child_process";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetE2eState } from "../e2e/readmates-e2e-db";

vi.mock("node:child_process", () => ({
  default: {
    execFileSync: vi.fn(() => Buffer.from("")),
  },
  execFileSync: vi.fn(() => Buffer.from("")),
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
});
