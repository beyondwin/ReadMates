# 호스트 용어·상태 사전 통일 (리디자인 1단계) Implementation Plan

> **Superseded — 실행 금지:** ADR-0048/0049 기반 `2026-08-29-host-lifecycle-operating-room-program-index.md`가 최신 승인 구현 권위다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 호스트 화면의 모임 lifecycle 라벨을 스펙 §5 사전(작성 중 / 준비 중 / 기록 정리 중 / 게시됨)으로 단일화하고, 화면별 하드코딩·번역 심(shim)을 제거한다.

**Architecture:** `front/shared/model/meeting-language.ts`가 이미 단일 사전이며 `meeting-language-inventory.test.ts`가 레거시 카피를 강제 스캔한다. 이 단계는 (1) 사전 값을 스펙 라벨로 교체하고, (2) 소비자들이 사전 함수를 직접 쓰도록 바꿔 로컬 매핑 6곳을 삭제하며, (3) 허용 목록의 `canonical-host-status-label` 엔트리 6개를 제거해 강제 스캔이 새 사전을 지키게 한다. 화면 구조 변경 없음.

**Tech Stack:** React/Vite SPA, TypeScript, Vitest (단위), Playwright (e2e). 프런트 명령은 `pnpm --dir front <script>`.

**Spec:** `docs/development/2026-08-27-readmates-host-triage-diary-redesign-design.md` (§5 용어·상태 사전, §9 1단계). ADR: `docs/development/adr/0046-host-triage-home-meeting-diary-composition.md` (Proposed).

ADR impact: new — ADR-0046

## Global Constraints

- 스펙 §5 확정 라벨: DRAFT=`작성 중`, OPEN=`준비 중`, CLOSED=`기록 정리 중`, PUBLISHED=`게시됨`. 금지: `예정`, `모임 작성 중`, `멤버와 준비 중`(상태 라벨로), `진행 중`, `종료`, `공개됨`, `공개 완료`, `게시 완료`.
- 멤버/게스트/퍼블릭 라벨(`MEMBER_GUEST_LIFECYCLE`, `공개 기록`)은 이 단계에서 변경하지 않는다 (스펙 §8 비범위: 멤버 화면 composition 불변).
- 서버 API·계약 변경 없음. URL의 `sessions` 유지 (§5).
- 공개 저장소 안전: 실제 멤버 데이터·비밀값·사설 도메인을 코드/테스트/커밋에 넣지 않는다.
- 각 태스크 완료 시 커밋. 커밋 메시지는 repo 관례(`feat|fix|docs|refactor(scope): ...`)를 따른다.
- 이 단계의 범위는 lifecycle 상태 라벨이다. §5의 말소(소프트 삭제)·중지(초대)·알린/무단 불참 어휘는 해당 화면을 재구성하는 3·5단계 계획에서 적용한다.

---

### Task 1: 사전 값 교체 + 호스트 라벨 타입 노출

**Files:**
- Modify: `front/shared/model/meeting-language.ts:19-24` (HOST_LIFECYCLE), 파일 상단 export 구역
- Test: `front/shared/model/meeting-language.test.ts:31-48`

**Interfaces:**
- Produces: `export type HostMeetingLifecycleLabel = "작성 중" | "준비 중" | "기록 정리 중" | "게시됨"` 및 `export function hostMeetingLifecycleLabel(state: SessionState): HostMeetingLifecycleLabel`. Task 2의 모든 소비자가 이 두 개를 import한다.

- [ ] **Step 1: 실패하는 테스트로 갱신**

`front/shared/model/meeting-language.test.ts`의 host lifecycle 기대값(31-35행)을 스펙 라벨로 바꾸고, 새 함수 테스트를 추가한다:

```ts
  it("labels host and member/guest lifecycle independently of public placement", () => {
    expect(formatMeetingLifecycle("DRAFT", "host")).toBe("작성 중");
    expect(formatMeetingLifecycle("OPEN", "host")).toBe("준비 중");
    expect(formatMeetingLifecycle("CLOSED", "host")).toBe("기록 정리 중");
    expect(formatMeetingLifecycle("PUBLISHED", "host")).toBe("게시됨");
    // ... member/guest/public 기대값은 기존 그대로 유지 ...
  });

  it("exposes the typed host lifecycle dictionary for host surfaces", () => {
    expect(hostMeetingLifecycleLabel("DRAFT")).toBe("작성 중");
    expect(hostMeetingLifecycleLabel("OPEN")).toBe("준비 중");
    expect(hostMeetingLifecycleLabel("CLOSED")).toBe("기록 정리 중");
    expect(hostMeetingLifecycleLabel("PUBLISHED")).toBe("게시됨");
  });
```

import 목록에 `hostMeetingLifecycleLabel`을 추가한다.

- [ ] **Step 2: 실패 확인**

Run: `pnpm --dir front test -- shared/model/meeting-language.test.ts`
Expected: FAIL — `hostMeetingLifecycleLabel` 미존재 + 라벨 불일치.

- [ ] **Step 3: 사전 구현**

`front/shared/model/meeting-language.ts`에서:

```ts
export type HostMeetingLifecycleLabel = "작성 중" | "준비 중" | "기록 정리 중" | "게시됨";

const HOST_LIFECYCLE: Record<SessionState, HostMeetingLifecycleLabel> = {
  DRAFT: "작성 중",
  OPEN: "준비 중",
  CLOSED: "기록 정리 중",
  PUBLISHED: "게시됨",
};

export function hostMeetingLifecycleLabel(state: SessionState): HostMeetingLifecycleLabel {
  return HOST_LIFECYCLE[state];
}
```

`formatMeetingLifecycle`은 그대로 `HOST_LIFECYCLE[state]`를 반환하므로 추가 수정 불필요.

- [ ] **Step 4: 통과 확인**

Run: `pnpm --dir front test -- shared/model/meeting-language.test.ts`
Expected: PASS (inventory 테스트는 아직 건드리지 않음 — Task 3에서 처리).

- [ ] **Step 5: Commit**

```bash
git add front/shared/model/meeting-language.ts front/shared/model/meeting-language.test.ts
git commit -m "feat(host): adopt spec §5 host lifecycle labels in meeting-language dictionary"
```

---

### Task 2: 소비자를 사전으로 전환하고 로컬 매핑·번역 심 제거

**Files:**
- Modify: `front/features/host/model/host-session-workspace-model.ts:84,202-209,479`
- Modify: `front/features/host/ui/session-workspace/host-session-workspace.tsx:67-68` 및 `hostStatusLabel` 호출부
- Modify: `front/features/host/ui/session-workspace/workspace-header.tsx:27`
- Modify: `front/features/host/ui/meeting-workspace/host-meeting-workspace.tsx:55`
- Modify: `front/features/host/ui/host-session-editor.tsx:1682`
- Modify: `front/features/host/ui/meeting-ledger/host-meeting-ledger.tsx:42-47`
- Test: 위 파일들의 짝 테스트(`host-session-workspace-model.test.ts`, `host-session-workspace.test.tsx`, `host-meeting-workspace.test.tsx`, `host-meeting-ledger.test.tsx`, `host-focus-deck.ct.tsx`, `session-closing-board.test.tsx` 등 라벨 기대값이 있는 곳)

**Interfaces:**
- Consumes: Task 1의 `HostMeetingLifecycleLabel`, `hostMeetingLifecycleLabel` (`@/shared/model/meeting-language`).
- Produces: `HostSessionWorkspaceView["statusLabel"]`과 `HostMeetingWorkspaceView["statusLabel"]`의 타입이 `HostMeetingLifecycleLabel`이 된다. Task 3의 스윕은 이 상태를 전제한다.

- [ ] **Step 1: 모델 테스트를 새 라벨로 갱신 (실패 유도)**

`host-session-workspace-model.test.ts`에서 `"모임 작성 중" | "멤버와 준비 중" | "공개 완료" | "게스트·멤버 노트 게시 완료"`를 각각 `"작성 중" | "준비 중" | "게시됨"`으로 치환한다. 검색:

```bash
rg -n '모임 작성 중|멤버와 준비 중|공개 완료|게시 완료' front/features/host --glob '*.test.*' --glob '*.ct.*'
```

각 히트를 새 라벨로 바꾼다 (기록 정리 중은 불변).

- [ ] **Step 2: 실패 확인**

Run: `pnpm --dir front test -- features/host/model/host-session-workspace-model.test.ts`
Expected: FAIL — 구현이 아직 옛 라벨을 반환.

- [ ] **Step 3: 모델 구현 전환**

`host-session-workspace-model.ts`:

```ts
import { hostMeetingLifecycleLabel, type HostMeetingLifecycleLabel } from "@/shared/model/meeting-language";
```

84행과 479행의 statusLabel 리터럴 유니언을 모두 `HostMeetingLifecycleLabel`로 교체:

```ts
  statusLabel: HostMeetingLifecycleLabel;
```

202-209행의 `focusDeckStatusLabel` 본문을 사전 호출로 교체:

```ts
function focusDeckStatusLabel(state: HostMeetingLifecycle): HostMeetingWorkspaceView["statusLabel"] {
  return hostMeetingLifecycleLabel(state);
}
```

- [ ] **Step 4: UI 번역 심 제거**

- `host-session-workspace.tsx` 67-68행의 `hostStatusLabel` 함수를 삭제하고, 호출부는 `view.statusLabel`을 그대로 사용한다 (statusLabel이 이미 canonical).
- `workspace-header.tsx` 27행 타입에서 `| "공개 완료"`를 제거한다 (`| "새 모임"`은 유지).
- `host-meeting-workspace.tsx` 55행의 조건 매핑을 passthrough로 교체:

```ts
    statusLabel: view.statusLabel,
```

- `host-session-editor.tsx` 1682행도 동일하게 passthrough로 교체.
- `host-meeting-ledger.tsx` 42-47행의 `meetingStateLabel`을 사전 호출로 교체:

```ts
import { hostMeetingLifecycleLabel } from "@/shared/model/meeting-language";

function meetingStateLabel(state: MeetingListItem["state"]) {
  return hostMeetingLifecycleLabel(state);
}
```

- [ ] **Step 5: 남은 UI 테스트 기대값 갱신 후 통과 확인**

Run: `pnpm --dir front test -- features/host shared/model/meeting-language.test.ts`
Expected: PASS. 실패가 남으면 실패 메시지의 기대 문자열을 §5 사전으로 갱신한다(구현을 옛 라벨로 되돌리지 않는다).

- [ ] **Step 6: Commit**

```bash
git add front/features/host front/shared/model
git commit -m "refactor(host): source lifecycle status labels from meeting-language dictionary"
```

---

### Task 3: 허용 목록 정리 + 금지 라벨 스윕

**Files:**
- Modify: `front/shared/model/meeting-language-allowlist.ts:93-135` (canonical-host-status-label 엔트리 6개 삭제)
- Modify: 스윕에서 발견되는 호스트 화면 소스·테스트 (예: `front/features/host/ui/host-session-ledger.tsx`의 DRAFT `예정` 라벨)
- Test: `front/shared/model/meeting-language-inventory.test.ts` (수정 없이 통과해야 함)

**Interfaces:**
- Consumes: Task 2 완료 상태 (소스에 `공개 완료` 리터럴이 남아 있지 않아야 allowlist 삭제가 성립).

- [ ] **Step 1: allowlist에서 canonical-host-status-label 엔트리 6개 삭제**

`meeting-language-allowlist.ts`에서 `kind: "canonical-host-status-label"`인 엔트리 6개(93-135행)를 모두 제거한다. `MeetingLanguageAllowlistKind` 유니언의 `"canonical-host-status-label"` 멤버도 제거한다 (inventory 테스트의 ALLOWED_KINDS에서도 제거 — 테스트 파일 15-20행).

- [ ] **Step 2: 인벤토리 테스트 통과 확인**

Run: `pnpm --dir front test -- shared/model/meeting-language-inventory.test.ts`
Expected: PASS. FAIL이면 출력이 남은 `공개 완료` 리터럴의 파일:행을 알려준다 — 해당 소스를 Task 2 방식(사전 호출)으로 고친 뒤 재실행한다.

- [ ] **Step 3: 스펙 §5 금지 라벨 스윕**

```bash
rg -n '모임 작성 중|멤버와 준비 중|게시 완료|공개됨|"예정"' front/features/host front/src/app/host-routes --glob '!*.test.*' --glob '!*.ct.*'
rg -n '모임 작성 중|멤버와 준비 중|공개 완료|게시 완료' front/tests/e2e
```

- 첫 명령의 히트 중 **상태 라벨 용도**만 사전 호출로 교체한다 (문장 속 서술("멤버와 준비를 시작") 및 멤버 화면 어휘는 대상 아님 — 판단 기준: SessionState를 라벨 문자열로 바꾸는 코드인가).
- 둘째 명령의 e2e 기대값 히트는 §5 라벨로 갱신한다.

- [ ] **Step 4: 통과 확인**

Run: `pnpm --dir front test`
Expected: PASS (전체 단위 테스트).

- [ ] **Step 5: Commit**

```bash
git add front
git commit -m "refactor(host): retire 공개-완료 allowlist and sweep forbidden lifecycle labels"
```

---

### Task 4: 전체 검증

**Files:** 없음 (검증 전용).

- [ ] **Step 1: 프런트 3종 체크**

Run:
```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```
Expected: 모두 PASS. pnpm 동작이 로컬과 다르면 `corepack pnpm --dir front ...`로 재실행하고 사용한 명령을 보고한다.

- [ ] **Step 2: e2e (라벨 기대값을 고친 경우에만)**

Task 3 Step 3에서 `front/tests/e2e` 파일을 수정했다면:

Run: `pnpm --dir front test:e2e`
Expected: PASS. 로컬 MySQL/서버가 없어 실행 불가하면 스킵 사실과 명령을 최종 보고에 명시한다 (통과 주장 금지).

- [ ] **Step 3: 최종 보고**

변경 표면(frontend 라벨 사전·호스트 화면 소비자), 실행한 체크, 스킵한 체크와 사유를 보고한다.
