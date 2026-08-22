import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link } from "react-router";
import {
  adminWorkspaceMenuIndex,
  type AdminWorkspaceDestination,
} from "@/features/platform-admin/model/admin-workspace-switcher-model";

type Props = {
  accountLabel: string;
  destinations: AdminWorkspaceDestination[];
  onOtherAccountLogin: () => Promise<boolean>;
};

export function AdminWorkspaceSwitcher({ accountLabel, destinations, onOtherAccountLogin }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const focusReturnTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const menuId = useId();
  const itemCount = destinations.length + 1;

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
    itemRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

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

  async function handleOtherAccountLogin() {
    setBusy(true);
    setError(null);
    try {
      const ok = await onOtherAccountLogin();
      if (!ok) {
        setError("로그아웃에 실패했습니다. 다시 시도해 주세요.");
      }
    } catch {
      setError("로그아웃에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  function openMenuFromKeyboard(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "Enter" && event.key !== " " && event.key !== "ArrowDown") {
      return;
    }
    event.preventDefault();
    setActiveIndex(0);
    setOpen(true);
  }

  function toggleMenu() {
    if (open) {
      setOpen(false);
      return;
    }
    setActiveIndex(0);
    setOpen(true);
  }

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") {
      return;
    }
    event.preventDefault();
    setActiveIndex((current) => adminWorkspaceMenuIndex(current, itemCount, event.key));
  }

  return (
    <div ref={rootRef} className="admin-workspace-switcher">
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-ghost btn-sm admin-workspace-switcher__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        onClick={toggleMenu}
        onKeyDown={openMenuFromKeyboard}
      >
        내 공간
      </button>
      {open ? (
        <div
          id={menuId}
          className="admin-workspace-switcher__menu"
          role="menu"
          aria-label="내 ReadMates 공간"
          onKeyDown={onMenuKeyDown}
        >
          <div className="admin-workspace-switcher__head">
            <p className="eyebrow">내 ReadMates 공간</p>
            <p className="tiny muted">{accountLabel}</p>
          </div>
          <div className="admin-workspace-switcher__list">
            {destinations.length === 0 ? (
              <p className="small admin-workspace-switcher__empty">이 계정으로 열 수 있는 클럽이 없습니다.</p>
            ) : (
              destinations.map((destination, index) => (
                <Link
                  key={destination.id}
                  ref={(node) => {
                    itemRefs.current[index] = node;
                  }}
                  to={destination.href}
                  role="menuitem"
                  tabIndex={activeIndex === index ? 0 : -1}
                  aria-label={`${destination.clubName} ${destination.label}`}
                  className={`admin-workspace-switcher__item admin-workspace-switcher__item--${destination.priority}`}
                >
                  <span className="admin-workspace-switcher__club">{destination.clubName}</span>
                  <span className="admin-workspace-switcher__meta">
                    <span className="badge">{destination.role}</span>
                    <span className="badge">{destination.status}</span>
                    <span>{destination.label}</span>
                  </span>
                </Link>
              ))
            )}
          </div>
          <div className="admin-workspace-switcher__footer">
            <button
              ref={(node) => {
                itemRefs.current[destinations.length] = node;
              }}
              type="button"
              role="menuitem"
              tabIndex={activeIndex === destinations.length ? 0 : -1}
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => void handleOtherAccountLogin()}
            >
              {busy ? "로그아웃 중" : "다른 계정으로 로그인"}
            </button>
            {error ? (
              <p className="small admin-workspace-switcher__error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
