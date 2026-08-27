# 어드민 케이스 데스크 재설계 2~6단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스펙의 2~6단계(알람 바·서사 건강 → 케이스 데스크 보강 → 원장 셸 통일 → 파이프라인 재편 → 클럽 상세·내비 전환)를 순차 릴리스 가능한 단위로 구현한다.

**Architecture:** 각 단계는 독립 릴리스 가능한 수직 증분이다. 공유 프리미티브(`AdminPageContext`, `AdminWorkViewBar`, `AdminEvidenceLedger`, `AdminStatePanel`, `AdminSafeActionDock`, `AdminReceiptTimeline`)와 1단계에서 만든 `admin-copy.ts` 사전을 유일한 셸 어휘로 쓰고, 핸드롤 화면을 이 문법으로 수렴시킨다. 서버 계약은 바꾸지 않는다.

**Tech Stack:** React 19 + Vite, TanStack Query, Vitest(jsdom), Playwright e2e/CT.

**Spec:** `docs/development/2026-08-27-readmates-admin-case-desk-narrative-redesign-design.md`
**선행:** `docs/superpowers/plans/2026-08-27-admin-language-stage1.md` 완료 후 시작.

ADR impact: new — ADR-0047

새 세션 실행 프롬프트: `docs/superpowers/plans/2026-08-27-admin-redesign-sdd-execution-prompt.md`

## Global Constraints

- 스펙 §6 용어 사전과 §5 명령 마찰 3등급, §7 페이지 타입 3종(데스크형/원장형/서사형)이 모든 태스크에 암묵 적용된다.
- 서버 API·capability·safe-command 계약 변경 금지 (스펙 §8). 서버 데이터가 없는 표현(예: 다음 재시도 시각)은 "있으면 표기" 방식으로 구현하고 후속 목록에 기록한다.
- `AdminShellLayout`은 내비·capability·온보딩·authority-loss만 소유한다(`front/DESIGN.md`). 알람 바 데이터는 자체 실패 격리된 별도 훅으로 붙이고, 실패가 셸을 막지 않는다.
- 색은 이탈에만: 정상 상태 요소는 무채색. 상태는 색 단독 금지(문자 병기).
- 공개 저장소 안전: 허구 데이터만. 44px 타겟, 한국어 줄바꿈, reduced-motion 기존 계약 유지.
- 각 단계 완료 시 검증 게이트(아래 공통 게이트) 통과 후 커밋·릴리스 체크포인트를 남기고 다음 단계로 진행한다.

## 적응 실행 규약 (결함·개선 발견 시)

실행자는 다음 우선순위로 스스로 판단해 진행한다. 중단하고 묻는 것은 마지막 수단이다.

1. **권위 순서:** 스펙 §5~§7 (사전·마찰 등급·페이지 타입) > 이 계획의 세부 지시 > 기존 코드 관례. 계획의 세부(클래스명·파일 분할 등)가 실제 코드와 충돌하면 스펙을 지키는 쪽으로 계획을 수정해 진행한다.
2. **결함 발견:** 이번 단계 범위 안이고 30분 내 수정 가능하면 같은 단계에서 고치고 커밋 메시지에 `fix(admin):`로 분리 기록. 범위 밖이거나 크면 이 파일 맨 아래 `## 실행 중 발견` 섹션에 한 줄 기입하고 계속 진행.
3. **서버 데이터 부재:** UI가 요구하는 필드가 응답에 없으면 조건부 렌더(없으면 그 행 요소 생략)로 구현하고 `## 실행 중 발견`에 서버 후속으로 기록. 절대 가짜 값을 만들지 않는다.
4. **테스트 충돌:** 기존 테스트가 옛 구조를 고정하고 있으면, 스펙과 이 계획이 새 권위이므로 테스트를 새 구조 기준으로 갱신한다. 단 auth·capability·safe-command 동작을 검증하는 테스트의 **의미**는 약화시키지 않는다.
5. **각 단계 종료 시 이 파일의 체크박스를 갱신**하고, 벗어난 결정은 해당 태스크 아래 `> 실행 노트:`로 남긴다.

## 공통 검증 게이트 (각 단계 마지막에 실행)

```bash
pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build
pnpm --dir front test:e2e   # admin 흐름 포함
# CT 스크린샷이 달라진 단계: front/package.json의 ct 스크립트로 재잠금 후
# front/__screenshots__/features/platform-admin/** 변경분 커밋
```

---

# 2단계 — 알람 요약 바 + 서사형 건강 페이지

### Task 2-1: `AdminAlarmBar` 컴포넌트 + 요약 훅

**Files:**
- Create: `front/features/platform-admin/ui/admin-alarm-bar.tsx`
- Create: `front/features/platform-admin/queries/admin-alarm-summary.ts`
- Modify: `front/features/platform-admin/route/admin-shell-layout.tsx` (Outlet 위에 1회 렌더)
- Test: `front/features/platform-admin/ui/admin-alarm-bar.test.tsx`

**Interfaces:**
- Produces:

```tsx
export type AdminAlarmSummary = {
  attention: { count: number; headline: string | null }; // 주의 케이스 수 + 대표 한 줄
  unacknowledged: number;                                 // 미확인 신호
  serviceState: "ok" | "degraded" | "unknown";
  asOf: string | null;                                    // ISO
};
export function AdminAlarmBar({ summary, state }: {
  summary: AdminAlarmSummary | null;
  state: "ready" | "loading" | "unavailable";
});
export function useAdminAlarmSummary(): { summary: AdminAlarmSummary | null; state: "ready" | "loading" | "unavailable" };
```

- Consumes: 기존 오늘 신호 쿼리(`front/features/platform-admin/queries/`의 operations/today 쿼리)와 health snapshot 쿼리를 **읽기 전용으로 합성**. 새 서버 호출을 만들지 않는다. 둘 다 실패하면 `state: "unavailable"`로 조용한 한 줄("신호 확인 불가 · 오늘 열기")만 렌더.

**Steps:**
- [x] 테스트 작성: ① attention 1건이면 warn 텍스트+대표 한 줄+as-of 렌더 ② 0건이면 무채색 "미확인 신호 없음 · 서비스 정상" 한 줄 ③ unavailable이면 role="status"로 "신호 확인 불가" (색 없음) ④ 어떤 상태에서도 링크 "오늘 열기"가 `/admin/today`로 존재.
- [x] 실패 확인 → 구현(마크업은 목업 `design/mockups/2026-08-27-admin-case-desk/adm-a-today-desktop.html`의 `.alarm-bar` 구조 준용: 좌 warn 요약, 중앙 보조 텍스트, 우 mono as-of) → 통과 확인.
- [x] 셸 통합: `AdminShellLayoutInner`에서 브레드크럼 아래·Outlet 위에 `<AdminAlarmBar …/>` 1회. 훅 실패가 셸 렌더를 막지 않음을 테스트(쿼리 reject 모킹)로 고정.
- [x] Commit: `feat(admin): resident alarm summary bar`

> 실행 노트: `AdminAlarmSummary`는 ui↔queries 순환을 피하려고 `model/admin-alarm-summary.ts`에 두고 양쪽에서 re-export. 클럽 이름은 operations/health 응답에 없어 headline은 summaryCode 라벨만 사용(가짜 클럽명 없음). 알람 바는 `main` 안·Outlet 위에 1회 렌더.

### Task 2-2: 서비스 건강 페이지를 서사형으로 재구성

**Files:**
- Modify: `front/features/platform-admin/ui/admin-health-grid.tsx` (42행 `AdminHealthGrid`, 177행 `HealthPage` 구획 재배치)
- Test: 기존 health 테스트 파일 갱신 (`rg -l "admin-health" front --glob '*.test.*'`)

**요구 구조 (DOM 순서, 스펙 §4.2):**
1. `AdminPageContext` (기존 eyebrow "서비스" 유지) 바로 아래 **서사 문단 1개**: 정상이면 "모든 신호 정상. 마지막 이상은 {마지막 비정상 시각·항목} (해소됨)." — 데이터에 마지막 이상 정보가 없으면 "모든 신호 정상." 만.
2. **이탈 카드 구역**: `severity !== ok`인 신호 카드만 위로 승격 렌더. 정상 카드는 아래 "정상 신호" 접이식(`<details>`) 안에 **숫자 없이 이름만** 나열.
3. **최근 deploy** 구역은 "최근에 바뀐 것"으로 개칭(사전 등재: `ADMIN_COPY.heading.recentChanges = "최근에 바뀐 것"` — admin-copy.ts에 추가).
4. 카드 재시도·freshness·disabled 처리 로직은 그대로 보존.

**Steps:**
- [ ] 테스트: ① 전부 정상 스냅샷 → 서사 문단 렌더 + 개별 수치 텍스트 미노출(`queryByText(/\d+ ?%/)` null) + details 안에 신호명 존재 ② 이탈 1건 → 해당 카드가 서사 바로 다음에 수치와 함께 렌더 ③ "최근에 바뀐 것" 헤딩 존재.
- [ ] 실패 확인 → 구현 → 통과 → 공통 게이트 → CT 재잠금 → Commit: `feat(admin): narrative health page`
- [ ] **릴리스 체크포인트 2**: CHANGELOG Unreleased에 한 줄 기입.

---

# 3단계 — 오늘 케이스 데스크 보강

### Task 3-1: 도켓 순회 (이전/다음 + n/m)

**Files:**
- Modify: `front/features/platform-admin/ui/admin-operations-inspector.tsx` (17행 Props에 추가), `front/features/platform-admin/ui/admin-today-ledger.tsx` (69행 — 선택 인덱스 계산·전달)
- Test: 기존 today/inspector 테스트 갱신

**Interfaces:**
- Inspector Props에 추가: `traversal: { index: number; total: number; onPrev: (() => void) | null; onNext: (() => void) | null }`. 목록 끝이면 해당 방향 null(버튼 disabled). 케이스 해결(L1 command 성공) 후 `onNext` 자동 호출 — 단 마지막 항목이면 큐 요약으로 포커스 복귀.

**Steps:**
- [ ] 테스트: ① "케이스 2 / 4" 표기 ② 다음 클릭 시 선택 케이스 변경 ③ 해결 성공 모킹 후 자동 다음 이동 ④ 모바일(≤768) 전체화면 상세에도 같은 순회 노출.
- [ ] 구현(목업 `.docket-nav` 준용: 좌 mono 카운터, 우 이전/다음 quiet 버튼) → 통과 → Commit: `feat(admin): case docket traversal`

### Task 3-2: 큐 이탈 4경로 — 무시(사유 필수)·보류 정리

**Files:**
- Modify: `front/features/platform-admin/ui/admin-operations-inspector.tsx` (상태 관리 dock)
- Test: inspector 테스트 갱신

**요구사항:**
- 이탈 경로 라벨 고정: **확인 처리 / 보류 / 무시 / 해결 확인** (기존 서버 `allowedActions` 매핑 유지 — 새 액션을 발명하지 않는다. 서버가 dismiss를 지원하지 않으면 "무시"는 기존 보류의 사유 필수 변형으로 구현하고 `## 실행 중 발견`에 기록).
- 무시/보류 선택 시 **한 줄 사유 입력이 확정 버튼을 게이트**한다(빈 값이면 disabled). 사유는 기존 command payload의 note/reason 필드로 전송, 필드가 없으면 서버 후속 기록.
- 모바일 보류 버튼 6개 세로 나열 제거 → 보류는 단일 버튼 + 기간 선택(`<select>`: 1시간/4시간/24시간/7일).

**Steps:**
- [x] 테스트: ① 사유 없이 무시 확정 불가 ② 기간 select 존재, 개별 보류 버튼 나열 부재 ③ 사유가 command 호출 인자에 포함.
- [x] 구현 → 통과 → Commit: `feat(admin): guarded queue-exit paths with reasons`

> 실행 노트: 서버 snooze body는 `expectedVersion`+`snoozedUntil`만 허용(unknown field 400). 무시는 SNOOZE 7일 + 사유 필수. 사유는 UI command args에만 포함하고 HTTP에는 넣지 않음. 버튼 구현은 inspector dock primary인 `AdminOperationStateActions`.

### Task 3-3: 도켓 "이 대상의 최근 기입" 인라인

**Files:**
- Modify: `front/features/platform-admin/ui/admin-operations-inspector.tsx`
- Create: `front/features/platform-admin/ui/admin-target-ledger-inline.tsx`
- Test: 신규 컴포넌트 co-located 테스트

**Interfaces:**

```tsx
export function AdminTargetLedgerInline({ entries, moreHref }: {
  entries: ReadonlyArray<{ at: string; sentence: string }>; // 최대 3
  moreHref: string; // /admin/audit?…프리필터
});
```

- Consumes: 케이스 상세 응답의 기존 history/관련 링크 데이터. 감사 API 추가 호출 금지 — 상세에 이미 있는 이력만 문장화하고, `moreHref`는 audit 화면 프리필터 쿼리(4-1에서 지원)로 링크.

**Steps:**
- [x] 테스트: 3건 렌더 + 시각 mono + "전체 기입 보기" 링크 href 검증 → 구현(목업 `.ledger-inline` 준용) → 통과 → 공통 게이트 → CT 재잠금 → Commit: `feat(admin): inline target ledger in docket`
- [x] **릴리스 체크포인트 3**

---

# 4단계 — 원장형 셸 통일 (감사·지원·분석)

### Task 4-1: 감사 → "운영 기입" 재조립

**Files:**
- Modify: `front/features/platform-admin/ui/admin-audit-ledger.tsx` (49행 컴포넌트 전면 재구성), `front/features/platform-admin/route/admin-audit-route.tsx`
- Test: `front/features/platform-admin/ui/admin-audit-ledger.test.tsx` 갱신

**요구사항:**
- 셸: `AdminPageContext`(제목 "운영 기입") + `AdminWorkViewBar`(기존 fieldset 필터 이식) + `AdminEvidenceLedger`(행 목록) + 우측 드로어(기존 `AuditDetail` 유지하되 3분할 배치). 기존 반응형 `data-detail-open` 목록↔상세 전환 유지.
- **한 행 = 한 문장**: `{시각(절대·mono)} · {행위자}가 {대상}에 {행위} · 사유: {reason ?? "사유 없음"} · {결과}`. 결과 라벨은 `성공/실패/차단/진행` — admin-copy.ts에 `auditOutcomeLabel(value)` 추가(매핑은 기존 outcome enum을 rg로 확인해 작성, 미지 값은 원문).
- 내부 이벤트명·상관 ID는 행에서 제거하고 드로어에만.
- **프리필터 진입 지원**: `/admin/audit?target={id}` 쿼리를 읽어 초기 필터로 적용 (Task 3-3의 moreHref가 사용).

**Steps:**
- [x] 테스트: ① 문장형 행 렌더(사유 없음 명시 포함) ② 차단 결과 라벨 ③ target 쿼리 프리필터 ④ 드로어에 이벤트 ID 존재·행에는 부재 → 구현 → 통과 → Commit: `feat(admin): audit as sentence ledger with shared shell`

> 실행 노트: `?target=`은 SAFE 쿼리로 유지하고 parse 시 `clubId`에 매핑(서버 계약 불변). 라우트 파일은 searchParams 파싱이 이미 model에 있어 변경 없음. `auditOutcomeLabel`: SUCCESS→성공, FAILED→실패, DENIED→차단, PREPARED→진행, 그 외 원문.

### Task 4-2: 지원 → "접근 원장" 재조립

**Files:**
- Modify: `front/features/platform-admin/ui/admin-support-workbench.tsx`, `front/features/platform-admin/route/admin-support-route.tsx`
- Test: 기존 support 테스트 갱신

**요구사항:**
- `AdminPageContext`(제목 "접근 원장") 도입, 검색→발급 검토→이력이 한 컬럼 문법. 발급 검토의 인라인 버튼을 `AdminSafeActionDock`(L2: 사유+만료 필수, 확인 버튼 라벨 "지원 접근 발급")으로 교체. 기존 preview/confirm/receipt 로직·capability 게이트는 그대로 배선만 이동.
- 활성 grant가 있으면 알람 바 summary의 attention headline 후보에 포함(Task 2-1 훅에서 support 쿼리를 읽지 않으므로: 이 화면 진입 시에만 표기 — 전역 표기는 `## 실행 중 발견`에 서버 요약 후속으로 기록).
- 이력 행 문장화 + `supportGrantStatusLabel` 적용(1단계 완료분 재사용).

**Steps:**
- [x] 테스트: ① PageContext 헤딩 ② 사유·만료 없으면 발급 버튼 disabled ③ 확인 버튼 라벨이 행위 문장 → 구현 → 통과 → Commit: `feat(admin): support access ledger with shared shell`

> 실행 노트: 전역 `useAdminAlarmSummary`(2-1)에 support 쿼리를 붙이지 않음. 이 화면 PageContext `scope`에만 `활성 접근 N건` 표기. 전역 알람 바 상주는 서버 요약 후속.

### Task 4-3: 분석 → "분석 부록" 정리

**Files:**
- Modify: `front/features/platform-admin/ui/admin-analytics-overview.tsx` (31행), `front/features/platform-admin/route/admin-analytics-route.tsx`
- Test: analytics 테스트 갱신

**요구사항:** `AdminPageContext`(제목 "분석 부록") + 로딩/오류를 `AdminStatePanel`로 통일. KPI 타일에서 **행동 링크가 없는 타일 제거 기준 적용 금지**(데이터 축소는 범위 밖) — 표기만: 표 숫자에 `ledger-number`(tnum) 클래스, KPI 수치 우측 정렬. CSV 게이트 유지.

**Steps:**
- [ ] 테스트: ① PageContext 헤딩 ② 표 셀에 tnum 클래스 ③ forbidden 시 StatePanel → 구현 → 통과 → 공통 게이트 → CT 재잠금(`admin-support-workbench` 포함) → Commit: `feat(admin): analytics appendix shell` → **릴리스 체크포인트 4**

---

# 5단계 — 파이프라인 재편 (배달 원장 · 작업 원장)

### Task 5-1: 배달 원장 행 문법

**Files:**
- Modify: `front/features/platform-admin/ui/admin-notifications-page.tsx`
- Test: notifications 테스트 갱신

**요구사항:**
- Outbox/Delivery 이중 ledger 행을 3상태(`발송됨/대기/실패`) + 시도 배지("2차 시도") + **다음 재시도 예정 시각(응답에 있으면)** 표기로 재구성. 응답 필드는 기존 모델 타입(`rg "retry" front/features/platform-admin/model/platform-admin-workbench-model.ts`)에서 확인하고, 없으면 조건부 생략+후속 기록.
- Replay 패널을 실패 클러스터 바로 아래로 이동, 패널 상단에 고정 경고 문장: **"수동 재발송은 자동 재시도를 취소하지 않습니다."**
- 실패 클러스터 그룹 라벨에 `클럽 · 알림 유형 · 오류 분류`를 문장으로.

**Steps:**
- [ ] 테스트: ① 경고 문장 존재 ② 시도 배지 렌더(시도 수 fixture) ③ 상태 라벨 3종 한국어 → 구현 → 통과 → Commit: `feat(admin): delivery ledger row grammar`

### Task 5-2: 작업 원장(AI) 정리

**Files:**
- Modify: `front/features/platform-admin/ui/platform-admin-ai-ops.tsx`, `front/features/platform-admin/route/admin-ai-ops-route.tsx`
- Test: ai-ops 테스트 갱신

**요구사항:**
- route 이중 H1 해소: route는 `AdminPageContext`가 유일한 H1을 갖도록 정리(70·82·239행의 route-level `<h1>`은 시각 숨김 대신 제거하고, aria-labelledby 대상을 PageContext 헤딩 id로 연결).
- 진행 중 작업에 경과 시간 표기("N분째 진행"), 멈춤(임계 초과) 행은 warn 라벨 "멈춤 의심 · N분".
- 명령 모달의 확인 버튼 라벨을 행위 문장으로("작업 {id} 강제 취소").

**Steps:**
- [ ] 테스트: ① H1이 정확히 1개 ② 멈춤 라벨 ③ 확인 버튼 행위 문장 → 구현 → 통과 → 공통 게이트 → CT 재잠금 → Commit: `feat(admin): ai job ledger polish` → **릴리스 체크포인트 5**

---

# 6단계 — 클럽 상세 재조립 + 내비 전환

### Task 6-1: 클럽 상세를 공유 셸로 재조립

**Files:**
- Modify: `front/features/platform-admin/route/admin-club-detail-route.tsx`, `front/features/platform-admin/ui/domain-provisioning-panel.tsx`, `front/features/platform-admin/ui/admin-club-operations-page.tsx`
- Test: club detail 테스트 갱신

**요구사항:**
- 구획 순서: PageContext(클럽명·revision) → 사실 dl(공개 정보 읽기 뷰; 편집은 명시적 "편집" 진입) → 공개 상태·도메인 명령을 `AdminSafeActionDock`(L2) + `AdminReceiptTimeline`으로 교체(기존 preview/confirm 로직 재배선, "영수증 — 명령 접수" 라벨은 1단계 완료분) → 운영 스냅샷(정상 항목 숫자 숨김, 이탈만 수치) → **"이 클럽의 최근 기입"** = Task 3-3 `AdminTargetLedgerInline` 재사용(`moreHref=/admin/audit?target={clubId}`).
- conflict 복구·capability read-only 규칙 보존.

**Steps:**
- [ ] 테스트: ① Dock/Receipt 프리미티브 렌더 ② 스냅샷 정상 항목 무수치 ③ 최근 기입 링크 → 구현 → 통과 → Commit: `feat(admin): club detail on shared shell`

### Task 6-2: 내비 4축 전환 + 리다이렉트

**Files:**
- Modify: `front/features/platform-admin/model/admin-route-catalog.ts` (group/groupLabel 재편), `front/features/platform-admin/ui/admin-layout-nav.tsx`, `front/src/app` 어드민 라우트 등록부(경로 유지)
- Test: `admin-route-catalog.test.ts`, layout-nav 테스트, e2e 내비 흐름

**요구사항:**
- 그룹 재편: `services`→`pipeline`(라벨 "파이프라인": 배달 원장·AI 작업·서비스 건강), `review`→`ledger`(라벨 "원장": 운영 기입·접근 원장·분석 부록). `AdminRouteGroup` 타입 값 교체(`"services" | "review"` → `"pipeline" | "ledger"`) 및 참조 전부 갱신.
- 긴급 공개 회수는 그룹에서 빼서 내비 최하단 고정 링크(비상 레인) — `visibleAdminNav`에 `pinned: AdminRouteDescriptor[]` 반환 추가.
- URL 경로는 전부 유지(리다이렉트 불필요 — 그룹은 표시 개념). 오늘 케이스 카운트 배지: 알람 훅의 attention.count를 내비 "오늘" 항목 옆 mono 숫자로 (Task 2-1 재사용).
- `front/DESIGN.md` §Editorial Operations Ledger를 새 구성(케이스 데스크·서사·4축)으로 갱신하고, ADR-0047을 Accepted로 승격 + ADR-0045 superseded 표기 + ADR-0039 내비 축 서술 갱신 + 인덱스 동기화 (스펙 §10 승격 조건 충족 시에만).

**Steps:**
- [ ] 테스트 갱신(그룹 라벨·pinned) → 구현 → 통과 → 공통 게이트 전체 + CT 재잠금 + e2e 전체 → 문서·ADR 동기화 커밋 분리(`docs(adr): accept ADR-0047 …`) → Commit: `feat(admin): four-axis navigation` → **릴리스 체크포인트 6 (최종)**

---

## Self-Review 결과

- 스펙 §4.1~§4.7, §5, §7의 각 요구가 태스크에 매핑됨. §4.2 서사=2-2, §4.1 데스크=3-x, §4.5=4-x, §4.3=5-x, §4.4·내비=6-x, 모바일 보류 정리=3-2, 온콜 제약(파괴 명령 미제공)은 기존 모바일 상세가 L1만 노출하므로 3-2에서 유지 확인.
- 조건부 스누즈(신호 재발 자동 복귀)는 스펙 §8대로 시각 기반으로 축소(3-2), 후속 기록.
- 타입 일관성: `AdminAlarmSummary`·`traversal`·`AdminTargetLedgerInline`은 정의 태스크(2-1, 3-1, 3-3)의 시그니처를 후속 태스크(4-1, 6-1, 6-2)가 그대로 참조.
- 이 계획은 1단계 계획과 달리 스텝 코드 전문을 싣지 않은 태스크가 있다 — 대상 파일이 큰 기존 화면 재조립이라 정확한 코드는 실행 시점 파일 상태에 의존하기 때문이며, 사용자가 승인한 적응 실행 규약(위)이 그 판단을 실행자에게 위임한다. 각 태스크의 요구사항·인터페이스·테스트 어서션이 수용 기준이다.

## 실행 중 발견

(실행자가 기입: 서버 후속 / 이월 결함 / 계획 이탈 결정)

- 3-2: 서버에 dismiss API 없음. 무시는 기존 `SNOOZE`(최대 7일) + 사유 필수로 구현. snooze 요청 DTO는 unknown field를 거부하므로 사유를 HTTP body에 넣지 않음 — 사유 보존은 서버 후속.
- 4-2: 활성 support grant를 전역 알람 바 attention 후보에 넣으려면 서버 요약(또는 2-1 훅의 support 쿼리)이 필요함. 이번 화면은 PageContext scope `활성 접근 N건`만 표기.
