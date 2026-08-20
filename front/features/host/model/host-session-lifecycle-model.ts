import type { HostSessionState } from "./host-session-editor-model";
import type { HostSessionDetailResponse } from "./host-view-types";

export type HostSessionLifecycleResult =
  | { ok: true; session: HostSessionDetailResponse }
  | { ok: false; message: string; openSessionId: string | null };

export type SessionLifecycleConfirmKind =
  | "open"
  | "close"
  | "publish"
  | "reopen"
  | "unpublish"
  | "return-to-draft";

export type SessionLifecycleConfirmCopy = {
  kind: SessionLifecycleConfirmKind;
  title: string;
  body: string;
  confirmLabel: string;
  successFlash: string;
};

type ReverseLifecycleAction = {
  kind: Extract<SessionLifecycleConfirmKind, "reopen" | "unpublish" | "return-to-draft">;
  label: string;
};

const confirmCopyByKind: Record<SessionLifecycleConfirmKind, SessionLifecycleConfirmCopy> = {
  open: {
    kind: "open",
    title: "멤버에게 열기",
    body: "멤버 참석과 질문이 시작됩니다.",
    confirmLabel: "멤버에게 열기",
    successFlash: "모임을 열었습니다.",
  },
  close: {
    kind: "close",
    title: "모임 마치기",
    body: "모임을 마치면 참석과 질문이 멈춥니다. 기록은 남습니다.",
    confirmLabel: "모임 마치기",
    successFlash: "모임을 마쳤습니다.",
  },
  publish: {
    kind: "publish",
    title: "기록 공개",
    body: "멤버 노트·아카이브에 나갑니다. 공개 배치가 켜져 있으면 사이트에도 나갑니다.",
    confirmLabel: "기록 공개",
    successFlash: "기록을 공개했습니다.",
  },
  reopen: {
    kind: "reopen",
    title: "다시 진행 중으로",
    body: "다시 진행 중이 됩니다. 공개 사이트 배치는 숨깁니다. 기록은 남습니다.",
    confirmLabel: "다시 진행 중으로",
    successFlash: "다시 진행 중으로 바꿨습니다.",
  },
  unpublish: {
    kind: "unpublish",
    title: "공개 취소",
    body: "공개 사이트에서 내려갑니다. 기록과 이미 보낸 알림은 남습니다.",
    confirmLabel: "공개 취소",
    successFlash: "공개를 취소했습니다.",
  },
  "return-to-draft": {
    kind: "return-to-draft",
    title: "모임 전으로 되돌리기",
    body: "모임 전 상태가 됩니다. 참석·질문은 남습니다.",
    confirmLabel: "모임 전으로 되돌리기",
    successFlash: "모임 전으로 되돌렸습니다.",
  },
};

export function reverseLifecycleAction(state: HostSessionState): ReverseLifecycleAction | null {
  if (state === "OPEN") {
    return { kind: "return-to-draft", label: "모임 전으로 되돌리기" };
  }
  if (state === "CLOSED") {
    return { kind: "reopen", label: "다시 진행 중으로" };
  }
  if (state === "PUBLISHED") {
    return { kind: "unpublish", label: "공개 취소" };
  }
  return null;
}

export function lifecycleConfirmCopy(kind: SessionLifecycleConfirmKind): SessionLifecycleConfirmCopy {
  return confirmCopyByKind[kind];
}

export function openAlreadyExistsMessage(): string {
  return "이미 진행 중인 모임이 있습니다. 그 모임을 마치거나 모임 전으로 되돌린 뒤 다시 시도하세요.";
}
