import { createContext, useContext, useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { guestNavigationCapability } from "@/features/guest-browse/model/club-app-audience";
import { loginPathForReturnTo } from "@/shared/auth/login-return";

type GuestNavigationLinkProps = {
  to: string;
  state?: unknown;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  "aria-current"?: "page";
  title?: string;
  style?: CSSProperties;
};

type GuestLockTarget = {
  returnTo: string;
  opener: HTMLElement;
};

type GuestNavigationDialogContextValue = {
  openLock: (target: GuestLockTarget) => void;
  LinkComponent: ComponentType<GuestNavigationLinkProps>;
};

const GuestNavigationDialogContext = createContext<GuestNavigationDialogContextValue | null>(null);

function lockDescription(path: string) {
  if (path.includes("/feedback/")) {
    return "Google로 멤버를 시작하면 먼저 보기 멤버가 되고, 호스트 승인 후 정식 멤버가 됩니다.";
  }

  if (path.includes("/notifications")) {
    return "알림과 수신 설정은 정식 멤버가 된 뒤 이어서 관리할 수 있습니다.";
  }

  return "계정 설정은 정식 멤버가 된 뒤 이어서 관리할 수 있습니다.";
}

function GuestLockedDialog({
  target,
  onClose,
  LinkComponent,
}: {
  target: GuestLockTarget;
  onClose: () => void;
  LinkComponent: ComponentType<GuestNavigationLinkProps>;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const closeAndRestoreFocus = () => {
    onClose();
    target.opener.focus();
  };

  return (
    <div className="rm-guest-lock-dialog-backdrop" role="presentation" onMouseDown={closeAndRestoreFocus}>
      <section
        className="surface rm-guest-lock-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-lock-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button ref={closeButtonRef} type="button" className="rm-guest-lock-dialog__close" onClick={closeAndRestoreFocus}>
          닫기
        </button>
        <p className="eyebrow">멤버십 안내</p>
        <h2 id="guest-lock-dialog-title" className="h2 editorial">
          정식 멤버에게 열립니다
        </h2>
        <p className="body" role="status" aria-live="polite">
          {lockDescription(target.returnTo)}
        </p>
        <LinkComponent className="btn btn-primary" to={loginPathForReturnTo(target.returnTo)}>
          멤버로 시작
        </LinkComponent>
      </section>
    </div>
  );
}

export function GuestNavigationProvider({
  children,
  LinkComponent,
}: {
  children: ReactNode;
  LinkComponent: ComponentType<GuestNavigationLinkProps>;
}) {
  const [target, setTarget] = useState<GuestLockTarget | null>(null);
  const value: GuestNavigationDialogContextValue = { openLock: setTarget, LinkComponent };

  return (
    <GuestNavigationDialogContext.Provider value={value}>
      {children}
      {target ? <GuestLockedDialog target={target} onClose={() => setTarget(null)} LinkComponent={LinkComponent} /> : null}
    </GuestNavigationDialogContext.Provider>
  );
}

export function GuestNavigationLink({ to, state: _state, children, ...props }: GuestNavigationLinkProps) {
  void _state;
  const context = useContext(GuestNavigationDialogContext);
  const isScopedAppLink = /^\/clubs\/[^/]+\/app(?:\/|$)/.test(to);
  const isLocked = isScopedAppLink && guestNavigationCapability(to) === "LOCKED";

  if (!isLocked) {
    if (!context) {
      throw new Error("GuestNavigationLink must be rendered inside GuestNavigationProvider.");
    }

    const { LinkComponent } = context;
    return (
      <LinkComponent {...props} to={to}>
        {children}
      </LinkComponent>
    );
  }

  return (
    <button
      {...props}
      type="button"
      onClick={(event) => context?.openLock({ returnTo: to, opener: event.currentTarget })}
    >
      {children}
    </button>
  );
}
