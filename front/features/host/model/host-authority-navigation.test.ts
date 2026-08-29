import { describe, expect, it } from "vitest";
import {
  consumeHostAuthorityNavigation,
  HOST_AUTHORITY_LOSS_HANDOFF_STATE_KEY,
  isPendingHostAuthorityNavigation,
  stageHostAuthorityNavigation,
} from "./host-authority-navigation";

function handoffState(handoffId: string) {
  return { [HOST_AUTHORITY_LOSS_HANDOFF_STATE_KEY]: handoffId };
}

describe("host authority navigation", () => {
  it("accepts only an exact scoped member root for an authority-loss handoff", () => {
    const safe = {
      code: "HOST_AUTHORITY_REVOKED" as const,
      handoffId: "safe-handoff",
      targetPathname: "/clubs/reading-sai/app",
    };
    stageHostAuthorityNavigation(safe);

    expect(isPendingHostAuthorityNavigation({
      pathname: safe.targetPathname,
      state: handoffState(safe.handoffId),
    })).toBe(true);
    expect(consumeHostAuthorityNavigation(
      safe.targetPathname,
      handoffState(safe.handoffId),
    )).toBe("HOST_AUTHORITY_REVOKED");

    const unsafeTargets = [
      "/app",
      "/clubs/reading-sai/app/archive",
      "/clubs/reading-sai/app/sessions/session-7",
      "/clubs/next-club/app/host/people/membership-7",
    ];

    for (const [index, targetPathname] of unsafeTargets.entries()) {
      const handoffId = `unsafe-handoff-${index}`;
      stageHostAuthorityNavigation({
        code: "CROSS_CLUB_SCOPE",
        handoffId,
        targetPathname,
      });
      try {
        expect(isPendingHostAuthorityNavigation({
          pathname: targetPathname,
          state: handoffState(handoffId),
        })).toBe(false);
      } finally {
        consumeHostAuthorityNavigation(targetPathname, handoffState(handoffId));
      }
    }
  });
});
