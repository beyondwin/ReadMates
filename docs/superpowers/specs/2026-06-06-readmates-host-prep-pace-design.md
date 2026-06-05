# ReadMates M-2 — 호스트 회차 준비 페이스

작성일: 2026-06-06
상태: APPROVED DESIGN SPEC

## 1. 배경

Post–Admin vNext 고도화 엄브렐러(`2026-05-31-post-admin-vnext-enhancement-umbrella-design.md`)는 순서를 **H → A → M → P**로 고정했다. H(하드닝 베이스라인)와 A(분석 심화: 시계열 뷰 + CSV export)는 코드로 닫혔고, M(멤버/호스트 제품 경험)의 첫 하위 표면인 멤버 리딩 경험(M-1: `2026-06-04-readmates-member-reading-experience-design.md`)도 닫혔다.

엄브렐러 §5.3은 M을 "멤버 리딩 경험 / **호스트 클럽 운영 흐름**"으로 정의했는데, M-1은 멤버 쪽 절반만 열었다. 이 문서는 M의 나머지 절반인 **호스트 운영 경험**의 첫 하위 표면(M-2)이며, M-1이 멤버에게 준 두 축 중 **"현재 세션 페이스"**에 대응하는 호스트 버전이다.

현재 호스트 대시보드는 reading-loop 기반 next-operation-action과 체크리스트("7일 전 / 3일 전 / 1일 전" 일정 라벨)를 갖고 있지만, 그 일정 라벨이 **실제 남은 일수(D-day)와 묶여 있지 않다.** D-1인데 RSVP 미응답이어도 D-7과 시각적으로 동일하게 보인다. 이 spec은 그 갭을 닫는다: 회차 준비 항목을 마감창에 매핑해 "지금 시점에 끝나 있어야 할 항목이 끝났는가"를 페이스 티어로 표현한다.

## 2. Source Documents

- 직전 엄브렐러: `docs/superpowers/specs/2026-05-31-post-admin-vnext-enhancement-umbrella-design.md` (§5.3 M 경계)
- 멤버 대응 표면(패턴 참조): `docs/superpowers/specs/2026-06-04-readmates-member-reading-experience-design.md`
- 멤버 페이스 모델(구조 미러): `front/shared/model/reading-pace.ts`
- 아키텍처 source of truth: `docs/development/architecture.md`
- Frontend 가이드: `docs/agents/front.md`
- Design 가이드: `docs/agents/design.md`

## 3. 성공 기준

"화면이 늘었다"가 아니다.

- 호스트가 대시보드에서 "모임일까지 며칠 남았고, 지금 시점에 끝나 있어야 할 준비가 됐는지"를 한눈에 안다.
- 페이스가 정적 체크리스트를 넘어, 실제 D-day 대비 가장 급한 미완료 항목을 지목한다.
- 데이터가 얇거나(세션 없음·날짜 파싱 불가) 정직하지 않은 임박을 만들지 않는다.
- admin↔host 경계와 공개 저장소 안전을 깨지 않는다.
- 신규 서버 슬라이스·CRUD 없이 기존 계약·데이터를 재사용한다.

## 4. 범위 & 경계

### 4.1 건드릴 표면 (호스트 전용)

- `front/features/host/model/` — 신규 순함수 `host-prep-pace.ts`.
- `front/features/host/ui/host-dashboard.tsx`(및 `ui/dashboard/*` 중 session phase / next-operation-action 렌더 지점) — 페이스 배지 + 한 줄 표시.

### 4.2 계약

- 재사용: `HostDashboardCurrentSession`(`session.date`), `HostDashboardData`(`rsvpPending`·`checkinMissing`·`publishPending`·`feedbackPending`), 기존 `reading-loop` 상태.
- 신규: `front/features/host/model/host-prep-pace.ts` (feature-local 순함수). 입력이 멤버 읽기 진행률이 아니라 호스트 운영 항목이므로 `shared`가 아닌 host 로컬에 둔다.
- 서버/계약 변경: **0.**

### 4.3 경계 보존

- **호스트 전용.** admin/멤버 표면·계약·라우트 변경 없음.
- admin↔host frontend boundary test는 무변경 통과해야 한다(이 작업은 admin을 import하지 않음).
- 신규 서버 슬라이스·CRUD 없음.

### 4.4 Non-goals

- 신규 host CRUD/명령(리마인더 발송 연결 등) 추가 금지 — 그것은 별도 M 하위 표면.
- admin 전용 신호(support grant, raw member email, notification replay)를 host로 이전 금지.
- `questionDeadlineAt`을 질문 마감창으로 끌어오는 것은 후속 확장으로 보류(현재 `HostDashboardCurrentSession`에 미노출이라 끌어오면 범위가 커짐).
- 멀티 세션 추세·클럽 간 비교(이는 admin analytics 또는 별도 M 하위 표면).
- 차팅 인프라 도입 금지.

## 5. Slice — 호스트 회차 준비 페이스 (프론트 전용)

### 5.1 신규 순함수 `front/features/host/model/host-prep-pace.ts`

`reading-pace.ts`의 구조·라벨 규칙을 미러하되 도메인이 다르다.

```text
type HostPrepPaceTier = "STEADY" | "ON_TRACK" | "TIGHT" | "URGENT" | "OVERDUE";

type HostPrepPaceItemId = "session-basics" | "rsvp" | "checkin";

type HostPrepPaceInput = {
  hasSession: boolean;
  sessionDate: string | null | undefined; // YYYY-MM-DD (모임일 = 마감)
  hasCoreSessionInfo: boolean;   // 책·일정·미팅 URL 등 기본 정보 완비
  rsvpPending: number;
  checkinMissing: number;
  publishPending: number;        // 마감 정리(closeout) 신호
  feedbackPending: number;       // 마감 정리(closeout) 신호
  today?: Date;
};

type HostPrepPaceItem = {
  id: HostPrepPaceItemId;
  daysRemaining: number;         // 판정 시점의 D-day
  threshold: number;             // 마감창(일 전)
  slack: number;                 // daysRemaining - threshold
};

type HostPrepPace = {
  tier: HostPrepPaceTier;
  daysRemaining: number | null;  // sessionDate 없거나 파싱 불가면 null
  label: string;
  message: string;
  mostUrgentItem: HostPrepPaceItem | null; // 티어를 만든 단일 항목
};

deriveHostPrepPace(input): HostPrepPace
```

### 5.2 마감창 매핑

각 **미완료** 준비 항목을 체크리스트의 기존 "N일 전" 일정에 임계로 매핑한다(plan 단계에서 상수로 고정·단위테스트로 핀):

| 항목 id | 미완료 조건 | 임계(threshold) |
|---|---|---|
| `session-basics` | `!hasCoreSessionInfo` | 7 (D-7) |
| `rsvp` | `rsvpPending > 0` | 3 (D-3) |
| `checkin` | `checkinMissing > 0` | 1 (D-1) |

`publishPending`/`feedbackPending`는 모임 후 마감 정리(closeout) 신호이므로 모임-전 준비창이 아니라 `OVERDUE`(§5.3) 판정에만 쓴다.

### 5.3 티어 규칙 (초안 — plan에서 경계값 고정)

- `session === null` 또는 `sessionDate` 파싱 불가: `daysRemaining = null`, 가짜 임박 금지. 미완료 준비 항목이 있으면 `ON_TRACK`, 없으면 `STEADY`(일수 기반 임박/촉박 금지). 멤버 페이스의 null 처리와 동형.
- `daysRemaining < 0`(D+, 모임일 지남): `publishPending > 0 || feedbackPending > 0`이면 `OVERDUE`, 아니면 `STEADY`(정리할 게 없음).
- `daysRemaining >= 0`(모임 전): 각 미완료 항목의 `slack = daysRemaining - threshold`로 판정하고 가장 급한 항목이 전체 티어를 결정.
  - 미완료 항목 중 `slack < 0`(이미 끝났어야 할 게 남음) 존재 → `URGENT`.
  - 미완료 항목 중 `slack`이 작음(임계 근접; 경계값 plan에서 고정, 예: `slack <= 1`) → `TIGHT`.
  - 미완료 항목이 있으나 모두 여유 있음 → `ON_TRACK`.
  - 미완료 준비 항목 없음 → `STEADY`.
- `mostUrgentItem`은 위에서 티어를 만든 단일 항목(slack 최소; OVERDUE는 closeout 신호). UI 한 줄 메시지의 근거.

라벨(초안): `STEADY`=여유, `ON_TRACK`=적정, `TIGHT`=촉박, `URGENT`=임박, `OVERDUE`=마감 지남.

날짜 파싱은 `reading-pace.ts`/`host-dashboard-model.ts`의 `YYYY-MM-DD` 로컬 날짜 규칙을 재사용한다. 임계·slack 경계값은 상수로 두고 단위테스트로 고정한다.

### 5.4 UI

- 호스트 대시보드의 session phase / next-operation-action 근처에 페이스 표시(배지 + 한 줄 메시지). 색상에 더해 **항상 텍스트 라벨과 `aria-label`을 함께** 노출(H 베이스라인, calm operating-ledger 톤).
- 페이스는 next-operation-action을 대체하지 않고 보강한다(모임-전 준비 맥락일 때 의미 있음). `mostUrgentItem`의 한 줄("RSVP가 D-3까지였는데 N명 미응답" 형태)을 함께 보여준다.
- 새 라우트·새 카드 패밀리 없음. 기존 대시보드 표면 안에서 표시.

### 5.5 서버·계약

- 변경 0. 페이스는 기존 `session.date` + `HostDashboardData` pending 카운트만으로 프론트에서 파생한다.

## 6. 검증

- `host-prep-pace.test.ts`: 각 마감창(D-7/D-3/D-1 경계), D+ closeout, null/파싱불가 date, 미완료 0, slack 경계값 단위테스트.
- 호스트 대시보드 렌더 테스트: 페이스 배지 + `aria-label` 어서션, 미완료 0일 때 STEADY 표기.
- `pnpm --dir front lint` / `pnpm --dir front test` / `pnpm --dir front build`.
- E2E/auth/BFF 변경 없음(프론트 전용 파생).

## 7. 아키텍처 원칙

- `docs/development/architecture.md`를 source of truth로 따른다.
- 기존 계약·데이터를 재사용하고 신규 인프라를 도입하지 않는다.
- admin↔host 경계 테스트를 보존한다(직접 import 차단).
- 공개 저장소 안전을 지킨다(실 멤버 데이터·secret·token-shaped 예시 금지).

## 8. 범위 밖 / 후속

- `questionDeadlineAt` 기반 질문 마감창 추가는 후속 확장.
- 리마인더 발송 실행 연결, 멀티 세션 운영 추세/회고는 별도 M 하위 표면으로 분리한다.
- CHANGELOG `Unreleased` 갱신과 release-readiness 검토(`docs/development/release-readiness-review.md`)는 구현 완료 시 적용한다.
