import type { ComponentType, KeyboardEvent, ReactNode } from "react";
import type { HostWorkboxView } from "@/features/host/model/host-workbox-model";
import { HostWorkItem, type HostWorkboxDeferralOption } from "./host-work-item";
import "./host-workbox.css";

type HostWorkboxState = HostWorkboxView["state"];

type WorkboxLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
};

const tabs = [
  ["NOW", "지금"],
  ["DEFERRED", "보류"],
  ["COMPLETED", "완료"],
] as const satisfies readonly (readonly [HostWorkboxState, string])[];

export type HostWorkboxProps = {
  state: HostWorkboxState;
  view: HostWorkboxView | null;
  loading: boolean;
  error: string | null;
  pendingKey: string | null;
  rowError?: { key: string; message: string } | null;
  onStateChange: (state: HostWorkboxState) => void;
  onRetry: () => void;
  onLoadMore: (cursor: string) => void;
  onDefer: (key: string, option: HostWorkboxDeferralOption) => void;
  onUndoDeferral: (key: string) => void;
  LinkComponent?: ComponentType<WorkboxLinkProps>;
};

export function HostWorkbox({
  state,
  view,
  loading,
  error,
  pendingKey,
  rowError = null,
  onStateChange,
  onRetry,
  onLoadMore,
  onDefer,
  onUndoDeferral,
  LinkComponent,
}: HostWorkboxProps) {
  const loadedView = !loading && !error && view?.state === state ? view : null;
  const activeCount = loadedView?.items.length ?? null;
  const hasContinuation = loadedView?.nextCursor !== null && loadedView !== null;

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + direction + tabs.length) % tabs.length;
    onStateChange(tabs[nextIndex][0]);
    const tablist = event.currentTarget.closest('[role="tablist"]');
    (tablist?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex])?.focus();
  };

  return (
    <section className="rm-host-workbox" aria-labelledby="host-workbox-title">
      <header className="rm-host-workbox__header">
        <div>
          <h2 id="host-workbox-title">작업함</h2>
          <p>모임 밖에서도 이어지는 운영 작업</p>
        </div>
      </header>

      <div className="rm-host-workbox__tabs" role="tablist" aria-label="작업함 상태">
        {tabs.map(([value, label], index) => {
          const suffix = hasContinuation ? "+" : "";
          return (
            <button
              key={value}
              id={`host-workbox-tab-${value.toLowerCase()}`}
              type="button"
              role="tab"
              aria-selected={state === value}
              aria-controls="host-workbox-panel"
              tabIndex={state === value ? 0 : -1}
              onClick={() => onStateChange(value)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {label} {value === state && activeCount !== null ? <span>{activeCount}{suffix}</span> : null}
            </button>
          );
        })}
      </div>

      <div
        id="host-workbox-panel"
        className="rm-host-workbox__panel"
        role="tabpanel"
        aria-labelledby={`host-workbox-tab-${state.toLowerCase()}`}
      >
        {loading && !view ? <p role="status">작업함을 불러오는 중입니다.</p> : null}
        {error ? (
          <div className="rm-host-workbox__error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={onRetry}>다시 불러오기</button>
          </div>
        ) : null}

        {view ? (
          <>
            <p className="rm-host-workbox__page-count">
              현재 묶음 기준 · {view.nextCursor ? "다음 묶음 있음" : `끝 · ${view.items.length}건`}
            </p>
            {view.partialWarnings.length > 0 ? (
              <div className="rm-host-workbox__partial" role="alert">
                <ul>
                  {view.partialWarnings.map((warning) => <li key={warning.type}>{warning.message}</li>)}
                </ul>
                <button type="button" onClick={onRetry}>현재 묶음 다시 불러오기</button>
              </div>
            ) : null}

            {view.items.length === 0 && view.partialWarnings.length === 0 ? (
              <p className="rm-host-workbox__empty">{emptyMessage(state)}</p>
            ) : null}

            {view.items.length > 0 ? (
              <ul className="rm-host-workbox__items">
                {view.items.map((item) => (
                  <HostWorkItem
                    key={item.key}
                    item={item}
                    pending={pendingKey === item.key}
                    error={rowError?.key === item.key ? rowError.message : null}
                    onDefer={onDefer}
                    onUndoDeferral={onUndoDeferral}
                    LinkComponent={LinkComponent}
                  />
                ))}
              </ul>
            ) : null}

            {view.nextCursor ? (
              <button
                type="button"
                className="rm-host-workbox__load-more"
                disabled={loading}
                onClick={() => onLoadMore(view.nextCursor!)}
              >
                {loading ? "다음 묶음 불러오는 중" : "다음 묶음 불러오기"}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

function emptyMessage(state: HostWorkboxState): string {
  if (state === "DEFERRED") return "보류한 작업이 없습니다.";
  if (state === "COMPLETED") return "완료된 작업이 없습니다.";
  return "지금 처리할 작업이 없습니다.";
}
