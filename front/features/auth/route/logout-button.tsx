import { useState, type ButtonHTMLAttributes } from "react";
import { logout } from "@/features/auth/api/auth-api";
import { LogoutButton as LogoutButtonUi } from "@/features/auth/ui/logout-button";
import type { TransitionPublicationSurface } from "@/shared/model/global-space";
import {
  isTransitionOwnerObsoleteError,
  publishTransitionAction,
  useTransitionSafetyOwner,
} from "@/shared/ui/use-transition-safety-owner";

export type LogoutAcceptedPublisher = <T>(
  surface: TransitionPublicationSurface,
  publish: () => T | Promise<T>,
) => Promise<T>;

export type LogoutAcceptedHandler = (publish: LogoutAcceptedPublisher) => void | Promise<void>;

type LogoutButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type"> & {
  onLogoutAccepted: LogoutAcceptedHandler;
};

export function LogoutButton({ onLogoutAccepted, ...props }: LogoutButtonProps) {
  const transitionOwner = useTransitionSafetyOwner("authenticated-logout");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logoutAndPublish = async () => {
    if (pending) return;
    const operationId = `authenticated-logout-${globalThis.crypto.randomUUID()}`;
    const handle = transitionOwner.begin(operationId, "L1", async () => ({
      operationId,
      outcome: "still-unknown",
    }));
    setPending(true);
    setError(null);
    let resolved = false;
    try {
      const response = await logout();
      const succeeded = response.ok || response.status === 401;
      if (await handle.settle(succeeded ? "succeeded" : "failed") !== "accepted") return;
      resolved = true;
      if (succeeded) {
        await onLogoutAccepted((surface, publish) => publishTransitionAction(handle, surface, publish));
      } else {
        await publishTransitionAction(handle, "errorCopy", () => {
          setError("로그아웃에 실패했습니다. 잠시 후 다시 시도해 주세요.");
          setPending(false);
        });
      }
    } catch (caught) {
      if (isTransitionOwnerObsoleteError(caught)) return;
      // A transport failure can mean the server committed logout. Keep the
      // registered operation unknown and prevent a duplicate request.
    } finally {
      // Transport ambiguity must remain registered so unmount can reconcile it.
      if (resolved) handle.completePublication();
    }
  };

  return <LogoutButtonUi {...props} pending={pending} error={error} onLogout={() => { void logoutAndPublish(); }} />;
}
