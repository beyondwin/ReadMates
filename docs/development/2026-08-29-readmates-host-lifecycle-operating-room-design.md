# ReadMates 호스트 운영실 — 모임 생애주기와 작업함 통합 설계

- 날짜: 2026-08-29
- 표면: Host app (`/clubs/:slug/app/host/**`, 호환 `/app/host/**`)
- 상태: 시각 방향 승인됨, 구현 전
- ADR impact: **supersede + new** — ADR-0046을 ADR-0048로 대체하고, 일정 revision 확인 의미를 ADR-0049로 분리
- 관련: ADR-0018, ADR-0019, ADR-0021, ADR-0023, ADR-0026, ADR-0028, ADR-0035, ADR-0038, ADR-0045, ADR-0046, ADR-0048, ADR-0049, `front/DESIGN.md`
- 승인 시안:
  - [`07-host-lifecycle-operating-room-approved.png`](host-redesign-mockups/07-host-lifecycle-operating-room-approved.png) — 운영실·준비실
  - [`08-host-operating-room-live-approved.png`](host-redesign-mockups/08-host-operating-room-live-approved.png) — 운영실·현장
  - [`09-host-operating-room-closing-approved.png`](host-redesign-mockups/09-host-operating-room-closing-approved.png) — 운영실·마감실
  - [`10-host-meetings-library-approved.png`](host-redesign-mockups/10-host-meetings-library-approved.png) — 일정과 모임
  - [`11-host-people-ledger-approved.png`](host-redesign-mockups/11-host-people-ledger-approved.png) — 사람 원장
  - [`12-host-records-ledger-approved.png`](host-redesign-mockups/12-host-records-ledger-approved.png) — 기록 원장
  - [`13-host-invites-settings-approved.png`](host-redesign-mockups/13-host-invites-settings-approved.png) — 초대와 설정
  - [`14-host-unread-schedule-review-approved.png`](host-redesign-mockups/14-host-unread-schedule-review-approved.png) — 일정 미열람 검토
  - [`15-mobile-host-operating-room-prep-approved.png`](host-redesign-mockups/15-mobile-host-operating-room-prep-approved.png) — 모바일 운영실·준비실
  - [`16-mobile-host-live-attendance-approved.png`](host-redesign-mockups/16-mobile-host-live-attendance-approved.png) — 모바일 운영실·현장 출석
  - [`17-mobile-host-person-detail-approved.png`](host-redesign-mockups/17-mobile-host-person-detail-approved.png) — 모바일 사람 상세

## 1. 결정 요약

호스트 홈을 날짜 중심 `오늘` 화면이 아니라 **현재 모임을 준비·진행·마감하는 운영실**로 바꾼다. 한 화면의 스캔 순서는 `현재 모임 → 준비실/현장/마감실 → 다음에 할 일 → 준비 현황 → 호스트 작업함`이다. 모임 밖 업무는 우측 작업함에 남겨 현재 모임에 집중하면서도 가입 승인, 지난 기록 마감, 초대 링크 관리가 사라지지 않게 한다.

ReadMates의 warm paper, ink hierarchy, restrained navy, Pretendard-only 원칙은 유지한다. 제목까지 bundled Pretendard Variable을 사용하며 serif·calligraphic display font를 추가하지 않는다. 시각 권위는 차분한 **Quiet Editorial Desk**이며 KPI 카드 대시보드, 좌측 사이드바, 유리·광택·과한 둥근 카드, 갈색 서점 향수는 사용하지 않는다.

계정·멤버 identity는 이니셜, 생성형 동물 그림, 시안에서 잘라낸 bitmap으로 대체하지 않는다. `front/shared/ui/book-club-avatar.ts`의 catalog key와 `AvatarChip` size role을 사용해 `/assets/avatars/book-club/*.webp`를 직접 렌더링한다.

## 2. 해결해야 하는 운영 문제

현행 구현은 `HostTodayView`가 다음 모임, 처리 큐, 다가오는 일정을 별도 묶음으로 조합하고(`front/features/host/model/host-today-model.ts:23`), `HostTodayPage`가 큐와 히어로, 참고 레일을 순서대로 렌더링한다(`front/features/host/ui/today/host-today-page.tsx:141`). 이 구성은 일일 트리아지에는 적합하지만 다음 문제를 남긴다.

- 호스트가 지금 어느 모임을 어떤 단계에서 운영 중인지 먼저 해석해야 한다.
- 일정 확인, 참석 응답, 실제 출석이 가까이 보일 때 서로 같은 사실처럼 오해하기 쉽다.
- 기록, 초대, 설정, 멤버 시야 같은 기능이 내비게이션 밖으로 이동해 발견성이 약하다.
- 현재 모임과 무관한 업무를 놓치지 않으면서도 다음 행동 하나에 집중하기 어렵다.

성공 기준은 호스트가 화면 진입 후 2초 안에 `어느 모임인지`, `어느 단계인지`, `다음 행동이 무엇인지`, `놓치면 안 되는 다른 업무가 있는지`를 설명할 수 있는 것이다.

## 3. 정보 구조

### 3.1 전역 셸

| 영역 | 항목 | 계약 |
| --- | --- | --- |
| 브랜드 | `ReadMates` | 공용 브랜드 홈으로 이동한다. |
| 문맥 전환 | `읽는사이 · 호스트 운영실` | 클럽과 역할 공간을 하나의 버튼에서 전환한다. club identity는 URL 권위를 따른다. |
| 1차 내비게이션 | `운영실` · `일정과 모임` · `사람` · `기록` | 데스크톱에서 항상 보인다. 현재 위치는 밑줄과 `aria-current`로 함께 표시한다. |
| 유틸리티 | `초대와 설정` · `멤버 시야` · 알림 · 계정 | 업무 내비와 시야·계정 제어를 분리한다. |
| 생성 | `새 모임` | 유일한 전역 생성 행동이며 quiet outline을 사용한다. |

`일정과 모임`은 예정·지난 모임, 캘린더, 새 모임, 모임 편집을 소유한다. `사람`은 가입 승인과 멤버 원장을 소유한다. `기록`은 회차 기록, 마감 상태, 게시 이력을 소유한다. `초대와 설정`은 초대 링크와 클럽 설정을 한 utility destination으로 묶되 권한이 없는 항목은 숨기지 말고 제한 이유를 보여준다.

### 3.2 현재 모임 운영실

운영실은 선택된 현재 모임 하나를 기준으로 다음 구조를 가진다.

1. 모임 문맥: 표지, 제목, D-day, 날짜·시간·장소, `모임 정보`, `일정 편집`, `변경 이력`.
2. 운영 단계: `준비실` · `현장` · `마감실`. 같은 모임의 local task navigation이며 전역 메뉴가 아니다.
3. 다음에 할 일: 계산된 주 행동 하나, 근거, 직접 검토 CTA, 보류.
4. 준비 현황: 일정 확인, 참석 응답, 발제 질문, 장소 준비를 한 원장으로 비교.
5. 호스트 작업함: 현재 모임 안팎의 처리 업무를 `지금` · `보류` · `완료` 상태로 유지.

현재 모임이 없으면 빈 운영실에서 `첫 모임 만들기`를 주 행동으로 제공한다. 후보가 여러 개면 서버가 정한 current/active 규칙을 따르며 프런트가 임의로 최근 날짜를 선택하지 않는다.

## 4. 화면 구성 계약

### 4.1 데스크톱

- 최대 콘텐츠 폭은 기존 container contract를 재사용하고, 본문은 약 68/32 비대칭 2열로 구성한다.
- 상단 전역 셸과 모임 문맥은 전체 폭을 사용한다.
- 왼쪽은 `다음에 할 일`과 `준비 현황`을 하나의 연속 지면으로 구성한다.
- 오른쪽 `호스트 작업함`은 세로 hairline으로 구분하며 별도 카드 배경을 만들지 않는다.
- 화면 전체에서 filled primary CTA는 하나만 허용한다. 나머지는 outline, text, row affordance를 사용한다.
- 정보가 없는 빈 공간을 영웅 영역처럼 키우지 않는다. 첫 viewport 안에 준비 현황 최소 3행과 작업함 최소 3행이 보이게 한다.

### 4.2 모바일·태블릿

- 767px 이하에서는 1차 내비게이션을 하단 4탭 `운영실` · `모임` · `사람` · `기록`으로 바꾸고 safe-area를 보장한다. 데스크톱의 `일정과 모임`은 모바일에서 `모임`으로 축약하되 목적지는 같다.
- `초대와 설정`, `멤버 시야`, 알림, 계정은 상단 utility sheet에서 접근한다. `멤버 시야`는 현재 모임 헤더에도 유지한다.
- 모임 문맥 → 단계 탭 → 다음 행동 → 준비 현황 → 작업함 순으로 단일 열 재배치한다.
- 작업함 상태 탭은 sticky가 아니며, 주 행동만 필요한 단계에서 하단 sticky action을 허용한다. 본문 CTA와 동시에 같은 accessible name을 노출하지 않는다.
- 원장 행은 가로 스크롤 표가 아니라 `항목/핵심 수치/세부 상태/행동`의 2행 리스트로 재구성한다.
- 768–1199px에서는 작업함을 본문 아래로 내리고 요약 카운트를 단계 탭 아래에 제공한다.

모바일 시각 권위는 동일한 866×1846 규격의 승인 자산 `15`–`17`이다. 세 자산은 데스크톱을 단순 축소하지 않고 390px 기준으로 운영실·현장 출석·사람 상세의 정보 구조를 다시 편집한다. 구현 시 승인 PNG를 배경으로 사용하지 않으며 390px CT fixture에서 하단 safe-area, 44px 이상 터치 영역, 한 손 조작, 긴 한국어 문자열을 구조적으로 검증한다.

## 5. 컴포넌트 계약

컴포넌트는 `ui`에서 props/callback만 받고, route가 query·mutation·URL·권한을 소유한다. 새 API 사실은 feature-owned `api`, 계산은 pure `model`, query와 invalidation은 `queries`에 둔다.

| 컴포넌트 | 책임 | 필수 상태 |
| --- | --- | --- |
| `HostWorkspaceSwitcher` | 클럽과 `호스트 운영실` 문맥을 하나의 trigger로 표시 | loading, 단일 클럽, 다중 클럽, 권한 상실 |
| `HostPrimaryNavigation` | 4개 업무 영역과 현재 위치 표시 | desktop, mobile, overflow, denied destination |
| `HostUtilityActions` | 초대·설정, 멤버 시야, 알림, 계정, 새 모임 | unread, permission-limited, menu open |
| `CurrentMeetingHeader` | 현재 모임 identity와 편집·이력 진입 | loading, none, active, stale, partial |
| `MeetingPhaseTabs` | 준비실·현장·마감실 local task navigation | available, current, blocked, complete |
| `HostNextAction` | 계산된 주 행동 하나와 근거·보류 | actionable, deferred, conflict, unknown outcome, none |
| `PreparationLedger` | 서로 다른 준비 사실을 연속 원장으로 비교 | loading, partial row, empty, stale |
| `PreparationLedgerRow` | 항목, 분모가 있는 수치, 세부 상태, drill-down | normal, warning, complete, unavailable |
| `HostWorkbox` | 모임 밖 업무까지 포함한 상태 기반 inbox | 지금, 보류, 완료, zero-as-data, partial failure |
| `HostWorkItem` | 대상·기한·상태·해결 목적지 | due, overdue, deferred, completed, failed |
| `OperationReceipt` | 발송·변경·처리 결과를 지속적으로 증명 | pending, succeeded, partial, failed, unknown |

공유 가능한 것은 primitive와 상태 문법이다. `PreparationLedgerRow`와 `HostWorkItem`을 하나의 범용 `Card`로 합치지 않는다. 전자는 사실 비교, 후자는 처리 큐라는 다른 인지 모델을 가진다.

## 6. 일정 확인·응답·출석 의미

ADR-0049의 네 사실을 UI에서도 합치지 않는다.

| 사실 | 질문 | 표시 예 | 다른 사실로 대체 금지 |
| --- | --- | --- | --- |
| 최근 클럽 접속 | 최근에 공간에 들어왔는가 | `최근 접속 2일 전` | 일정 확인으로 간주하지 않는다. |
| 최신 일정 확인 | 현재 일정 revision을 열었는가 | `현재 일정 확인 8/12` | 단순 접속·알림 전달로 간주하지 않는다. |
| 참석 응답 | 참석 의사를 밝혔는가 | `참석 7 · 불참 2 · 미응답 3` | 실제 출석으로 간주하지 않는다. |
| 실제 출석 | 모임에 실제 참여했는가 | 현장 단계의 출석 원장 | 응답값으로 자동 확정하지 않는다. |

일정이 바뀌면 이전 revision을 본 멤버는 `변경 전 확인`, 아직 어떤 revision도 보지 않은 멤버는 `미열람`, 최신 revision을 본 멤버는 `현재 일정 확인`으로 분류한다. 호스트는 멤버별 상세에서 상태와 기준 시각을 볼 수 있지만 페이지 이동 기록이나 세부 행동 로그를 보여주지 않는다.

현재 계약만으로 최신 revision 확인을 증명할 수 없다면 숫자를 추정해 렌더링하지 않는다. 해당 행은 `집계 준비 중`으로 실패 닫힘 처리하고 ADR-0049의 서버·영속성 slice를 먼저 구현한다.

## 7. 상호작용과 복구

- `대상과 문구 검토`는 발송 전 대상·제외 대상·문구를 확인하는 review step으로 이동한다. 자동 전송하지 않는다.
- `내일 09:00까지 보류`는 작업을 삭제하지 않고 작업함 `보류`로 이동시키며, 만료 시 `지금`으로 돌아온다.
- 일정 편집 후에는 변경 요약과 revision을 만들고, 기존 확인 상태를 `변경 전 확인`으로 재분류한다.
- mutation은 기존 revision guard와 idempotency receipt를 유지한다. 409는 최신 상태를 다시 읽고 사용자 입력을 보존한다.
- 발송 성공은 toast만으로 끝내지 않고 `OperationReceipt`와 변경 이력에 남긴다. 부분 실패와 unknown outcome은 작업함에서 사라지지 않는다.
- 권한 상실 시 host-sensitive query cache와 draft를 폐기하고 멤버 시야 또는 안전한 목적지로 이동한다.

## 8. 토큰과 시각 문법

새 palette나 role-only theme를 만들지 않는다. `design/system/src/styles/tokens.css`의 다음 역할을 재사용한다.

- surface: `--paper-*`, `--bg`, `--bg-sub`
- text: `--ink-*`, `--text`, `--text-2`
- action: `--accent`, `--accent-hover`, `--accent-soft`
- state: `--danger`, `--warn`/`--stale`, `--ok`/`--success`
- focus/motion: `--focus-ring*`, `--motion-*`
- typography: bundled Pretendard Variable only; 화면 제목 700–750, section/tab 600–650, body 400–500, tabular 숫자는 기존 mono utility
- identity artwork: `book-club-avatar.ts` catalog + `AvatarChip`; 실제 WebP를 직접 사용하고 이니셜·동물·생성형 대체 이미지를 만들지 않음

간격은 기존 `--space-*` 리듬과 최소 44px target을 사용한다. 색만으로 상태를 구분하지 않고 icon, label, 문장 중 하나를 함께 제공한다. 긴 한국어·영어는 자르지 않고 wrapping하며 200% zoom에서도 기능을 잃지 않는다.

## 9. 기능 완전성 체크리스트

구현에서 아래 진입점을 제거하거나 다른 화면에 숨기지 않는다.

- 전역: 운영실, 일정과 모임, 사람, 기록, 초대와 설정, 멤버 시야, 알림, 계정, 새 모임
- 현재 모임: 모임 정보, 일정 편집, 변경 이력
- 단계: 준비실, 현장, 마감실
- 다음 행동: 대상과 문구 검토, 보류, 행동 근거
- 준비 현황: 현재 일정 확인, 참석 응답, 발제 질문, 장소 준비, 각 상세 보기
- 작업함: 지금, 보류, 완료, 일정 미열람 확인, 가입 승인 검토, 지난 모임 기록 마감, 초대 링크 만료 확인, 처리 receipt

기능이 현재 API로 지원되지 않으면 삭제하거나 가짜 데이터로 채우지 않고 구현 계획에서 dependency로 분리한다.

## 10. 구현 경계와 단계

실행 권위는 `docs/superpowers/plans/2026-08-29-host-lifecycle-operating-room-program-index.md`와 그 문서가 고정한 Stage 1–5 계획이다. ADR-0046 기반 `2026-08-27-host-*` 계획은 역사 기록이며 이 설계 구현에 사용하지 않는다.

구현 소유 경계는 다음과 같고, 실제 파일·API·migration 순서는 위 프로그램 계획에서 현재 코드 기준으로 확정한다.

1. **데이터 의미 선행**: ADR-0049에 필요한 schedule revision/seen fact, read model, privacy-safe 조회 계약.
2. **셸 전환**: 4개 업무 영역, combined context switcher, utility actions, 구 경로 redirect.
3. **운영실 composition**: current meeting header, phase tabs, next action, preparation ledger.
4. **작업함 통합**: existing attention/notification/approval/closing signal을 상태 기반 workbox view model로 조합.
5. **복구·반응형·시각 계약**: loading/empty/partial/stale/403/409/unknown outcome, 390/768/1024/1440 CT, E2E.
6. **결정 closeout**: 구현·테스트·`front/DESIGN.md`·architecture가 일치한 뒤 ADR-0048/0049를 Accepted로 승격.

Frontend는 route-first 경계를 유지한다. 일정 확인 semantics가 서버 fact를 요구하므로 해당 slice는 server/BFF/front vertical slice로 계획하며, 나머지 composition은 조회 가능한 기존 계약을 재사용한다.

## 11. 검증 계약

Acceptance matrix에서 다음 row를 선택한다.

- `UI or runtime state`: loading, empty, denied, stale, partial, error, wrapping, desktop, mobile.
- `Actor or authorization`: HOST 허용, authority loss 후 host state 폐기, member-view 전환.
- `Club context`: URL-authoritative club 전환과 다른 클럽 cache 혼입 방지.
- `모임 lifecycle`: 준비실·현장·마감실의 허용 단계와 blocked action.
- `Cursor collection`: 작업함·사람·기록의 continuation이 포함될 때만 적용.
- `Persistence or migration`: schedule revision/seen 저장이 추가될 때 적용.

인접한 public exposure, OAuth, provider, emergency takedown row는 이 설계 자체가 해당 계약을 바꾸지 않으므로 제외한다.

구현 단계의 최소 명령:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
```

서버 계약·migration이 추가되면 focused server test, `./scripts/server-ci-check.sh`, 필요 시 `./server/gradlew -p server integrationTest`를 추가한다.

## 12. 비범위

- 플랫폼 관리자 composition 변경.
- 멤버·게스트·퍼블릭 화면의 정보 구조 변경.
- 세부 행동을 추적하는 감시형 analytics 또는 페이지 방문 이력 노출.
- 호스트 검토 없는 자동 재촉 발송.
- 승인 PNG를 그대로 배경 이미지로 사용하는 구현.

## 13. 승인 자산의 사용 규칙

승인 PNG 07–17은 visual reference이며 code-native UI의 대체물이 아니다. 프로젝트에 별도 candidate PNG를 구현 권위로 보존하지 않는다. 메뉴·카피·상태·접근성·responsive contract는 이 문서가 규범이다. 구현 후에는 React component와 CSS token이 editable source가 되고, tracked CT screenshot이 회귀 기준이 된다.

이미지에 사용된 인물·클럽·모임 데이터는 모두 가상 예시다. 자산의 생성 receipt와 기계적 검증값은 `host-redesign-mockups/README.md`에 기록한다.
