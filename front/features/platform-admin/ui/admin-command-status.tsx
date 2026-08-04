export type AdminCommandStatusProps =
  | {
      state: "ready";
      sourceStatusLabel: string;
      openCount: number;
      generatedAtLabel: string;
    }
  | { state: "loading" }
  | { state: "unavailable" };

export function AdminCommandStatus(props: AdminCommandStatusProps) {
  if (props.state === "loading") {
    return (
      <div className="admin-command-status admin-command-status--loading" role="status">
        운영 신호 확인 중
      </div>
    );
  }

  if (props.state === "unavailable") {
    return (
      <div className="admin-command-status admin-command-status--unavailable" role="status">
        운영 신호 확인 불가 <Separator /> 잠시 후 다시 확인
      </div>
    );
  }

  const isDegraded = props.sourceStatusLabel !== "전체 신호 정상";
  return (
    <div
      className={
        "admin-command-status" + (isDegraded ? " admin-command-status--degraded" : "")
      }
      role={isDegraded ? "status" : undefined}
    >
      <span className="admin-command-status__source">{props.sourceStatusLabel}</span>
      <Separator />
      <span>{props.openCount}건 열림</span>
      <Separator />
      <span>{props.generatedAtLabel} 기준</span>
    </div>
  );
}

function Separator() {
  return (
    <span className="admin-command-status__separator" aria-hidden="true">
      {" · "}
    </span>
  );
}
