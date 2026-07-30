import {
  type ComponentType,
  type MouseEventHandler,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { AvatarChip } from "@/shared/ui/avatar-chip";

type AccountMenuLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

export type AccountMenuLinkComponent = ComponentType<AccountMenuLinkProps>;

export type AccountMenuProps = {
  memberName: string;
  membershipLabel: string;
  mySpaceHref: string;
  settingsHref: string;
  LinkComponent: AccountMenuLinkComponent;
  LogoutControl: ReactNode;
};

export function AccountMenu({
  memberName,
  membershipLabel,
  mySpaceHref,
  settingsHref,
  LinkComponent,
  LogoutControl,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusReturnTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const dialogId = useId();
  const dialogLabelId = useId();

  useEffect(
    () => () => {
      if (focusReturnTimerRef.current !== null) {
        globalThis.clearTimeout(focusReturnTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const returnFocus = () => {
      triggerRef.current?.focus();
    };
    const dismissAndReturnFocus = (deferFocus = false) => {
      setOpen(false);
      if (deferFocus) {
        if (focusReturnTimerRef.current !== null) {
          globalThis.clearTimeout(focusReturnTimerRef.current);
        }
        focusReturnTimerRef.current = globalThis.setTimeout(() => {
          focusReturnTimerRef.current = null;
          returnFocus();
        }, 0);
      } else {
        returnFocus();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        dismissAndReturnFocus(true);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissAndReturnFocus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const closeMenu = () => {
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="rm-account-menu">
      <button
        ref={triggerRef}
        type="button"
        className="rm-account-menu__trigger"
        aria-label={`${memberName} 계정 메뉴`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={dialogId}
        onClick={() => setOpen((current) => !current)}
      >
        <AvatarChip name={memberName} label="" size={28} />
      </button>
      {open ? (
        <div
          id={dialogId}
          className="rm-account-menu__popover"
          role="dialog"
          aria-modal="false"
          aria-labelledby={dialogLabelId}
        >
          <div className="rm-account-menu__identity">
            <strong id={dialogLabelId} className="rm-account-menu__member-name">
              {memberName}
            </strong>
            <span className="rm-account-menu__membership">{membershipLabel}</span>
          </div>
          <div className="rm-account-menu__items">
            <LinkComponent to={mySpaceHref} className="rm-account-menu__item" onClick={closeMenu}>
              내 공간
            </LinkComponent>
            <LinkComponent to={settingsHref} className="rm-account-menu__item" onClick={closeMenu}>
              계정 설정
            </LinkComponent>
          </div>
          <div className="rm-account-menu__logout-control">{LogoutControl}</div>
        </div>
      ) : null}
    </div>
  );
}
