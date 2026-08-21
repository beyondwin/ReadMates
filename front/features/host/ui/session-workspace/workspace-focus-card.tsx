import type { ReactNode } from "react";
import type { HostSessionWorkspaceView } from "@/features/host/model/host-session-workspace-model";
import type { HostSessionEditorLinkComponent } from "@/features/host/ui/session-editor/session-editor-links";
import { DefaultLinkComponent } from "@/features/host/ui/session-editor/session-editor-links";

type WorkspaceFocusCopy = {
  title: string;
  description: string;
};

const FOCUS_COPY: Record<string, WorkspaceFocusCopy> = {
  OPEN_SESSION: {
    title: "멤버와 준비 시작",
    description: "필수 정보를 확인한 뒤 멤버 활동을 엽니다.",
  },
  REVIEW_MEMBER_INPUT: {
    title: "멤버 응답 확인하기",
    description: "참석 응답과 질문을 확인합니다.",
  },
  CHECK_ATTENDANCE: {
    title: "출석 확인하기",
    description: "모임 당일 출석을 확인합니다.",
  },
  FINISH_SESSION: {
    title: "모임 마치기",
    description: "모임을 마치면 참석과 질문이 멈춥니다. 기록은 남습니다.",
  },
  UPLOAD_RECORD: {
    title: "정리본 올리기",
    description: "정리본을 올린 뒤 기록을 공개할 수 있습니다.",
  },
  FIX_RECORD: {
    title: "반영 전 확인",
    description: "초안을 확인한 뒤 기록에 반영합니다.",
  },
  REVIEW_RECORD: {
    title: "기록에 반영",
    description: "저장된 초안을 기록에 반영합니다.",
  },
  PUBLISH_RECORD: {
    title: "기록 공개",
    description: "멤버 노트·아카이브에 나갑니다.",
  },
  VIEW_PUBLIC_RECORD: {
    title: "공개 기록 보기",
    description: "멤버에게 보이는 결과입니다.",
  },
};

function focusCopyFor(kind: string, descriptionOverride?: string | null): WorkspaceFocusCopy {
  const copy = FOCUS_COPY[kind] ?? {
    title: "지금 할 일",
    description: "이 모임의 다음 작업을 이어서 하세요.",
  };
  return descriptionOverride ? { ...copy, description: descriptionOverride } : copy;
}

export function WorkspaceFocusCard({
  view,
  onPrimaryAction,
  primaryActionDisabled = false,
  primaryActionReason = null,
  publicRecordHref = null,
  reverseAction = null,
  onCreateRevision = null,
  error = null,
  descriptionOverride = null,
  children,
  LinkComponent = DefaultLinkComponent,
}: {
  view: HostSessionWorkspaceView;
  onPrimaryAction: () => void;
  primaryActionDisabled?: boolean;
  primaryActionReason?: string | null;
  publicRecordHref?: string | null;
  reverseAction?: { label: string; onClick: () => void } | null;
  onCreateRevision?: (() => void) | null;
  error?: { message: string; onRetry: () => void } | null;
  descriptionOverride?: string | null;
  children?: ReactNode;
  LinkComponent?: HostSessionEditorLinkComponent;
}) {
  const copy = focusCopyFor(view.primaryAction.kind, descriptionOverride);
  const label = view.primaryAction.label;
  const publishBlocked = view.primaryAction.kind === "PUBLISH_RECORD" && !view.publicationReady;
  const disabled = primaryActionDisabled || publishBlocked;
  const reason = primaryActionReason
    ?? (publishBlocked ? "공개 조건을 먼저 확인해 주세요." : null);

  return (
    <section className="surface rm-host-session-workspace__focus" aria-label="지금 할 일">
      <div className="eyebrow">지금 할 일</div>
      <h2 id="workspace-focus-title" className="h3 editorial">
        {copy.title}
      </h2>
      <p className="small rm-host-session-workspace__focus-copy">{copy.description}</p>
      {children}
      {error ? (
        <div className="rm-host-session-workspace__focus-error" role="alert">
          <p className="small">{error.message}</p>
          <button type="button" className="btn btn-quiet btn-sm" onClick={error.onRetry}>
            다시 시도
          </button>
        </div>
      ) : null}
      {reason ? (
        <p className="small rm-host-session-workspace__focus-reason">{reason}</p>
      ) : null}
      <div className="rm-host-session-workspace__focus-actions">
        {publicRecordHref && view.primaryAction.kind === "VIEW_PUBLIC_RECORD" ? (
          <LinkComponent
            to={publicRecordHref}
            className="btn btn-primary rm-host-session-workspace__cta--desktop"
          >
            {label}
          </LinkComponent>
        ) : (
          <button
            type="button"
            className="btn btn-primary rm-host-session-workspace__cta--desktop"
            disabled={disabled}
            onClick={onPrimaryAction}
          >
            {label}
          </button>
        )}
        {onCreateRevision ? (
          <button type="button" className="btn btn-quiet" onClick={onCreateRevision}>
            수정본 만들기
          </button>
        ) : null}
        {reverseAction ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={reverseAction.onClick}>
            {reverseAction.label}
          </button>
        ) : null}
      </div>
    </section>
  );
}
