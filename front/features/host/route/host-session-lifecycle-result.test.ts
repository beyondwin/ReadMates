import { describe, expect, it, vi } from "vitest";
import { subscribeHostAuthorityLoss } from "@/shared/api/host-authority-event";
import { hostSessionLifecycleResultFromResponse } from "./host-session-lifecycle-result";

const context = { clubSlug: "reading-sai", requestKind: "SESSION_LIFECYCLE" } as const;

describe("hostSessionLifecycleResultFromResponse", () => {
  it("returns the session detail when the response is ok", async () => {
    const session = { sessionId: "session-7", state: "OPEN" };
    const result = await hostSessionLifecycleResultFromResponse(
      new Response(JSON.stringify(session), { status: 200 }),
      context,
    );

    expect(result).toEqual({ ok: true, session });
  });

  it("keeps openSessionId only for SESSION_OPEN_ALREADY_EXISTS", async () => {
    const conflict = await hostSessionLifecycleResultFromResponse(
      new Response(JSON.stringify({
        code: "SESSION_OPEN_ALREADY_EXISTS",
        message: "이미 진행 중인 모임이 있습니다. 그 모임을 마치거나 작성 중으로 되돌린 뒤 다시 시도하세요.",
        status: 409,
        openSessionId: "00000000-0000-0000-0000-000000000307",
      }), { status: 409 }),
      context,
    );
    const notAllowed = await hostSessionLifecycleResultFromResponse(
      new Response(JSON.stringify({
        code: "SESSION_REOPEN_NOT_ALLOWED",
        message: "마감된 모임만 다시 열 수 있습니다.",
        status: 409,
      }), { status: 409 }),
      context,
    );

    expect(conflict).toEqual({
      ok: false,
      message: "이미 진행 중인 모임이 있습니다. 그 모임을 마치거나 작성 중으로 되돌린 뒤 다시 시도하세요.",
      openSessionId: "00000000-0000-0000-0000-000000000307",
    });
    expect(notAllowed).toEqual({
      ok: false,
      message: "마감된 모임만 다시 열 수 있습니다.",
      openSessionId: null,
    });
  });

  it.each([
    "HOST_AUTHORITY_REVOKED",
    "MEMBERSHIP_SUSPENDED",
    "CROSS_CLUB_SCOPE",
  ] as const)("emits %s with the owning club from a manually parsed lifecycle response", async (code) => {
    const listener = vi.fn();
    const unsubscribe = subscribeHostAuthorityLoss(listener);

    await hostSessionLifecycleResultFromResponse(new Response(JSON.stringify({
      code,
      message: "권한이 해제되었습니다.",
      status: 403,
    }), { status: 403 }), context);

    expect(listener).toHaveBeenCalledWith({
      code,
      clubSlug: "reading-sai",
      requestKind: "SESSION_LIFECYCLE",
    });
    unsubscribe();
  });
});
