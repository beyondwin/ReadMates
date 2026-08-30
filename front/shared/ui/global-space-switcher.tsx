import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { SpaceIdentity } from "../model/global-space";
import { sameSpaceIdentity, spaceIdentityKey } from "../model/global-space";
import { SelectorChevron } from "./workspace-selector";

export type GlobalSpaceSwitcherOption = {
  identity: SpaceIdentity;
  clubName?: string;
};

export type GlobalSpaceSelectionResult =
  | { status: "selected" | "cancelled" }
  | { status: "blocked" | "unavailable"; message: string };

export type GlobalSpaceSwitcherProps = {
  currentIdentity: SpaceIdentity | null;
  options: ReadonlyArray<GlobalSpaceSwitcherOption>;
  onSelect: (identity: SpaceIdentity) => Promise<GlobalSpaceSelectionResult>;
};

type ClubOptionGroup = {
  id: string;
  name: string;
  options: GlobalSpaceSwitcherOption[];
};

const TARGET_STYLE = { minHeight: "44px" } as const;

function currentSpaceLabel(
  currentIdentity: SpaceIdentity | null,
  options: ReadonlyArray<GlobalSpaceSwitcherOption>,
) {
  if (!currentIdentity) return "현재 공간을 확인할 수 없습니다";
  if (currentIdentity.productSpace === "platform") return "현재 공간 플랫폼 운영";
  const current = options.find((option) => sameSpaceIdentity(option.identity, currentIdentity));
  const clubName = current?.clubName?.trim() || "현재 클럽";
  const perspective = currentIdentity.perspective === "host" ? "호스트로 운영" : "멤버로 보기";
  return `현재 공간 내 클럽, ${clubName} ${perspective}`;
}

function visibleTriggerLabel(currentIdentity: SpaceIdentity | null) {
  return currentIdentity?.productSpace === "clubs" ? "내 클럽" : "플랫폼 운영";
}

function perspectiveLabel(identity: SpaceIdentity) {
  return identity.productSpace === "clubs" && identity.perspective === "host"
    ? "호스트로 운영"
    : "멤버로 보기";
}

function normalizeOptions(options: ReadonlyArray<GlobalSpaceSwitcherOption>) {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = spaceIdentityKey(option.identity);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clubGroups(options: ReadonlyArray<GlobalSpaceSwitcherOption>): ClubOptionGroup[] {
  const groups = new Map<string, ClubOptionGroup>();
  for (const option of options) {
    if (option.identity.productSpace !== "clubs") continue;
    const key = `${option.identity.clubId}:${option.identity.clubSlug}`;
    const existing = groups.get(key);
    if (existing) {
      existing.options.push(option);
    } else {
      groups.set(key, {
        id: key,
        name: option.clubName?.trim() || "이름을 확인할 수 없는 클럽",
        options: [option],
      });
    }
  }
  return [...groups.values()];
}

function nextMenuIndex(
  current: number,
  length: number,
  key: "ArrowDown" | "ArrowUp" | "Home" | "End",
) {
  if (length <= 0) return 0;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  if (key === "ArrowDown") return (current + 1) % length;
  return (current - 1 + length) % length;
}

export function GlobalSpaceSwitcher({
  currentIdentity,
  options,
  onSelect,
}: GlobalSpaceSwitcherProps) {
  const normalizedOptions = useMemo(() => normalizeOptions(options), [options]);
  const productKinds = new Set(normalizedOptions.map((option) => option.identity.productSpace));
  const currentLabel = currentSpaceLabel(currentIdentity, normalizedOptions);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusReturnTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const menuId = useId();
  const groups = clubGroups(normalizedOptions);

  useEffect(() => () => {
    if (focusReturnTimerRef.current !== null) {
      globalThis.clearTimeout(focusReturnTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (open) itemRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  useEffect(() => {
    if (!open) return;

    const dismiss = (deferFocus = false) => {
      setOpen(false);
      const returnFocus = () => triggerRef.current?.focus();
      if (!deferFocus) {
        returnFocus();
        return;
      }
      if (focusReturnTimerRef.current !== null) {
        globalThis.clearTimeout(focusReturnTimerRef.current);
      }
      focusReturnTimerRef.current = globalThis.setTimeout(() => {
        focusReturnTimerRef.current = null;
        returnFocus();
      }, 0);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) dismiss(true);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      dismiss();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (productKinds.size <= 1) {
    return <span className="sr-only">{currentLabel}</span>;
  }

  const openMenu = () => {
    const currentIndex = normalizedOptions.findIndex((option) => (
      currentIdentity !== null && sameSpaceIdentity(option.identity, currentIdentity)
    ));
    setActiveIndex(currentIndex >= 0 ? currentIndex : 0);
    setError(null);
    setOpen(true);
  };

  const closeMenu = () => {
    setOpen(false);
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " " && event.key !== "ArrowDown") return;
    event.preventDefault();
    openMenu();
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") {
      return;
    }
    event.preventDefault();
    setActiveIndex((current) => nextMenuIndex(current, normalizedOptions.length, event.key));
  };

  const select = async (option: GlobalSpaceSwitcherOption) => {
    if (busyKey !== null) return;
    if (currentIdentity && sameSpaceIdentity(option.identity, currentIdentity)) {
      closeMenu();
      return;
    }
    const key = spaceIdentityKey(option.identity);
    setBusyKey(key);
    setError(null);
    try {
      const result = await onSelect(option.identity);
      if (result.status === "selected") {
        setOpen(false);
      } else if (result.status === "blocked" || result.status === "unavailable") {
        setError(result.message);
      }
    } catch {
      setError("공간을 열지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusyKey(null);
    }
  };

  const renderOption = (option: GlobalSpaceSwitcherOption, index: number, accessibleName: string) => {
    const key = spaceIdentityKey(option.identity);
    const current = currentIdentity !== null && sameSpaceIdentity(option.identity, currentIdentity);
    return (
      <button
        key={key}
        ref={(node) => { itemRefs.current[index] = node; }}
        type="button"
        role="menuitemradio"
        aria-checked={current}
        aria-label={accessibleName}
        tabIndex={activeIndex === index ? 0 : -1}
        className="rm-global-space-switcher__item"
        style={TARGET_STYLE}
        disabled={busyKey !== null}
        onClick={() => void select(option)}
      >
        {option.identity.productSpace === "platform" ? (
          <span className="rm-global-space-switcher__primary-label">플랫폼 운영</span>
        ) : (
          <span>{perspectiveLabel(option.identity)}</span>
        )}
        {current ? <span className="rm-global-space-switcher__current">현재</span> : null}
      </button>
    );
  };

  let optionIndex = 0;
  const platformOption = normalizedOptions.find((option) => option.identity.productSpace === "platform");

  return (
    <div ref={rootRef} className="rm-global-space-switcher">
      <button
        ref={triggerRef}
        type="button"
        className="rm-global-space-switcher__trigger"
        style={TARGET_STYLE}
        aria-label={`공간 전환, ${currentLabel.replace("현재 공간 ", "현재 ")}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        onClick={() => open ? closeMenu() : openMenu()}
        onKeyDown={onTriggerKeyDown}
      >
        <strong>{visibleTriggerLabel(currentIdentity)}</strong>
        <SelectorChevron />
      </button>
      {open ? (
        <div
          id={menuId}
          className="rm-global-space-switcher__menu"
          role="menu"
          aria-label="ReadMates 공간 전환"
          onKeyDown={onMenuKeyDown}
        >
          <p className="rm-global-space-switcher__section-label">현재 범위</p>
          {platformOption ? renderOption(platformOption, optionIndex++, "플랫폼 운영") : null}
          <div className="rm-global-space-switcher__club-section" role="group" aria-label="내 클럽">
            <p className="rm-global-space-switcher__section-label">내 클럽</p>
            {groups.map((group) => (
              <div key={group.id} className="rm-global-space-switcher__club" role="group" aria-label={group.name}>
                <p className="rm-global-space-switcher__club-name">{group.name}</p>
                <div className="rm-global-space-switcher__perspectives">
                  {group.options.map((option) => renderOption(
                    option,
                    optionIndex++,
                    `${group.name} ${perspectiveLabel(option.identity)}`,
                  ))}
                </div>
              </div>
            ))}
          </div>
          {busyKey ? <p className="rm-global-space-switcher__status" role="status">공간을 여는 중</p> : null}
          {error ? <p className="rm-global-space-switcher__error" role="alert">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
