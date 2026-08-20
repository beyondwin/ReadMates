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
});
