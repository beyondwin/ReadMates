import { afterEach, describe, expect, it, vi } from "vitest";
import { apiErrorFromResponse } from "./errors";
import {
  hostApiErrorFromResponse,
  subscribeHostAuthorityLoss,
} from "./host-authority-event";

function errorResponse(code: string, status = 403) {
  return new Response(JSON.stringify({ code, message: code, status }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

describe("host authority event", () => {
  it.each([
    "HOST_AUTHORITY_REVOKED",
    "MEMBERSHIP_SUSPENDED",
    "CROSS_CLUB_SCOPE",
  ] as const)("emits one typed event for %s after parsing", async (code) => {
    const listener = vi.fn();
    cleanups.push(subscribeHostAuthorityLoss(listener));

    const error = await hostApiErrorFromResponse(errorResponse(code), {
      clubSlug: "reading-sai",
      requestKind: "SESSION_BASIC_SAVE",
    });

    expect(error.code).toBe(code);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      code,
      clubSlug: "reading-sai",
      requestKind: "SESSION_BASIC_SAVE",
    });
  });

  it("keeps revision conflicts and response loss draft-preserving", async () => {
    const listener = vi.fn();
    cleanups.push(subscribeHostAuthorityLoss(listener));

    await hostApiErrorFromResponse(errorResponse("REVISION_CONFLICT", 409), {
      clubSlug: "reading-sai",
      requestKind: "SESSION_BASIC_SAVE",
    });
    await hostApiErrorFromResponse(errorResponse("NETWORK_RESPONSE_LOST", 503), {
      clubSlug: "reading-sai",
      requestKind: "SESSION_BASIC_SAVE",
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("leaves the generic API parser pure", async () => {
    const listener = vi.fn();
    cleanups.push(subscribeHostAuthorityLoss(listener));

    await apiErrorFromResponse(errorResponse("HOST_AUTHORITY_REVOKED"));

    expect(listener).not.toHaveBeenCalled();
  });
});
