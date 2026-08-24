import { afterEach, describe, expect, it, vi } from "vitest";
import { saveHostSessionAttendance } from "./host-api";
import { __resetHostClientContractCapabilityForTest } from "@/shared/api/host-client-contract";
import {
  fetchHostSessionRestorePreview,
  restoreHostSessionChange,
} from "./host-session-recovery-api";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const preview = {
  sessionId: "session-7",
  changeId: "change-1",
  kind: "BASIC_INFO",
  expectedCurrentHash: "c".repeat(64),
  canRestore: true,
  blockedReason: null,
  items: [{
    field: "title",
    subjectId: null,
    currentValue: "새 제목",
    targetValue: "이전 제목",
    sensitive: false,
  }],
};

afterEach(() => {
  __resetHostClientContractCapabilityForTest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("host session recovery API", () => {
  it("fetches restore preview with encoded ids and scoped club context", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(preview));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchHostSessionRestorePreview(
      "session/7",
      "change/1",
      { clubSlug: "reading-sai" },
    )).resolves.toEqual(preview);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/host/sessions/session%2F7/changes/change%2F1/restore-preview?clubSlug=reading-sai",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("posts the expected current hash with scoped club context", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(
      url.includes("/__internal/client-contract-status")
        ? new Response(JSON.stringify({
            schemaVersion: 1,
            supportedHostClientContracts: ["v2", "v3"],
          }), { headers: { "Cache-Control": "no-store", "Content-Type": "application/json" } })
        : jsonResponse({
            changeId: "change-2",
            kind: "BASIC_INFO",
            undoAvailable: true,
          }),
    ));
    vi.stubGlobal("fetch", fetchMock);
    const envelope = {
      idempotencyKey: "b6-restore-change-0001",
      expected: { sessionRevision: 3 },
      command: { expectedCurrentHash: "d".repeat(64) },
    };

    await expect(restoreHostSessionChange(
      "session/7",
      "change/1",
      envelope,
      { clubSlug: "reading-sai" },
    )).resolves.toEqual({
      changeId: "change-2",
      kind: "BASIC_INFO",
      undoAvailable: true,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(2,
      "/api/bff/api/host/sessions/session%2F7/changes/change%2F1/restore?clubSlug=reading-sai",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(envelope),
      }),
    );
    await expect(restoreHostSessionChange(
      "session/7",
      "change/1",
      { ...envelope, expected: {} } as never,
      { clubSlug: "reading-sai" },
    )).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("parses an attendance save receipt without a second request", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(
      url.includes("/__internal/client-contract-status")
        ? new Response(JSON.stringify({
            schemaVersion: 1,
            supportedHostClientContracts: ["v2", "v3"],
          }), { headers: { "Cache-Control": "no-store", "Content-Type": "application/json" } })
        : jsonResponse({
            sessionId: "session-7",
            count: 1,
            changeReceipt: {
              changeId: "change-attendance-1",
              kind: "ATTENDANCE",
              undoAvailable: true,
            },
          }),
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveHostSessionAttendance(
      "session 7",
      {
        idempotencyKey: "b6-attendance-0001",
        expected: { rows: [{ membershipId: "membership-1", attendanceRevision: 4 }] },
        command: { entries: [{
          membershipId: "membership-1",
          attendanceStatus: "ATTENDED",
          expectedAttendanceRevision: 4,
        }] },
      },
      { clubSlug: "reading-sai" },
    )).resolves.toEqual({
      sessionId: "session-7",
      count: 1,
      changeReceipt: {
        changeId: "change-attendance-1",
        kind: "ATTENDANCE",
        undoAvailable: true,
      },
    });

    expect(fetchMock).toHaveBeenNthCalledWith(2,
      "/api/bff/api/host/sessions/session%207/attendance?clubSlug=reading-sai",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: "b6-attendance-0001",
          expected: { rows: [{ membershipId: "membership-1", attendanceRevision: 4 }] },
          command: { entries: [{
            membershipId: "membership-1",
            attendanceStatus: "ATTENDED",
            expectedAttendanceRevision: 4,
          }] },
        }),
      }),
    );
  });

  it("converts a stale restore conflict into an API error", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(
      url.includes("/__internal/client-contract-status")
        ? new Response(JSON.stringify({
            schemaVersion: 1,
            supportedHostClientContracts: ["v3"],
          }), { headers: { "Cache-Control": "no-store", "Content-Type": "application/json" } })
        : jsonResponse({
            code: "HOST_SESSION_RESTORE_STALE",
            message: "그 사이 다른 변경이 있습니다.",
            status: 409,
          }, 409),
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(restoreHostSessionChange(
      "session-7",
      "change-1",
      {
        idempotencyKey: "b6-restore-change-0002",
        expected: { sessionRevision: 7 },
        command: { expectedCurrentHash: "e".repeat(64) },
      },
      { clubSlug: "reading-sai" },
    )).rejects.toMatchObject({
      code: "HOST_SESSION_RESTORE_STALE",
      status: 409,
    });
  });
});
