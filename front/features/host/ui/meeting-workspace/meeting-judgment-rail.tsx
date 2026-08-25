import type { ReactNode } from "react";

export type MeetingPrimaryActionModel = {
  kind: string;
  label: string;
  disabled?: boolean;
  reason?: string | null;
};

export type MeetingJudgmentModel = {
  title: string;
  summary: string;
  checks: ReadonlyArray<string>;
  projections: ReadonlyArray<{ audience: "호스트" | "게스트·멤버" | "공개 기록"; result: string }>;
  secondaryActions?: ReactNode;
};

export function MeetingJudgmentRail({
  judgment,
  primaryAction,
  onPrimaryAction,
}: {
  judgment: MeetingJudgmentModel;
  primaryAction: MeetingPrimaryActionModel;
  onPrimaryAction: () => void;
}) {
  return (
    <aside className="rm-meeting-judgment" aria-label={judgment.title}>
      <h2 className="h3 editorial">{judgment.title}</h2>
      <p className="rm-meeting-judgment__summary">{judgment.summary}</p>
      {judgment.checks.length > 0 ? (
        <ul className="rm-meeting-judgment__checks">
          {judgment.checks.map((check) => <li key={check}>{check}</li>)}
        </ul>
      ) : null}
      <dl className="rm-meeting-judgment__projection">
        {judgment.projections.map((item) => (
          <div key={item.audience}>
            <dt>{item.audience}</dt>
            <dd>{item.result}</dd>
          </div>
        ))}
      </dl>
      {primaryAction.reason ? <p className="small muted">{primaryAction.reason}</p> : null}
      <button
        type="button"
        className="btn btn-primary rm-meeting-judgment__primary"
        disabled={primaryAction.disabled}
        onClick={onPrimaryAction}
      >
        {primaryAction.label}
      </button>
      {judgment.secondaryActions ? <div className="rm-meeting-judgment__secondary">{judgment.secondaryActions}</div> : null}
    </aside>
  );
}
