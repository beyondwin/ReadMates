import type { HostFocusFact } from "@/features/host/model/host-session-workspace-model";
import type { HostMeetingRecordReadiness } from "@/features/host/model/host-meeting-record-readiness";
import { formatDateTimeLabel } from "@/shared/ui/readmates-display";

export type MeetingAudienceProjection = {
  audience: "호스트" | "게스트·멤버" | "공개 기록";
  result: string;
};

export function MeetingFocusFacts({
  facts,
  projections = [],
  recordReadiness,
  onRetryReadiness,
}: {
  facts: readonly HostFocusFact[];
  projections?: readonly MeetingAudienceProjection[];
  recordReadiness?: HostMeetingRecordReadiness;
  onRetryReadiness?: () => void;
}) {
  const stale = recordReadiness?.status === "stale";
  const unavailable = recordReadiness?.status === "unavailable";
  const observedAt = stale || unavailable ? recordReadiness.observedAt : null;

  return (
    <section className="rm-focus-deck__facts" aria-label="진행 목록">
      <h2 className="eyebrow">진행 목록</h2>
      <ul className="rm-focus-deck__fact-list">
        {facts.map((fact) => (
          <li key={fact.id} className={`rm-focus-deck__fact is-${fact.tone}`}>
            {fact.label}
          </li>
        ))}
      </ul>
      {projections.length > 0 ? (
        <dl className="rm-focus-deck__projections">
          {projections.map((item) => (
            <div key={item.audience}>
              <dt>{item.audience}</dt>
              <dd>{item.result}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {stale ? (
        <div role="status" className="rm-focus-deck__readiness">
          {observedAt ? `${formatDateTimeLabel(observedAt)}에 확인한 내용을 표시합니다. ` : null}
          최신 확인이 필요한 행동은 잠시 사용할 수 없습니다.
          {onRetryReadiness ? (
            <button type="button" className="btn btn-quiet btn-sm" onClick={onRetryReadiness}>
              최신 내용 확인
            </button>
          ) : null}
        </div>
      ) : null}
      {unavailable ? (
        <div role="alert" className="rm-focus-deck__readiness is-error">
          모임 기록을 확인하지 못했습니다.
          {onRetryReadiness ? (
            <button type="button" className="btn btn-quiet btn-sm" onClick={onRetryReadiness}>
              모임 기록 다시 시도
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
