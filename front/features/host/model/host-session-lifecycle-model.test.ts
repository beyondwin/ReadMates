import { describe, expect, it } from "vitest";
import type { HostSessionState } from "./host-session-editor-model";
import {
  lifecycleConfirmCopy,
  openAlreadyExistsMessage,
  reverseLifecycleAction,
  type SessionLifecycleConfirmCopy,
  type SessionLifecycleConfirmKind,
} from "./host-session-lifecycle-model";

describe("reverseLifecycleAction", () => {
  it.each([
    ["OPEN", { kind: "return-to-draft", label: "모임 전으로 되돌리기" }],
    ["CLOSED", { kind: "reopen", label: "다시 진행 중으로" }],
    ["PUBLISHED", { kind: "unpublish", label: "공개 취소" }],
    ["DRAFT", null],
  ] as const satisfies ReadonlyArray<
    [HostSessionState, { kind: "reopen" | "unpublish" | "return-to-draft"; label: string } | null]
  >)("maps %s to the reverse lifecycle action", (state, expected) => {
    expect(reverseLifecycleAction(state)).toEqual(expected);
  });
});

describe("lifecycleConfirmCopy", () => {
  it("returns open confirmation copy", () => {
    expect(lifecycleConfirmCopy("open")).toEqual({
      kind: "open",
      title: "멤버에게 열기",
      body: "멤버 참석과 질문이 시작됩니다.",
      confirmLabel: "멤버에게 열기",
      successFlash: "모임을 열었습니다.",
    });
  });

  it.each([
    [
      "close",
      {
        kind: "close",
        title: "모임 마치기",
        body: "모임을 마치면 참석과 질문이 멈춥니다. 기록은 남습니다.",
        confirmLabel: "모임 마치기",
        successFlash: "모임을 마쳤습니다.",
      },
    ],
    [
      "publish",
      {
        kind: "publish",
        title: "기록 공개",
        body: "멤버 노트·아카이브에 나갑니다. 공개 배치가 켜져 있으면 사이트에도 나갑니다.",
        confirmLabel: "기록 공개",
        successFlash: "기록을 공개했습니다.",
      },
    ],
    [
      "reopen",
      {
        kind: "reopen",
        title: "다시 진행 중으로",
        body: "다시 진행 중이 됩니다. 공개 사이트 배치는 숨깁니다. 기록은 남습니다.",
        confirmLabel: "다시 진행 중으로",
        successFlash: "다시 진행 중으로 바꿨습니다.",
      },
    ],
    [
      "unpublish",
      {
        kind: "unpublish",
        title: "공개 취소",
        body: "공개 사이트에서 내려갑니다. 기록과 이미 보낸 알림은 남습니다.",
        confirmLabel: "공개 취소",
        successFlash: "공개를 취소했습니다.",
      },
    ],
    [
      "return-to-draft",
      {
        kind: "return-to-draft",
        title: "모임 전으로 되돌리기",
        body: "모임 전 상태가 됩니다. 참석·질문은 남습니다.",
        confirmLabel: "모임 전으로 되돌리기",
        successFlash: "모임 전으로 되돌렸습니다.",
      },
    ],
  ] as const satisfies ReadonlyArray<[SessionLifecycleConfirmKind, SessionLifecycleConfirmCopy]>)(
    "returns spec title, body, confirmLabel, and flash for %s",
    (kind, expected) => {
      expect(lifecycleConfirmCopy(kind)).toEqual(expected);
    },
  );
});

describe("openAlreadyExistsMessage", () => {
  it("returns the spec conflict sentence", () => {
    expect(openAlreadyExistsMessage()).toBe(
      "이미 진행 중인 모임이 있습니다. 그 모임을 마치거나 모임 전으로 되돌린 뒤 다시 시도하세요.",
    );
  });
});
