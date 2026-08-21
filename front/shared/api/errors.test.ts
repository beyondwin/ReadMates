import { describe, expect, it } from "vitest";
import { apiErrorFromResponse } from "./errors";

describe("apiErrorFromResponse", () => {
  it("keeps openSessionId on SESSION_OPEN_ALREADY_EXISTS", async () => {
    const response = new Response(
      JSON.stringify({
        code: "SESSION_OPEN_ALREADY_EXISTS",
        message: "이미 진행 중인 모임이 있습니다. 그 모임을 마치거나 모임 전으로 되돌린 뒤 다시 시도하세요.",
        status: 409,
        openSessionId: "00000000-0000-0000-0000-000000000307",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
    const error = await apiErrorFromResponse(response);
    expect(error.code).toBe("SESSION_OPEN_ALREADY_EXISTS");
    expect(error.openSessionId).toBe("00000000-0000-0000-0000-000000000307");
  });

  it.each([
    { name: "missing", body: {} },
    { name: "null", body: { openSessionId: null } },
    { name: "empty", body: { openSessionId: "" } },
    { name: "non-string", body: { openSessionId: 7 } },
  ])("treats $name openSessionId as null", async ({ body }) => {
    const response = new Response(
      JSON.stringify({
        code: "SESSION_OPEN_ALREADY_EXISTS",
        message: "이미 진행 중인 모임이 있습니다. 그 모임을 마치거나 모임 전으로 되돌린 뒤 다시 시도하세요.",
        status: 409,
        ...body,
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
    const error = await apiErrorFromResponse(response);
    expect(error.openSessionId).toBeNull();
  });

  it("keeps validated blockers and discards malformed entries", async () => {
    const response = new Response(
      JSON.stringify({
        code: "SESSION_DELETE_BLOCKED",
        message: "적용 기록 또는 알림 이력이 있는 세션은 삭제할 수 없습니다.",
        status: 409,
        blockers: [
          { code: "RECORD_REVISION_EXISTS", count: 2, payload: "should-not-copy" },
          { code: "MANUAL_DISPATCH_EXISTS", count: 1 },
          { code: "NOTIFICATION_EVENT_EXISTS" },
          { code: 7, count: 1 },
          { count: 3 },
          { code: "NOTIFICATION_DELIVERY_EXISTS", count: "1" },
          null,
          "RECORD_REVISION_EXISTS",
        ],
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
    const error = await apiErrorFromResponse(response);
    expect(error.code).toBe("SESSION_DELETE_BLOCKED");
    expect(error.blockers).toEqual([
      { code: "RECORD_REVISION_EXISTS", count: 2 },
      { code: "MANUAL_DISPATCH_EXISTS", count: 1 },
    ]);
    expect(error.blockers[0]).not.toHaveProperty("payload");
  });

  it("does not read blockers from problem-detail payloads", async () => {
    const response = new Response(
      JSON.stringify({
        code: "SESSION_DELETE_BLOCKED",
        status: 409,
        title: "Conflict",
        detail: JSON.stringify({
          blockers: [{ code: "RECORD_REVISION_EXISTS", count: 9 }],
        }),
        blockers: [{ code: "MANUAL_DISPATCH_EXISTS", count: 4 }],
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
    const error = await apiErrorFromResponse(response);
    expect(error.code).toBe("SESSION_DELETE_BLOCKED");
    expect(error.message).toBe(JSON.stringify({
      blockers: [{ code: "RECORD_REVISION_EXISTS", count: 9 }],
    }));
    expect(error.blockers).toEqual([]);
  });

  it("treats missing or non-array blockers as empty", async () => {
    const response = new Response(
      JSON.stringify({
        code: "SESSION_DELETION_NOT_ALLOWED",
        message: "초안 또는 진행 중인 세션만 삭제할 수 있습니다.",
        status: 409,
        blockers: { code: "RECORD_REVISION_EXISTS", count: 1 },
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
    const error = await apiErrorFromResponse(response);
    expect(error.blockers).toEqual([]);
  });
});
