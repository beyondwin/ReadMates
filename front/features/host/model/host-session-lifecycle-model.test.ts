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
    ["OPEN", { kind: "return-to-draft", label: "예정으로 되돌리기" }],
    ["CLOSED", { kind: "reopen", label: "마감 취소" }],
    ["PUBLISHED", { kind: "unpublish", label: "공개 취소" }],
    ["DRAFT", null],
  ] as const satisfies ReadonlyArray<
    [HostSessionState, { kind: "reopen" | "unpublish" | "return-to-draft"; label: string } | null]
  >)("maps %s to the reverse lifecycle action", (state, expected) => {
    expect(reverseLifecycleAction(state)).toEqual(expected);
  });
});

describe("lifecycleConfirmCopy", () => {
  it.each([
    [
      "close",
      {
        kind: "close",
        title: "세션 마감",
        body: "멤버 RSVP·질문·서평이 멈추고 현재 세션에서 내려갑니다. 기록은 남습니다.",
        confirmLabel: "세션 마감",
        successFlash: "세션을 마감했습니다.",
      },
    ],
    [
      "publish",
      {
        kind: "publish",
        title: "세션 공개",
        body: "멤버 노트·아카이브에 나갑니다. 공개 배치가 켜져 있으면 사이트에도 나갑니다.",
        confirmLabel: "세션 공개",
        successFlash: "세션을 공개했습니다.",
      },
    ],
    [
      "reopen",
      {
        kind: "reopen",
        title: "마감 취소",
        body: "다시 진행 중이 됩니다. 공개 사이트 배치는 숨깁니다. 기록은 남습니다.",
        confirmLabel: "마감 취소",
        successFlash: "마감을 취소했습니다. 세션이 다시 진행 중입니다.",
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
        title: "예정으로 되돌리기",
        body: "현재 세션이 아닙니다. 참석·질문은 남습니다.",
        confirmLabel: "예정으로 되돌리기",
        successFlash: "진행을 취소했습니다. 세션이 예정 상태로 돌아갔습니다.",
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
      "이미 진행 중인 세션이 있습니다. 그 세션을 마감하거나 예정으로 되돌린 뒤 다시 시도하세요.",
    );
  });
});
