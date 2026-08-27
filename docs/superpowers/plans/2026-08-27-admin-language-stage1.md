# 어드민 용어 사전 통일 (재설계 1단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/**` 전 화면의 라벨을 단일 한국어 사전으로 통일하고 영문 eyebrow·enum 원문 노출을 제거한다 (화면 구조 변경 없음).

**Architecture:** 새 카피 모듈 `admin-copy.ts`에 용어 사전과 enum 라벨 매퍼를 두고, 각 화면이 하드코딩 문자열 대신 이 모듈을 참조하도록 치환한다. 내비 그룹 구조·레이아웃·서버 계약은 건드리지 않는다(그건 2~6단계).

**Tech Stack:** React 19 + Vite, Vitest(jsdom), 기존 `front/features/platform-admin/**` 패턴.

**Spec:** `docs/development/2026-08-27-readmates-admin-case-desk-narrative-redesign-design.md` (§6 용어 사전, §9 1단계)

ADR impact: new — ADR-0047

## Global Constraints

- 라벨 사전(스펙 §6 그대로): 케이스 / 오늘(내비·브레드크럼 동일) / AI 작업 / 배달 원장 / 운영 기입 / 접근 원장 / 분석 부록 / 영수증 / 결과 값 성공·실패·차단·진행.
- 영문 eyebrow·내부 enum 원문·내부 이벤트명을 1급 텍스트로 노출 금지.
- 공개 저장소 안전: 실제 멤버·도메인·토큰 예시 금지. 테스트 데이터는 허구.
- 검증 명령은 `pnpm --dir front ...` (CI 패리티 필요 시 `corepack pnpm --dir front ...`).
- 이 단계에서 내비 그룹(오늘/클럽/서비스/검토) 재편 금지 — 라벨만 바꾼다.
- 커밋 프리픽스: `feat(admin-lang):` 또는 `test(admin-lang):`.

---

### Task 1: 카피 모듈 `admin-copy.ts`

**Files:**
- Create: `front/features/platform-admin/model/admin-copy.ts`
- Test: `front/features/platform-admin/model/admin-copy.test.ts`

**Interfaces:**
- Produces (이후 모든 태스크가 이 이름을 그대로 import):

```ts
export const ADMIN_COPY: {
  eyebrow: { clubs: string; clubDetail: string; aiOps: string; notifications: string; takedown: string };
  heading: { aiOps: string; failureClusters: string; replay: string; clubsLedger: string };
  receipt: string; // "영수증"
};
export function clubLifecycleLabel(value: string): string;
export function clubVisibilityLabel(value: string): string;
export function hostOnboardingLabel(value: string): string;
export function supportGrantStatusLabel(value: string): string;
```

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// front/features/platform-admin/model/admin-copy.test.ts
import { describe, expect, it } from "vitest";
import {
  ADMIN_COPY,
  clubLifecycleLabel,
  clubVisibilityLabel,
  hostOnboardingLabel,
  supportGrantStatusLabel,
} from "./admin-copy";

describe("admin-copy", () => {
  it("영문 eyebrow를 한국어 사전으로 제공한다", () => {
    expect(ADMIN_COPY.eyebrow.clubs).toBe("운영 · 클럽");
    expect(ADMIN_COPY.eyebrow.clubDetail).toBe("운영 · 클럽 상세");
    expect(ADMIN_COPY.eyebrow.aiOps).toBe("운영 · AI 작업");
    expect(ADMIN_COPY.eyebrow.notifications).toBe("운영 · 배달");
    expect(ADMIN_COPY.eyebrow.takedown).toBe("운영 · 긴급 공개 회수");
    expect(ADMIN_COPY.heading.aiOps).toBe("AI 작업");
    expect(ADMIN_COPY.heading.failureClusters).toBe("실패 클러스터");
    expect(ADMIN_COPY.heading.replay).toBe("재발송");
    expect(ADMIN_COPY.heading.clubsLedger).toBe("클럽 장부");
    expect(ADMIN_COPY.receipt).toBe("영수증");
  });

  it("클럽 enum을 한국어 라벨로 바꾼다", () => {
    expect(clubLifecycleLabel("ACTIVE")).toBe("활성");
    expect(clubLifecycleLabel("SETUP_REQUIRED")).toBe("설정 필요");
    expect(clubLifecycleLabel("SUSPENDED")).toBe("중지");
    expect(clubLifecycleLabel("ARCHIVED")).toBe("보관");
    expect(clubVisibilityLabel("PUBLIC")).toBe("공개");
    expect(clubVisibilityLabel("PRIVATE")).toBe("비공개");
    expect(hostOnboardingLabel("MISSING")).toBe("없음");
    expect(hostOnboardingLabel("INVITED")).toBe("초대됨");
    expect(hostOnboardingLabel("ASSIGNED")).toBe("배정됨");
  });

  it("지원 grant 상태를 한국어 라벨로 바꾼다", () => {
    expect(supportGrantStatusLabel("ACTIVE")).toBe("활성");
    expect(supportGrantStatusLabel("EXPIRING")).toBe("만료 임박");
    expect(supportGrantStatusLabel("EXPIRED")).toBe("만료됨");
    expect(supportGrantStatusLabel("REVOKED")).toBe("취소됨");
  });

  it("모르는 값은 원문을 그대로 반환한다 (fail-open 라벨, 숨기지 않음)", () => {
    expect(clubLifecycleLabel("UNKNOWN_X")).toBe("UNKNOWN_X");
    expect(supportGrantStatusLabel("")).toBe("");
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm --dir front exec vitest run features/platform-admin/model/admin-copy.test.ts` / Expected: FAIL (`Cannot find module './admin-copy'`)

- [ ] **Step 3: 최소 구현**

```ts
// front/features/platform-admin/model/admin-copy.ts
export const ADMIN_COPY = {
  eyebrow: {
    clubs: "운영 · 클럽",
    clubDetail: "운영 · 클럽 상세",
    aiOps: "운영 · AI 작업",
    notifications: "운영 · 배달",
    takedown: "운영 · 긴급 공개 회수",
  },
  heading: {
    aiOps: "AI 작업",
    failureClusters: "실패 클러스터",
    replay: "재발송",
    clubsLedger: "클럽 장부",
  },
  receipt: "영수증",
} as const;

function fromMap(map: Record<string, string>) {
  return (value: string): string => map[value] ?? value;
}

export const clubLifecycleLabel = fromMap({
  ACTIVE: "활성",
  SETUP_REQUIRED: "설정 필요",
  SUSPENDED: "중지",
  ARCHIVED: "보관",
});

export const clubVisibilityLabel = fromMap({
  PUBLIC: "공개",
  PRIVATE: "비공개",
});

export const hostOnboardingLabel = fromMap({
  MISSING: "없음",
  INVITED: "초대됨",
  ASSIGNED: "배정됨",
});

export const supportGrantStatusLabel = fromMap({
  ACTIVE: "활성",
  EXPIRING: "만료 임박",
  EXPIRED: "만료됨",
  REVOKED: "취소됨",
});
```

- [ ] **Step 4: 통과 확인** — Run: `pnpm --dir front exec vitest run features/platform-admin/model/admin-copy.test.ts` / Expected: PASS
- [ ] **Step 5: Commit** — `git add front/features/platform-admin/model/admin-copy.ts front/features/platform-admin/model/admin-copy.test.ts && git commit -m "feat(admin-lang): add unified admin copy dictionary"`

---

### Task 2: 내비 라벨 + 브레드크럼 "오늘 할 일" 제거

**Files:**
- Modify: `front/features/platform-admin/model/admin-route-catalog.ts:74-126` (label 필드만)
- Modify: `front/features/platform-admin/ui/admin-breadcrumb.tsx:36`
- Test: `front/features/platform-admin/model/admin-route-catalog.test.ts`, `front/features/platform-admin/ui/admin-breadcrumb.test.tsx`

**Interfaces:**
- Consumes: 없음 (문자열만 변경, group/href/capability 유지)
- Produces: 내비 라벨 — 알림 → **배달 원장**, 지원 → **접근 원장**, 감사 → **운영 기입**, 분석 → **분석 부록**. "AI 작업"·"서비스 건강"·"긴급 공개 회수"·"오늘"·"클럽"은 유지. 브레드크럼은 descriptor.label을 그대로 사용(특례 없음).

- [ ] **Step 1: 기존 테스트에서 옛 라벨 어서션을 새 라벨로 갱신 (실패 상태로 만든다)**

두 테스트 파일에서 옛 문자열을 검색해 치환한다. 검색: `rg -n "오늘 할 일|\"알림\"|\"지원\"|\"감사\"|\"분석\"" front/features/platform-admin/model/admin-route-catalog.test.ts front/features/platform-admin/ui/admin-breadcrumb.test.tsx`. 치환 규칙: `알림`→`배달 원장`, `지원`→`접근 원장`, `감사`→`운영 기입`, `분석`→`분석 부록`, 브레드크럼 기대값 `오늘 할 일`→`오늘`. 브레드크럼 테스트에 다음 케이스가 없으면 추가:

```tsx
it("오늘 브레드크럼은 내비 라벨과 같은 단어를 쓴다", () => {
  render(<AdminBreadcrumb routePath="today" />);
  expect(screen.getByLabelText("현재 위치")).toHaveTextContent("오늘");
  expect(screen.queryByText("오늘 할 일")).toBeNull();
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm --dir front exec vitest run features/platform-admin/model/admin-route-catalog.test.ts features/platform-admin/ui/admin-breadcrumb.test.tsx` / Expected: FAIL (라벨 불일치)

- [ ] **Step 3: 구현**

`admin-route-catalog.ts`에서 해당 descriptor의 `label`만 변경: `"알림"`→`"배달 원장"`, `"지원"`→`"접근 원장"`, `"감사"`→`"운영 기입"`, `"분석"`→`"분석 부록"`.

`admin-breadcrumb.tsx` 36행을 다음으로 교체:

```tsx
  parts.push(descriptor.label);
```

- [ ] **Step 4: 통과 확인** — 같은 명령 / Expected: PASS
- [ ] **Step 5: 사이드이펙트 스캔** — Run: `rg -n "오늘 할 일" front/ --glob '!node_modules'` / Expected: 매치 0건 (e2e·다른 화면에 남아 있으면 같은 규칙으로 갱신)
- [ ] **Step 6: Commit** — `git commit -am "feat(admin-lang): unify nav labels and drop breadcrumb alias"`

---

### Task 3: 클럽 목록 — eyebrow·장부 라벨·enum 셀

**Files:**
- Modify: `front/features/platform-admin/ui/admin-clubs-ledger.tsx:134,200,292,293,301`
- Modify: `front/features/platform-admin/ui/platform-admin-club-registry.tsx:25`
- Test: `front/features/platform-admin/ui/admin-clubs-ledger.test.tsx`

**Interfaces:**
- Consumes: Task 1의 `ADMIN_COPY`, `clubLifecycleLabel`, `clubVisibilityLabel`, `hostOnboardingLabel`

- [ ] **Step 1: 실패하는 테스트 추가/갱신** — `admin-clubs-ledger.test.tsx`에서 `Club registry` 어서션을 찾아 갱신하고, ready 상태 렌더 케이스에 enum 라벨 어서션 추가:

```tsx
expect(screen.getByText("운영 · 클럽")).toBeInTheDocument();
expect(screen.queryByText("Club registry")).toBeNull();
// clubs fixture에 status: "ACTIVE", publicVisibility: "PRIVATE", firstHostOnboardingState: "ASSIGNED" 행이 있을 때:
expect(screen.getByText("활성")).toBeInTheDocument();
expect(screen.getByText("비공개")).toBeInTheDocument();
expect(screen.getByText("배정됨")).toBeInTheDocument();
expect(screen.queryByText("ACTIVE")).toBeNull();
expect(screen.queryByText("ASSIGNED")).toBeNull();
```

주의: 필터 `<option>` 라벨("활성" 등)과 셀 라벨이 중복 매치될 수 있으므로 `getAllByText` 또는 `within(테이블행)` 스코프를 사용한다.

- [ ] **Step 2: 실패 확인** — Run: `pnpm --dir front exec vitest run features/platform-admin/ui/admin-clubs-ledger.test.tsx` / Expected: FAIL

- [ ] **Step 3: 구현**

`admin-clubs-ledger.tsx`:

```tsx
import {
  ADMIN_COPY,
  clubLifecycleLabel,
  clubVisibilityLabel,
  hostOnboardingLabel,
} from "@/features/platform-admin/model/admin-copy";
```

- 134행: `eyebrow="Club registry"` → `eyebrow={ADMIN_COPY.eyebrow.clubs}`
- 200행: `label="클럽 레지스트리"` → `label={ADMIN_COPY.heading.clubsLedger}`
- 292행: `{club.status}` → `{clubLifecycleLabel(club.status)}`
- 293행: `{club.publicVisibility}` → `{clubVisibilityLabel(club.publicVisibility)}`
- 301행: `{club.firstHostOnboardingState}` → `{hostOnboardingLabel(club.firstHostOnboardingState)}`

`platform-admin-club-registry.tsx` 25행: `<p className="eyebrow">Club registry</p>` → `<p className="eyebrow">{ADMIN_COPY.eyebrow.clubs}</p>` (동일 import 추가).

- [ ] **Step 4: 통과 확인** — 같은 명령 / Expected: PASS
- [ ] **Step 5: Commit** — `git commit -am "feat(admin-lang): korean labels for clubs ledger"`

---

### Task 4: AI 작업 라벨 일괄

**Files:**
- Modify: `front/features/platform-admin/route/admin-ai-ops-route.tsx:70,82,239` (H1 "AI Ops")
- Modify: `front/features/platform-admin/ui/platform-admin-ai-ops.tsx:145` (eyebrow "S5 Operations")
- Modify: `front/features/platform-admin/model/platform-admin-workbench-model.ts:393,409,411,625,711`
- Modify: `front/features/platform-admin/model/platform-admin-analytics-model.ts:106`
- Modify: `front/features/platform-admin/model/platform-admin-audit-model.ts:197`
- Test: `front/features/platform-admin/route/admin-ai-ops-route.test.tsx`, `front/features/platform-admin/ui/platform-admin-ai-ops.test.tsx`, `front/features/platform-admin/model/platform-admin-analytics-model.test.ts`, `front/features/platform-admin/model/platform-admin-audit-model.test.ts`

**Interfaces:**
- Consumes: `ADMIN_COPY.eyebrow.aiOps`, `ADMIN_COPY.heading.aiOps`
- Produces: 사용자 표기 "AI Ops" 전면 제거, 화면 표기는 "AI 작업"

- [ ] **Step 1: 테스트 갱신 (실패 상태)** — 검색: `rg -n "AI Ops" front/features/platform-admin --glob '*.test.*'`. 모든 기대 문자열을 다음 규칙으로 치환: `AI Ops`→`AI 작업`, `AI Ops 보기`→`AI 작업 보기`, `AI Ops에서 보기`→`AI 작업에서 보기`, `AI Ops 열기`→`AI 작업 열기`, `AI Ops 작업 목록을 확인하지 못했습니다.`→`AI 작업 목록을 확인하지 못했습니다.`
- [ ] **Step 2: 실패 확인** — Run: `pnpm --dir front exec vitest run features/platform-admin/route/admin-ai-ops-route.test.tsx features/platform-admin/ui/platform-admin-ai-ops.test.tsx features/platform-admin/model/platform-admin-analytics-model.test.ts features/platform-admin/model/platform-admin-audit-model.test.ts` / Expected: FAIL
- [ ] **Step 3: 구현** — 소스 5개 파일에서 같은 치환 규칙 적용. `admin-ai-ops-route.tsx` H1 3곳은 `{ADMIN_COPY.heading.aiOps}`, `platform-admin-ai-ops.tsx` 145행은 `eyebrow={ADMIN_COPY.eyebrow.aiOps}` (각 파일에 import 추가). model 파일 3곳은 문자열 리터럴 직접 치환(모델은 카피 모듈 의존 없이 유지해도 되지만, 리터럴이 2회 이상 반복되는 `platform-admin-workbench-model.ts`는 파일 상단에 `const AI_OPS_LABEL = "AI 작업";`을 두고 참조).
- [ ] **Step 4: 통과 확인** — 같은 명령 / Expected: PASS
- [ ] **Step 5: 잔존 스캔** — Run: `rg -n "AI Ops" front/ --glob '!node_modules'` / Expected: 0건
- [ ] **Step 6: Commit** — `git commit -am "feat(admin-lang): rename AI Ops to AI 작업 everywhere"`

---

### Task 5: 배달(알림) 화면 — eyebrow·섹션 헤딩

**Files:**
- Modify: `front/features/platform-admin/ui/admin-notifications-page.tsx:68,89,107`
- Test: `front/tests/unit` 또는 co-located 테스트 중 `admin-notifications` 대상 파일 (검색: `rg -l "Failure clusters|admin-notifications" front --glob '*.test.*'`)

**Interfaces:**
- Consumes: `ADMIN_COPY.eyebrow.notifications`, `ADMIN_COPY.heading.failureClusters`, `ADMIN_COPY.heading.replay`

- [ ] **Step 1: 테스트 갱신 (실패 상태)** — 위 검색으로 찾은 테스트에서 `Failure clusters`→`실패 클러스터`, `Replay`(헤딩 기대값)→`재발송`, `S5 Operations`→`운영 · 배달`. 헤딩 어서션이 없으면 추가:

```tsx
expect(screen.getByRole("heading", { name: "실패 클러스터" })).toBeInTheDocument();
expect(screen.getByRole("heading", { name: "재발송" })).toBeInTheDocument();
```

- [ ] **Step 2: 실패 확인** — 해당 테스트 파일 vitest run / Expected: FAIL
- [ ] **Step 3: 구현** — 68행 `eyebrow={ADMIN_COPY.eyebrow.notifications}`, 89행 헤딩 `{ADMIN_COPY.heading.failureClusters}`, 107행 헤딩 `{ADMIN_COPY.heading.replay}` (import 추가). 같은 파일에서 `rg -n "Outbox ledger|Delivery ledger|Outbox|ledger" front/features/platform-admin/ui/admin-notifications-page.tsx`로 사용자 노출 영문 라벨을 찾아 `Outbox ledger`→`발송 대기 장부`, `Delivery ledger`→`배달 장부`로 치환한다(내부 타입·prop 이름은 변경 금지, 사용자 노출 문자열만).
- [ ] **Step 4: 통과 확인** — 같은 명령 / Expected: PASS
- [ ] **Step 5: Commit** — `git commit -am "feat(admin-lang): korean labels for delivery operations page"`

---

### Task 6: 클럽 상세·도메인·긴급 회수 — eyebrow + 영수증 라벨

**Files:**
- Modify: `front/features/platform-admin/route/admin-club-detail-route.tsx:105,532`
- Modify: `front/features/platform-admin/ui/domain-provisioning-panel.tsx:388`
- Modify: `front/features/platform-admin/ui/admin-public-takedown-workbench.tsx:45,80`
- Test: 대상 테스트 검색 `rg -l "Club control|명령 접수 완료|Emergency public operation" front --glob '*.test.*'`

**Interfaces:**
- Consumes: `ADMIN_COPY.eyebrow.clubDetail`, `ADMIN_COPY.eyebrow.takedown`, `ADMIN_COPY.receipt`

- [ ] **Step 1: 테스트 갱신 (실패 상태)** — 기대값 치환: `Club control`→`운영 · 클럽 상세`, `Emergency public operation`→`운영 · 긴급 공개 회수`, `명령 접수 완료`→`영수증 — 명령 접수`.
- [ ] **Step 2: 실패 확인** — 해당 테스트 vitest run / Expected: FAIL
- [ ] **Step 3: 구현** — `admin-club-detail-route.tsx` 105행 `eyebrow={ADMIN_COPY.eyebrow.clubDetail}`; 532행 `<strong>명령 접수 완료</strong>` → `<strong>{ADMIN_COPY.receipt} — 명령 접수</strong>`; `domain-provisioning-panel.tsx` 388행 동일 치환; `admin-public-takedown-workbench.tsx` 45·80행 `eyebrow={ADMIN_COPY.eyebrow.takedown}` (각 파일 import 추가).
- [ ] **Step 4: 통과 확인** — 같은 명령 / Expected: PASS
- [ ] **Step 5: Commit** — `git commit -am "feat(admin-lang): korean eyebrows and receipt label for club/domain/takedown"`

---

### Task 7: 지원 화면 — grant 상태 enum 라벨

**Files:**
- Modify: `front/features/platform-admin/ui/admin-support-workbench.tsx:184` (`{item.status}` 표기)
- Test: `rg -l "admin-support-workbench" front --glob '*.test.*'`로 찾은 파일

**Interfaces:**
- Consumes: `supportGrantStatusLabel` (Task 1)
- 주의: 같은 행의 `item.status === "ACTIVE"` 조건 비교는 **코드 로직이므로 유지** — 표시 문자열만 바꾼다.

- [ ] **Step 1: 실패하는 테스트** — 지원 워크벤치 테스트의 ledger 렌더 케이스에 추가/갱신:

```tsx
expect(screen.getByText(/활성/)).toBeInTheDocument();
expect(screen.queryByText(/\bACTIVE\b/)).toBeNull();
```

- [ ] **Step 2: 실패 확인** — 해당 테스트 vitest run / Expected: FAIL
- [ ] **Step 3: 구현** — 184행에서 `{item.granteeMaskedEmail} · {item.status} · {item.reasonCategory} · …` 의 `{item.status}`를 `{supportGrantStatusLabel(item.status)}`로 치환 (import 추가). `reasonCategory`는 이 단계 범위 밖(4단계 지원 화면 재조립에서 처리) — 그대로 둔다.
- [ ] **Step 4: 통과 확인** — 같은 명령 / Expected: PASS
- [ ] **Step 5: Commit** — `git commit -am "feat(admin-lang): korean support grant status labels"`

---

### Task 8: 최종 스윕 + 전체 검증

**Files:**
- Modify: 스윕에서 발견된 잔존 파일들 (아래 사전 규칙으로만)
- Modify: `front/DESIGN.md` — §Editorial Operations Ledger에 "라벨은 `admin-copy.ts` 사전 사용" 한 줄 추가

- [ ] **Step 1: 잔존 영문 라벨 스캔**

```bash
rg -n "Club registry|Club control|S5 Operations|Emergency public operation|Failure clusters|AI Ops|오늘 할 일|명령 접수 완료" front/ --glob '!node_modules' --glob '!__screenshots__'
```

Expected: 0건. 매치가 나오면 위 태스크들의 사전 규칙으로 치환하고 해당 테스트를 같이 갱신한다.

- [ ] **Step 2: enum 원문 노출 스캔** — `rg -n "\{(club|item)\.(status|publicVisibility|firstHostOnboardingState)\}" front/features/platform-admin/ui front/features/platform-admin/route` / Expected: 0건 (라벨 매퍼 미적용 렌더가 남아 있으면 Task 3/7 방식으로 처리)
- [ ] **Step 3: 전체 프런트 검증** — Run: `pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build` / Expected: 모두 PASS
- [ ] **Step 4: 어드민 e2e** — Run: `pnpm --dir front test:e2e` (어드민 라벨을 참조하는 e2e가 있으므로 전체 실행; 실패 시 기대 문자열을 사전 규칙으로 갱신) / Expected: PASS
- [ ] **Step 5: CT 스크린샷 재잠금** — 라벨 변경으로 `admin-editorial-ledger.ct.tsx`·`admin-support-workbench.ct.tsx` 기준 이미지가 달라진다. Run: `pnpm --dir front test:ct --update-snapshots` 에 해당하는 저장소 명령(정확한 명령은 `front/package.json` scripts의 ct 항목 확인) 후 변경된 `front/__screenshots__/features/platform-admin/**` 커밋.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(admin-lang): final sweep, DESIGN note, relocked admin screenshots"`

---

## Self-Review 결과

- 스펙 §6 사전의 모든 행이 태스크에 매핑됨 (케이스 라벨은 Today가 이미 사용 중이라 변경 없음 — 확인 스윕은 Task 8 Step 1).
- "결과 값 성공/실패/차단/진행" 4종 표준화는 감사 화면 재조립(4단계) 범위로 이월 — 이 단계는 노출 제거가 아니라 신규 표기 도입이 필요해 구조 변경과 함께 간다. 스펙 §9 단계 구분과 일치.
- 타입 시그니처 일관성: 모든 태스크가 Task 1의 export 이름을 그대로 사용.

## 다음 계획

2~6단계는 `docs/superpowers/plans/2026-08-27-admin-case-desk-stages2-6.md`에 이어진다. 이 계획(1단계) 완료 후 순차 실행한다.
