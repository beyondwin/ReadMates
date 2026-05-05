import type { CSSProperties } from "react";
import type { HostSessionDetailResponse } from "@/features/host/ui/host-ui-types";
import {
  hostSessionStateLabel,
  recordVisibilityLabel,
  type SessionRecordVisibility,
} from "@/features/host/model/host-session-editor-model";

type SaveState = "idle" | "saving" | "saved" | "error";

export function DocumentStatePanel({
  session,
  saveState,
  recordVisibility,
  hasPublicationRecord,
  feedbackDocumentUploaded,
}: {
  session?: HostSessionDetailResponse | null;
  saveState: SaveState;
  recordVisibility: SessionRecordVisibility;
  hasPublicationRecord: boolean;
  feedbackDocumentUploaded: boolean;
}) {
  const rows = [
    {
      label: "문서 상태",
      value: session ? hostSessionStateLabel(session.state) : "새 예정 세션",
      className: sessionStateBadgeClass(session?.state),
    },
    {
      label: "기본 정보",
      value: saveState === "saving" ? "기본 정보 저장 중" : saveState === "error" ? "저장 실패" : session ? "저장됨" : "저장 전",
      className: saveState === "error" ? "badge badge-warn badge-dot" : saveState === "saving" ? "badge badge-accent badge-dot" : "badge",
    },
    {
      label: "공개 기록",
      value: hasPublicationRecord ? recordVisibilityLabel(recordVisibility) : "기록 없음",
      className: recordVisibilityBadgeClass(recordVisibility),
    },
    {
      label: "피드백",
      value: feedbackDocumentUploaded ? "문서 등록" : "미등록",
      className: feedbackDocumentUploaded ? "badge badge-ok badge-dot" : "badge",
    },
    {
      label: "참석 명단",
      value: session ? `${session.attendees.length}명` : "세션 저장 후",
      className: session?.attendees.length ? "badge badge-ok badge-dot" : "badge",
    },
  ];

  return (
    <div className="rm-document-panel" style={{ padding: "22px" }}>
      <div className="eyebrow" style={{ marginBottom: "10px" }}>
        문서 상태
      </div>
      <div className="stack" style={{ "--stack": "9px" } as CSSProperties}>
        {rows.map((row) => (
          <div key={row.label} className="row-between" style={{ gap: 12 }}>
            <span className="small" style={{ color: "var(--text-2)" }}>
              {row.label}
            </span>
            <span className={row.className}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function sessionStateBadgeClass(state?: HostSessionDetailResponse["state"]) {
  if (state === "OPEN") {
    return "badge badge-accent badge-dot";
  }

  if (state === "PUBLISHED") {
    return "badge badge-ok badge-dot";
  }

  if (state === "CLOSED") {
    return "badge badge-warn badge-dot";
  }

  return "badge";
}

function recordVisibilityBadgeClass(visibility: SessionRecordVisibility) {
  if (visibility === "PUBLIC") {
    return "badge badge-ok badge-dot";
  }

  if (visibility === "MEMBER") {
    return "badge badge-accent badge-dot";
  }

  return "badge";
}
