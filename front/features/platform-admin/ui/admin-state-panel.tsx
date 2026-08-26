import type { ReactNode } from "react";

export type AdminPageState =
  | "loading"
  | "empty"
  | "partial"
  | "stale"
  | "unavailable"
  | "forbidden"
  | "ready";

export type AdminStateSource = {
  id: string;
  label: ReactNode;
  available: boolean;
  detail?: ReactNode;
};

export type AdminStatePanelProps = {
  state: AdminPageState;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  sources?: readonly AdminStateSource[];
  children?: ReactNode;
};

const DEFAULT_COPY: Record<Exclude<AdminPageState, "ready">, { title: string; description: string }> = {
  loading: {
    title: "불러오는 중",
    description: "",
  },
  empty: {
    title: "표시할 항목이 없습니다",
    description: "지금은 확인할 내용이 없습니다.",
  },
  partial: {
    title: "일부만 확인됨",
    description: "실패한 원천은 아래에 표시합니다. 확인된 내용은 그대로 사용할 수 있습니다.",
  },
  stale: {
    title: "최신 상태가 아닙니다",
    description: "관측 시각이 지난 근거입니다. 새로 고친 뒤 작업을 이어가세요.",
  },
  unavailable: {
    title: "지금은 확인할 수 없습니다",
    description: "잠시 후 다시 시도해 주세요.",
  },
  forbidden: {
    title: "권한이 없습니다",
    description: "이 화면을 볼 권한이 없습니다.",
  },
};

export function AdminStatePanel({
  state,
  title,
  description,
  action,
  sources,
  children,
}: AdminStatePanelProps) {
  if (state === "ready") {
    return <div className="admin-state-panel admin-state-panel--ready">{children}</div>;
  }

  const copy = DEFAULT_COPY[state];
  const heading = title ?? copy.title;
  const detail = description ?? copy.description;
  const notice = (
    <>
      <h2 className="admin-state-panel__title">{heading}</h2>
      {detail ? <p className="admin-state-panel__description">{detail}</p> : null}
      {state === "partial" && sources && sources.length > 0 ? (
        <ul className="admin-state-panel__sources">
          {sources.map((source) => (
            <li key={source.id} data-available={source.available ? "true" : "false"}>
              <span className="admin-state-panel__source-label">{source.label}</span>
              {source.available ? null : (
                <span className="admin-state-panel__source-detail">{source.detail ?? "확인 불가"}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {action ? <div className="admin-state-panel__action">{action}</div> : null}
    </>
  );

  if (state === "partial" || state === "stale") {
    return (
      <div className={`admin-state-panel admin-state-panel--${state}`}>
        <div className="admin-state-panel__notice" role="status">
          {notice}
        </div>
        {children}
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="admin-state-panel admin-state-panel--loading" role="status">
        {notice}
        {children}
      </div>
    );
  }

  if (state === "empty") {
    return <div className="admin-state-panel admin-state-panel--empty">{notice}</div>;
  }

  return (
    <div className={`admin-state-panel admin-state-panel--${state}`} role="alert">
      {notice}
    </div>
  );
}
