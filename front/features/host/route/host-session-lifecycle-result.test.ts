import { describe, expect, it } from "vitest";
import { hostSessionLifecycleResultFromResponse } from "./host-session-lifecycle-result";

describe("hostSessionLifecycleResultFromResponse", () => {
  it("returns the session detail when the response is ok", async () => {
    const session = { sessionId: "session-7", state: "OPEN" };
    const result = await hostSessionLifecycleResultFromResponse(
      new Response(JSON.stringify(session), { status: 200 }),
    );

    expect(result).toEqual({ ok: true, session });
  });

  it("keeps openSessionId only for SESSION_OPEN_ALREADY_EXISTS", async () => {
    const conflict = await hostSessionLifecycleResultFromResponse(
      new Response(JSON.stringify({
        code: "SESSION_OPEN_ALREADY_EXISTS",
        message: "이미 진행 중인 세션이 있습니다. 그 세션을 마감하거나 예정으로 되돌린 뒤 다시 시도하세요.",
        status: 409,
        openSessionId: "00000000-0000-0000-0000-000000000307",
      }), { status: 409 }),
    );
    const notAllowed = await hostSessionLifecycleResultFromResponse(
      new Response(JSON.stringify({
        code: "SESSION_REOPEN_NOT_ALLOWED",
        message: "마감된 세션만 다시 열 수 있습니다.",
        status: 409,
      }), { status: 409 }),
    );

    expect(conflict).toEqual({
      ok: false,
      message: "이미 진행 중인 세션이 있습니다. 그 세션을 마감하거나 예정으로 되돌린 뒤 다시 시도하세요.",
      openSessionId: "00000000-0000-0000-0000-000000000307",
    });
    expect(notAllowed).toEqual({
      ok: false,
      message: "마감된 세션만 다시 열 수 있습니다.",
      openSessionId: null,
    });
  });
});
