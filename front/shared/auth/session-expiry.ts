export const READMATES_SESSION_EXPIRED_EVENT = "readmates:session-expired";

export type SessionExpiryCause = "read" | "write";

export function signalSessionExpired(cause: SessionExpiryCause) {
  if (typeof globalThis.dispatchEvent !== "function" || typeof CustomEvent === "undefined") {
    return;
  }

  globalThis.dispatchEvent(
    new CustomEvent(READMATES_SESSION_EXPIRED_EVENT, {
      detail: { cause },
    }),
  );
}

export function sessionExpiryCause(event: Event): SessionExpiryCause | null {
  if (!(event instanceof CustomEvent)) {
    return null;
  }

  const cause = (event.detail as { cause?: unknown } | null)?.cause;
  return cause === "read" || cause === "write" ? cause : null;
}
