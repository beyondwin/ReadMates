import { useState, type CSSProperties } from "react";
import type {
  AiEvidenceExcerpt,
  ExpandedEvidenceTurn,
} from "../api/aigen-contracts";

export type EvidencePanelProps = {
  targetId: string | null;
  targetLabel: string | null;
  evidence: AiEvidenceExcerpt[];
  revision: number;
  invalidated: boolean;
  onExpand: (turnId: string, revision: number) => Promise<ExpandedEvidenceTurn>;
};

function timestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

export function EvidencePanel({
  targetId,
  targetLabel,
  evidence,
  revision,
  invalidated,
  onExpand,
}: EvidencePanelProps) {
  const [expanded, setExpanded] = useState<Record<string, ExpandedEvidenceTurn>>({});
  const [errorTurnId, setErrorTurnId] = useState<string | null>(null);

  if (!targetId || !targetLabel) {
    return <p className="small" style={{ color: "var(--text-2)" }}>확인할 결과 블록을 선택해 주세요.</p>;
  }
  if (invalidated) {
    return (
      <div className="small" role="status">
        <strong>직접 수정됨 — AI 근거 비활성</strong>
        <p style={{ color: "var(--text-2)", marginBottom: 0 }}>
          수정된 내용은 호스트가 직접 확인해야 하며 이전 AI 근거를 연결하지 않습니다.
        </p>
      </div>
    );
  }

  const selected = evidence.filter((item) => item.targetId === targetId);
  return (
    <section aria-labelledby="aigen-evidence-heading" className="stack" style={{ "--stack": "10px" } as CSSProperties}>
      <header>
        <h2 id="aigen-evidence-heading" className="eyebrow" style={{ margin: 0 }}>근거 · {targetLabel}</h2>
        <p className="tiny" style={{ color: "var(--text-2)", margin: "6px 0 0" }}>
          연결된 발언은 출처를 확인하기 위한 정보입니다. 호스트가 결과 문장을 의미상 뒷받침하는지 판단해 주세요.
        </p>
      </header>
      {selected.length === 0 ? (
        <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
          이 결과 블록에 표시할 근거가 없습니다.
        </p>
      ) : (
        <ul className="stack" style={{ "--stack": "8px", listStyle: "none", padding: 0, margin: 0 } as CSSProperties}>
          {selected.map((item) => {
            const full = expanded[item.turnId];
            return (
              <li key={item.turnId} className="surface-quiet" style={{ padding: 10 }}>
                <div className="tiny" style={{ color: "var(--text-2)" }}>
                  {item.speakerName} · {timestamp(item.startSeconds)}
                </div>
                <p className="small" style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>
                  {full?.text ?? item.excerpt}
                </p>
                {item.truncated && !full ? (
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    onClick={() => {
                      setErrorTurnId(null);
                      void onExpand(item.turnId, revision)
                        .then((turn) => setExpanded((current) => ({ ...current, [item.turnId]: turn })))
                        .catch(() => setErrorTurnId(item.turnId));
                    }}
                  >
                    전체 발언 보기
                  </button>
                ) : null}
                {errorTurnId === item.turnId ? (
                  <div className="tiny" role="alert" style={{ color: "var(--danger)" }}>
                    현재 revision의 발언을 불러오지 못했습니다.
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
