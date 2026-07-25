# ReadMates 호스트 대시보드 우선순위 운영 원장 재구성 설계

작성일: 2026-07-25
상태: USER-APPROVED
대상 표면: frontend, host dashboard, responsive UI, host operations UX

## 1. 배경

호스트 대시보드는 세션 준비, 멤버 참여, 기록 마감, 알림, 초대, AI 기본 모델을 한 화면에서 확인하게 한다. 현재 화면은 필요한 데이터를 대부분 갖고 있지만 같은 상태를 여러 섹션에서 반복하고, 데스크톱의 비대칭 2열 구조가 긴 빈 공간을 만들며, 모바일은 모든 섹션을 순서대로 쌓아 관리자에게 과도한 스크롤을 요구한다.

현재 로컬 fixture를 기준으로 확인한 대표 문제는 다음과 같다.

- 1440×1000 데스크톱에서 문서 전체 높이가 약 3,515px다.
- 390×844 모바일에서 문서 전체 높이가 약 4,458px다.
- 상단 운영 지표, 기록 확인, 다음 행동, 공개·피드백, 체크리스트에 동일한 대기 상태가 반복된다.
- 데스크톱의 좌측 주 콘텐츠와 우측 운영 카드 묶음이 하나의 긴 grid row를 공유해 짧은 쪽 아래에 큰 빈 공간이 생긴다.
- 알림, 초대, 미연결 액션, AI 설정이 각각 큰 설명 영역을 차지하지만 실제 사용 빈도와 긴급도는 낮다.
- 완료·0건 상태와 즉시 조치가 필요한 상태가 비슷한 시각적 무게를 갖는다.

호스트 화면은 일반적인 SaaS 지표판이 아니라, 지금 처리할 업무와 그 근거를 빠르게 읽는 정확한 운영 원장처럼 느껴져야 한다.

## 2. 목표와 성공 기준

이번 작업의 목표는 호스트 대시보드를 **우선순위 운영 원장**으로 재구성해 판단 시간과 스크롤을 줄이는 것이다.

성공 기준:

- 호스트가 첫 화면에서 현재 세션, 가장 중요한 다음 행동, 조치가 필요한 기록을 파악한다.
- 같은 상태를 여러 섹션에서 반복하지 않고 하나의 대표 위치에서 보여 준다.
- 데스크톱에서 서로 다른 높이의 전역 좌우 컬럼을 제거해 구조적 빈 공간을 없앤다.
- 완료·0건 상태는 축약하고, 조치가 필요한 상태는 이유와 이동 경로를 함께 보여 준다.
- 대표 fixture 기준 데스크톱 전체 길이는 약 2개 viewport 안팎을 목표로 한다.
- 모바일 첫 viewport에 현재 세션과 최우선 행동이 모두 나타난다.
- 모바일의 안정 상태와 상세 원장은 접근 가능한 점진 공개 방식으로 접을 수 있다.
- 기존 API, 서버, DB, auth/BFF 계약을 변경하지 않는다.
- 데스크톱과 모바일 모두 WCAG AA 대비, 가시적 focus, 의미 있는 heading과 landmark, 한국어·영어 줄바꿈을 유지한다.

## 3. Non-goals

- 새 서버 endpoint, 응답 필드 또는 DB migration 추가.
- 알림 리마인더처럼 현재 연결되지 않은 기능 구현.
- 호스트 외 member, public, platform admin 화면 재설계.
- 전역 디자인 시스템 또는 앱 내비게이션 재구성.
- `/clubs/:slug/app/host1` compatibility route 추가. 대상은 현재 canonical route인 `/clubs/:slug/app/host`다.
- 배포, production smoke, release tag 또는 remote push.
- 현재 별도로 진행 중인 세션 기록 revision/API 작업 변경.

## 4. 검토한 접근

### A. 우선순위 운영 원장 — 선택

현재 세션과 우선 행동을 첫 행에 두고, 중복 상태를 하나의 처리 대기 원장으로 통합한다. 이후 섹션은 전역 2열 구조가 아닌 독립된 full-width 행으로 구성한다.

장점:

- 현재 데이터와 route-first 구조를 유지하면서 판단 순서를 개선할 수 있다.
- 긴 빈 공간과 상태 중복을 함께 해결한다.
- desktop과 mobile이 같은 정보 우선순위를 공유할 수 있다.

단점:

- 620줄 규모의 기존 dashboard component를 역할별 UI component로 분리해야 한다.
- 상태별 축약·확장 규칙을 view model과 테스트로 명시해야 한다.

### B. 고정 액션 사이드바

현재 2열 구조를 유지하고 우측 액션 영역을 sticky 처리한다.

장점:

- 변경 범위가 상대적으로 작다.
- 스크롤 중 다음 행동이 계속 보인다.

단점:

- 우측이 먼저 끝나는 비대칭과 중복 정보가 남는다.
- viewport가 낮거나 좁을 때 sticky 영역 자체가 긴 스크롤 컨테이너가 될 수 있다.

### C. 탭형 대시보드

세션, 기록, 멤버, 운영 도구를 탭으로 분리한다.

장점:

- 화면 길이를 가장 크게 줄일 수 있다.
- 각 작업 영역의 밀도를 높이기 쉽다.

단점:

- 긴급 기록이나 알림 상태가 비활성 탭 뒤에 숨는다.
- 호스트가 전체 운영 상태를 한눈에 판단하기 어렵다.
- URL·탭 상태와 키보드 탐색을 추가로 관리해야 한다.

선택한 접근은 A다. B는 현재 레이아웃 문제를 부분적으로만 해결하고, C는 운영 상태의 발견 가능성을 낮춘다.

## 5. 정보 구조

### 5.1 Compact header

페이지 제목과 한 줄 설명만 유지한다. 반복되는 `운영` eyebrow와 긴 안내 문구는 줄이고, 화면의 첫 정보가 실제 운영 상태가 되게 한다.

### 5.2 오늘의 운영

첫 번째 독립 grid row는 두 영역만 가진다.

1. **현재 세션**
   - 회차, 날짜, 책, 장소, 마감 상태.
   - 참석, 읽기, 질문 핵심 수치.
   - 세션 문서 편집 primary action.
   - 전체 멤버 목록은 기본 노출하지 않고 `참석 6명 · 미응답 4명`처럼 요약한다.

2. **지금 처리할 일**
   - `missingMembers`, `nextAction`, record attention, failed/dead notification 중 조치 가능성과 심각도를 기준으로 최대 3건을 보여 준다.
   - 각 항목은 상태명, 이유, 수치, 실제 이동 또는 inline action을 가진다.
   - 조치 대상이 없으면 작은 안정 상태 한 줄과 세션 문서 확인 링크만 보여 준다.

이 2열은 첫 행 안에서만 사용한다. 이후 모든 섹션은 이 행의 높이에 종속되지 않는다.

### 5.3 처리 대기 원장

현재의 상단 지표와 `기록 확인 필요`, 공개·피드백 섹션을 하나의 full-width ledger로 통합한다.

- 상단 summary rail: RSVP 미응답, 진행률 미작성, 수정 필요 회차, 공개 미완성, 저장 초안.
- 0건은 낮은 대비의 compact status로 표시한다.
- 실제 대상이 있는 기록은 회차, 제목, 이유, action을 한 행에 표시한다.
- 기본 노출은 가장 중요한 3건까지이며, 나머지는 세션 기록 전체 보기로 이동한다.
- 집계 값만 있어 특정 회차를 알 수 없는 항목은 disabled button을 만들지 않고 `세션 기록에서 회차 선택` 링크와 이유를 제공한다.

### 5.4 다음 세션과 운영 흐름

예정 세션과 체크리스트를 하나의 full-width operation flow 영역에 배치한다.

- 예정 세션은 가로로 긴 한 행 또는 짧은 list로 표시한다.
- 운영 체크리스트는 모든 6개 행을 항상 펼치지 않는다.
- 현재 조치가 필요한 단계와 직전·다음 단계만 기본 표시한다.
- 전체 일정은 접근 가능한 `<details>` 또는 동등한 disclosure로 확인한다.
- 연결되지 않은 리마인더는 큰 disabled action 대신 `기능 준비 중` 상태와 짧은 설명으로 표시한다.

### 5.5 운영 도구

알림, 멤버 초대, 멤버 관리, AI 기본 모델을 설명 카드가 아닌 compact tool rows로 통합한다.

- 각 행은 도구 이름, 현재 상태 한 줄, action 하나를 가진다.
- 알림은 대기·실패·중단 수치와 장부 링크를 한 행에서 보여 준다.
- 초대는 장문의 보안 설명을 제거하고 초대 관리 링크와 현재 상태만 보여 준다.
- AI 기본 모델은 선택값, 저장 action, loading/error/success 상태를 한 행 또는 작은 inline panel에서 처리한다.
- 페이지 하단에 별도의 full-width AI 설정 카드를 만들지 않는다.

## 6. 반응형 동작

### Desktop

- content container와 기존 warm paper/ink token을 유지한다.
- `오늘의 운영`만 제한된 2열 grid를 사용한다.
- 이후 ledger, operation flow, tools는 독립된 full-width 행이다.
- 카드 중첩을 피하고 선, 행 간격, 표면색으로 정보 그룹을 구분한다.
- editorial type은 페이지 제목과 책 제목에만 남기고 UI label, 수치, action은 sans hierarchy를 사용한다.

### Tablet

- `오늘의 운영`을 1열로 바꾸되 현재 세션 다음에 우선 행동이 바로 이어진다.
- ledger row는 핵심 정보와 action이 줄바꿈돼도 겹치지 않는다.
- 도구 행은 2열 또는 1열로 자연스럽게 전환한다.

### Mobile

- 첫 viewport 순서는 page title → 지금 처리할 일 → 현재 세션이다.
- 0건 상태, 전체 체크리스트, 전체 멤버 상태는 기본 축약한다.
- 긴 설명 대신 count, 상태, action 중심으로 쓴다.
- disclosure는 native semantic과 keyboard 접근성을 유지한다.
- 모든 primary action은 최소 44px touch target을 갖는다.
- 가로 rail을 쓸 때 action이 화면 밖에 숨지 않으며 스크롤 가능성이 시각적으로 드러나야 한다.

## 7. Frontend architecture와 구성 요소

기존 route-first 경계를 유지한다.

```text
host dashboard route/query data
  -> host dashboard pure model
  -> priority ledger view model
  -> prop-driven dashboard UI
```

예상 역할:

- `front/features/host/route/host-dashboard-route.tsx`
  - 기존 query와 action wiring을 유지한다.
  - `ClubAiDefaultsSection`을 dashboard의 운영 도구 slot으로 전달할 수 있게 조합한다.
- `front/features/host/model/host-dashboard-model.ts`
  - 중복되지 않는 priority item, compact status, checklist disclosure 상태를 순수 계산한다.
  - UI가 raw response 조건을 직접 조합하지 않게 한다.
- `front/features/host/ui/host-dashboard.tsx`
  - desktop/mobile에 공통인 정보 순서와 action wiring을 소유한다.
  - 거대한 inline style과 반복 markup을 역할별 component로 분리한다.
- `front/features/host/ui/dashboard/*`
  - `HostTodayBoard`, `HostPriorityLedger`, `HostOperationFlow`, `HostOperationsTools`와 같은 prop-driven component를 둔다.
  - API, query, route module을 import하지 않는다.
- `front/features/host/club/ui/ClubAiDefaultsSection.tsx`
  - 데이터 처리와 mutation은 유지하되 compact presentation variant를 지원한다.
- `front/src/styles/globals.css`
  - host dashboard 전용 layout, ledger row, disclosure, responsive state만 추가한다.

기존 session visibility, open session, missing member resolution, pagination, AI default mutation 동작은 유지한다.

## 8. 상태 우선순위와 중복 제거 규칙

Priority order:

1. 새 멤버가 현재 세션 참석 명단에 없는 상태.
2. 실패 또는 중단된 알림.
3. 현재 세션 RSVP/진행률/마감 blocker.
4. 수정이 필요한 세션 기록.
5. 공개 미완성 또는 저장 초안.
6. 예정 세션과 일반 안내.

중복 제거:

- 같은 RSVP count는 top metric과 next action에 각각 반복하지 않는다. priority item에 있으면 summary rail은 count만 보여 준다.
- 같은 record는 처리 대기 원장과 별도 카드에 동시에 렌더링하지 않는다.
- 공개·피드백 0건은 별도 card를 만들지 않는다.
- navigation에 이미 존재하는 멤버·초대·알림 화면은 설명 카드 대신 status row와 링크만 제공한다.
- 실제 action이 없는 준비 중 기능은 disabled primary button으로 보이지 않게 한다.

## 9. Loading, empty, error, interaction

- route loading/error boundary는 유지한다.
- 독립 query가 실패해도 dashboard 전체를 숨기지 않는다.
- record attention 실패는 해당 ledger에 `기록 상태를 불러오지 못했습니다`와 세션 기록 링크를 보여 준다.
- AI 기본 모델 실패는 운영 도구 행 안에서 retry 가능한 error state를 보여 준다.
- mutation pending 동안 해당 action만 disabled하고 기존 데이터는 유지한다.
- 성공 메시지는 가까운 `aria-live="polite"` 영역에서 알린다.
- action 실패는 해당 영역 안에 `role="alert"`로 표시한다.
- empty state는 큰 빈 카드가 아니라 다음 행동을 설명하는 compact row를 사용한다.
- reduced motion에서는 disclosure와 상태 변화가 즉시 반영된다.

## 10. Accessibility와 copy

- heading level은 페이지 h1 아래에서 섹션 h2, 행 제목 h3 순서를 유지한다.
- `main`, `section`, `aside`, `nav`, `dl`, `ol`을 의미에 맞게 사용한다.
- 색상만으로 경고·완료를 구분하지 않고 상태 label과 icon을 함께 사용한다.
- body text 대비는 4.5:1 이상, 큰 text는 3:1 이상을 유지한다.
- 긴 책 제목과 한국어·영어 혼합 label에 `min-width: 0`, `overflow-wrap`, 유연한 action wrapping을 적용한다.
- `확인 필요`, `회차 선택`, `준비 중`처럼 모호한 단독 label 대신 대상과 이유가 포함된 accessible name을 사용한다.
- 화면에서 반복되는 장문의 운영 설명은 제거하고, 왜 필요한지 판단에 직접 쓰이는 문장만 남긴다.

## 11. 테스트 전략

TDD 순서를 따른다.

### Model RED/GREEN

- priority source가 심각도와 action 가능성 순으로 정렬된다.
- 동일 상태가 priority와 ledger에 중복 배치되지 않는다.
- 0건 상태가 compact stable summary로 축약된다.
- 현재 필요한 checklist 단계가 기본 노출되고 전체 timeline은 별도로 유지된다.
- 음수 또는 누락 count는 안전하게 0으로 정규화된다.

### Component RED/GREEN

- 첫 영역에 `지금 처리할 일`과 현재 세션이 렌더링된다.
- record attention은 최대 기본 노출 수와 전체 보기 action을 지킨다.
- 완료 상태가 큰 standalone card를 만들지 않는다.
- AI 기본 모델이 운영 도구 영역 안에 렌더링되고 기존 loading/error/save 상태를 유지한다.
- unnamed interactive element가 없다.
- 실패·pending·success 상태가 해당 영역에서 접근 가능하게 전달된다.

### Responsive/browser evidence

- 1440×1000, 1024×768, 390×844에서 구조와 overflow를 확인한다.
- desktop에서 전역 비대칭 column 공백이 남지 않는지 확인한다.
- mobile 첫 viewport에 최우선 행동과 현재 세션 진입이 보이는지 확인한다.
- 긴 책 제목, 긴 상태 문구, 0건 상태, 다수 attention item fixture를 확인한다.
- keyboard focus 순서와 disclosure 동작을 확인한다.

Canonical checks:

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
```

Corepack이 PATH에 없으면 repository instruction에 따라 `npx --yes corepack@0.35.0 pnpm ...`을 사용하고 정확한 명령을 보고한다.

## 12. Acceptance matrix와 위험 범위

선택한 row:

- **UI or runtime state**: loading, empty, error, wrapping, desktop, mobile, disclosure, mutation pending 상태가 직접 영향을 받는다.

인접 high-risk row 제외:

- Actor or authorization: host guard와 권한 계약을 변경하지 않는다.
- Club context: 기존 route/query context를 유지한다.
- Session lifecycle: open/visibility action wiring은 유지하고 lifecycle 규칙을 변경하지 않는다.
- Publication visibility: 기존 mutation과 session record route로 이동하는 표현만 유지한다.
- BFF or OAuth: 변경하지 않는다.
- Cursor collection: 기존 pagination 동작과 query contract를 유지한다.
- Persistence or migration: 변경하지 않는다.
- Async, cache, or provider: 기존 알림·AI query 상태를 표현할 뿐 처리 계약을 변경하지 않는다.

## 13. 예상 수정 범위

주요 예상 파일:

- `front/features/host/model/host-dashboard-model.ts`
- `front/features/host/model/host-dashboard-model.test.ts`
- `front/features/host/ui/host-dashboard.tsx`
- `front/features/host/ui/host-dashboard.test.tsx`
- `front/features/host/ui/dashboard/mobile-host-dashboard.tsx`
- `front/features/host/ui/dashboard/shared-sections.tsx`
- `front/features/host/ui/dashboard/*`의 신규 또는 기존 component
- `front/features/host/club/ui/ClubAiDefaultsSection.tsx`
- `front/features/host/club/ui/ClubAiDefaultsSection.test.tsx`
- `front/features/host/route/host-dashboard-route.tsx`
- `front/src/styles/globals.css`
- 필요한 경우 host dashboard 관련 E2E
- `CHANGELOG.md`의 `## Unreleased`

현재 미커밋 상태인 session record API/query/editor 파일과 server 파일은 수정하지 않는다. 구현 직전 `git status --short --branch --untracked-files=all`을 다시 확인하고 예상 파일과 겹치면 멈춘다.

## 14. Release와 잔여 위험

분류:

- frontend host UX change.
- no server production change.
- no DB migration.
- no public API/auth/BFF/deploy change.

잔여 위험:

- dashboard가 여러 query 결과를 조합하므로 특정 query 실패 시 부분 error 표현이 일관되어야 한다.
- fixture별 데이터량 차이로 실제 페이지 높이는 달라질 수 있다. 고정 pixel 목표보다 우선 행동의 viewport 위치와 중복 제거를 acceptance 기준으로 삼는다.
- AI 기본 모델 component를 dashboard 안으로 옮길 때 query/mutation lifecycle과 form state를 보존해야 한다.
- 모바일 disclosure가 중요한 상태를 숨기지 않도록 non-zero/error 상태는 기본 확장한다.

## 15. Spec self-review

- Placeholder scan: `TBD`, `TODO`, 미정 항목이 없다.
- Internal consistency: frontend-only 범위와 API/server non-goal이 일치한다.
- Scope check: canonical host dashboard 한 화면과 관련 UI/model/test에 한정된다.
- Ambiguity check: 정보 순서, 우선순위, 중복 제거, responsive 동작, error 처리, testing 기준을 명시했다.
- Public-safety check: 실제 멤버 데이터, private domain, secret, deployment state, local absolute path를 포함하지 않는다.
