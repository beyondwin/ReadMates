import { useState } from "react";
import type { SessionExpiryCause } from "@/shared/auth/session-expiry";

type SessionExpiryRecoveryProps = {
  cause: SessionExpiryCause;
  loginHref: string;
  guestContinuationStatus: "not-applicable" | "pending" | "available" | "unavailable";
  canContinueAsGuest: boolean;
  onContinueAsGuest: () => Promise<void>;
};

export function SessionExpiryRecovery({
  cause,
  loginHref,
  guestContinuationStatus,
  canContinueAsGuest,
  onContinueAsGuest,
}: SessionExpiryRecoveryProps) {
  const [isContinuing, setIsContinuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readCopy = {
    pending: "보던 내용은 그대로 두었습니다. 공개 화면으로 이어볼 수 있는지 확인하고 있습니다.",
    available: "보던 내용은 그대로 두었습니다. 다시 로그인하거나 공개된 화면을 게스트로 이어볼 수 있습니다.",
    unavailable: "보던 내용은 그대로 두었습니다. 이 화면은 게스트로 이어볼 수 없어 다시 로그인해 주세요.",
    "not-applicable": "보던 내용은 그대로 두었습니다. 계속하려면 다시 로그인해 주세요.",
  }[guestContinuationStatus];

  const continueAsGuest = async () => {
    setError(null);
    setIsContinuing(true);
    try {
      await onContinueAsGuest();
    } catch {
      setError("게스트 화면으로 전환하지 못했습니다. 다시 시도해 주세요.");
      setIsContinuing(false);
    }
  };

  return (
    <section
      className="rm-session-expiry"
      role="status"
      aria-label="로그인 세션 만료"
      aria-live="polite"
    >
      <div className="rm-session-expiry__copy">
        <strong>로그인 시간이 만료되었습니다.</strong>
        <span>
          {cause === "write"
            ? "작성 중인 내용은 이 화면에 남아 있습니다. 저장하려면 다시 로그인해 주세요."
            : readCopy}
        </span>
      </div>
      <div className="rm-session-expiry__actions">
        <a className="btn btn-quiet" href={loginHref}>
          재로그인
        </a>
        {canContinueAsGuest ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={isContinuing}
            onClick={() => void continueAsGuest()}
          >
            {isContinuing ? "게스트로 전환 중" : "게스트로 계속 보기"}
          </button>
        ) : null}
      </div>
      {error ? <p role="alert" className="small rm-session-expiry__error">{error}</p> : null}
    </section>
  );
}
