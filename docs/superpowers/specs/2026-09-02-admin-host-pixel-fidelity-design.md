# ReadMates Admin·Host 승인 시안 픽셀 근접 재현 설계

- 상태: Approved design, implementation not started
- 승인일: 2026-09-02
- 범위: `front/features/platform-admin/**`, `front/features/host/**`, 공통 frontend 시각 primitive, 관련 CT/E2E·시각 기준선·active design docs
- 비범위: API·권한·서버 mutation 의미 변경, 실제 배포, 승인 PNG의 runtime 배경 사용

ADR impact: new — ADR-0053 (`Proposed`)을 추가한다. ADR-0048의 호스트 운영실+작업함, ADR-0050의 오늘 할 일 중심 운영 데스크, ADR-0051의 전역 공간 전환은 유지한다.

## 1. 결정 요약

Admin과 Host 화면은 승인 PNG를 page composition의 최상위 시각 권위로 사용해 **픽셀 근접 재현**한다. 현재 구현은 기능·상태·접근성의 근거이지 시각 기준이 아니다.

기능은 삭제하지 않는다. 승인 시안에 없는 필터, 보류, 복구, 권한·안전 조작은 시안의 정보 흐름 안에서 접힌 보조 영역, progressive disclosure 또는 다음 단계로 재배치한다. 접근성이나 안전 계약 때문에 시안과 달라져야 할 때만 예외를 허용하며, 근거·영향·비교 이미지를 기록해 별도 승인한다.

구현은 다음 순서를 지킨다.

1. 승인 자산과 deterministic fixture를 봉인한다.
2. 공통 타이포·폭·간격·헤더·내비게이션을 먼저 시안에 맞춘다.
3. Admin Today queue/docket을 먼저 맞춘 뒤 승인 자산 `01`–`07`의 모든 route/state를 맞춘다.
4. Host 운영실·작업함을 먼저 맞춘 뒤 승인 자산 `07`–`17`의 모든 route/state를 맞춘다.
5. 두 표면의 기능·접근성·시각 회귀를 함께 재검증한다.

## 2. 왜 기존 검증으로 충분하지 않았는가

기존 구현은 기능·권한·회복성·반응형 geometry를 폭넓게 검증했지만 승인 시안의 인지적 위계를 executable contract로 충분히 옮기지 못했다.

- Admin active design은 filter/status를 queue 앞에 두지 않도록 요구하지만 현재 `AdminTodayLedger`는 `AdminTodayControls`와 source 상태를 `queueControls`로 만든 뒤 queue의 `controls`로 먼저 전달한다(`front/features/platform-admin/ui/admin-today-ledger.tsx:161`, `front/features/platform-admin/ui/admin-today-ledger.tsx:246`).
- Admin 용어 사전은 `Today / 운영 케이스`를 `오늘 할 일`로 고정하지만 현재 heading은 `오늘의 운영 케이스`이고 테스트도 이 문구를 기대한다(`front/features/platform-admin/ui/admin-today-ledger.tsx:25`, `front/features/platform-admin/ui/admin-today-ledger.test.tsx:239`). 잘못된 구현이 회귀 기준으로 굳었다.
- Host responsive CT는 semantic order, 68:32 비율, 가로 overflow, target size를 확인하지만 작업함 한 행에서 몇 개의 조작이 기본 노출되는지는 확인하지 않는다(`front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx:204`).
- 현재 `HostWorkItem`은 설명과 facts 뒤에 보류 select와 button을 모든 `NOW` 행에 펼쳐 둔다(`front/features/host/ui/workbox/host-work-item.tsx:39`, `front/features/host/ui/workbox/host-work-item.tsx:55`). 기능적으로 완전하지만 승인 시안보다 작업함 밀도가 높다.
- 기존 active design은 구현 후 tracked CT screenshot을 회귀 기준으로 삼았다. 이 방식은 현재 구현끼리의 drift는 찾지만, 잘못 승인된 baseline을 원 시안과 다시 대조하도록 강제하지 않는다.
- Admin의 초보 운영자 30초 이해 연구와 일부 수동 보조기술 검증은 `not measured`인 채 기존 ADR 수락과 분리됐다. 이번 작업의 핵심인 첫 작업·다음 행동 발견성은 더 이상 미측정 상태로 닫지 않는다.

따라서 문제는 CSS 한 건이 아니라 `승인 시안 → 구현 계획 → 테스트 → 최종 승인` 사이의 추적성 단절이다.

## 3. 디자인 권위

### 3.1 우선순위

충돌 시 다음 순서를 사용한다.

1. 승인된 Admin·Host 시안 이미지
2. ADR-0048·0050·0051과 승인된 active design 문서
3. 현재 기능, 접근성, 권한, 안전·복구 계약
4. 현재 구현과 기존 tracked screenshot

3번과 1번이 충돌하면 기능을 제거하지 않고 1번의 흐름 안으로 재배치한다. 접근성·안전성 때문에 1번과 달라지는 경우에는 예외 승인을 요구한다. 기존 구현 편의나 기존 snapshot만으로 차이를 정당화할 수 없다.

### 3.2 승인 자산

Admin의 권위는 `design/mockups/2026-08-30-admin-operations-redesign/`의 승인 세트다.

- desktop: `01`–`05`, 각 1672×941
- mobile: `06`–`07`, 각 853×1844
- 자산 hash는 `docs/development/2026-08-30-readmates-platform-admin-operations-product-redesign-design.md`의 시안 자산 계약을 따른다.

Host의 권위는 `docs/development/host-redesign-mockups/`의 승인 세트다.

- desktop: `07`–`14`, 각 1536×1024
- mobile: `15`–`17`, 각 866×1846
- 자산 hash와 생성 검증은 `docs/development/host-redesign-mockups/README.md`를 따른다.

승인 PNG를 CSS background나 runtime image로 렌더링하지 않는다. React, semantic HTML, repository token, bundled Pretendard, 실제 avatar asset으로 재현한다.

### 3.3 비교 좌표계

- Desktop은 승인 자산의 intrinsic canvas와 같은 viewport로 candidate를 capture한다.
- Mobile 승인 자산은 high-density reference frame으로 보고 browser는 390 CSS px viewport를 사용한다. reference와 candidate를 같은 frame 크기로 정규화한 뒤 overlay한다.
- 4px/2px tolerance는 정규화된 reference frame의 raw image pixel이 아니라 browser의 CSS pixel 좌표로 측정한다.
- 비교 fixture는 승인 시안과 같은 safe fictional content, 상태, 선택 항목, 정렬을 사용한다. 실제 회원·클럽·배포 데이터는 사용하지 않는다.
- 320, 768, 900/1024, 1200, 1440px 중간 폭은 직접 pixel oracle이 아니라 승인된 semantic order와 interpolation, wrapping, overflow, focus 계약을 검증한다.

## 4. 픽셀 합격 계약

각 승인 화면은 아래 항목을 manifest로 가진다.

- viewport와 reference asset/hash
- shell/content bounding box와 주요 column 비율
- header, navigation, title baseline, first content baseline
- section·row·control 순서와 first viewport 노출 항목
- font family, size, weight, line-height, wrapping
- spacing, border, radius, color, shadow
- 기본 expanded/collapsed 상태와 visible control count
- desktop/mobile 고정 요소, scroll owner, safe-area

다음은 하드 실패다.

- 주요 영역의 위치·크기가 등록된 시안 값과 4px 이상 다르다.
- component 내부 정렬·간격이 반복적으로 2px 이상 달라 전체 리듬이 변한다.
- 제목, 문장 줄바꿈, section 순서 또는 first viewport 노출 내용이 다르다.
- 시안에서 접힌 보조 기능이 기본 상태에서 항상 펼쳐진다.
- font family, weight, line-height, 색상 대비 또는 표면 계층이 다른 인상을 만든다.
- desktop 또는 mobile 한쪽만 합격한다.
- 승인 후 관련 token, shared CSS, shared component, fixture가 바뀌었는데 영향 화면을 재검증하지 않는다.

폰트 rasterization과 subpixel antialiasing처럼 환경 의존적인 미세 차이는 자동 실패 대상에서 제외할 수 있다. 다만 예외 이유와 overlay를 남기고 구조·줄바꿈·크기 차이가 아님을 검토자가 확인해야 한다.

## 5. 구현 구조

### 5.1 공통 시각 기반

먼저 Pretendard typography, member product와 일치하는 content max width, page gutter, header·navigation, warm paper/ink surface, hairline, action/attention color를 승인 시안과 정렬한다.

공유 가능한 것은 token과 primitive뿐이다. Admin queue/docket과 Host operating room/workbox는 서로 다른 인지 모델이므로 범용 dashboard component로 합치지 않는다. 공통 기반이 Admin·Host reference 모두에서 합격하기 전에는 화면별 micro-adjustment를 최종 승인하지 않는다.

### 5.2 Admin

- 승인 자산 `01`–`07` 전체가 범위다. Today를 load-bearing slice로 먼저 수렴시킨 뒤 클럽 관리, 서비스 상태, 처리 기록, 공간 전환과 mobile detail을 같은 shell/token 위에서 맞춘다.
- page heading을 `오늘 할 일`로 고정한다.
- first content는 priority queue다. saved view, search, filter, source health는 queue보다 앞선 대형 block이 아니라 compact secondary disclosure로 이동한다.
- desktop은 38:62 queue/docket, queue 340px 이상, docket 560px 이상 계약을 유지한다.
- docket은 `무슨 일인가 → 왜 중요한가 → 확인한 근거 → 다음 행동 → 최근 처리 기록` 순서다.
- mobile은 `목록 → 상세 → 안전한 조치 → 결과`를 route state로 유지하며 목록과 상세를 동시에 압축하지 않는다.
- 기존 filter, source retry, pending-new, safe action, receipt, 403/409/unknown-outcome 기능은 보존한다.

### 5.3 Host

- 승인 자산 `07`–`17` 전체가 범위다. 운영실·작업함을 load-bearing slice로 먼저 수렴시킨 뒤 일정과 모임, 사람, 기록, 초대와 설정, 일정 미열람 검토와 mobile 현장·사람 상세를 같은 shell/token 위에서 맞춘다.
- semantic order는 `현재 모임 → 단계 → 다음 행동 → 준비 현황 → 작업함`이다.
- desktop은 primary 약 68%, workbox 약 32%의 2열을 유지한다.
- 작업함 row의 기본 상태는 operational label, title, 핵심 count/state, primary destination에 집중한다.
- description, 전체 facts, defer duration select/button, receipt detail은 명시적인 row disclosure나 다음 단계에서 연다. keyboard와 screen reader에서도 expanded state와 control owner가 명확해야 한다.
- mobile은 같은 semantic order의 단일 열이며 한 시점에 한 primary action만 강조한다.
- 기존 source-derived completion, deferral, undo, cursor, partial warning, receipt, authority-loss recovery는 보존한다.

### 5.4 상태·오류·접근성

loading, empty, denied, stale, partial, error, conflict, unknown outcome은 승인 시안의 composition 안에서 명시적으로 표현한다. 시각 근접을 이유로 상태를 숨기거나 color alone, 44px 미만 target, 불명확한 destructive action, focus loss를 허용하지 않는다.

## 6. 검증 구조

### 6.1 RED-first contract

구현 전에 현재 코드가 실패하는 focused test를 만든다.

- Admin: exact heading, queue-first DOM/visual order, first task above fold, secondary controls collapsed, mobile single-surface flow
- Host: compact work item default, disclosure-expanded controls, 68:32 geometry, approved semantic order, mobile single primary action
- 공통: exact viewport registration, content max width, typography, no horizontal overflow

### 6.2 시각 증거

각 승인 state마다 다음 네 artifact를 같은 실행에서 만든다.

1. immutable approved reference
2. deterministic candidate screenshot
3. 50% alpha overlay
4. visual difference image와 measurement report

Candidate baseline 갱신은 합격 증거가 아니다. Reference 대비 checklist와 reviewer 승인 없이 snapshot을 갱신하지 않는다. 구현자와 최종 시각 검토 owner는 분리한다.

### 6.3 기능·접근성 gate

Focused CT/Vitest에서 시작해 canonical frontend gate로 확장한다.

- focused Admin·Host unit/component tests
- affected responsive CT와 exact reference capture
- `pnpm --dir front lint`
- `pnpm --dir front test`
- `pnpm --dir front build`
- Admin·Host real-route user flow를 위한 `pnpm --dir front test:e2e`

키보드 순서, visible focus, 44px target, reduced motion, Korean/English wrapping, 320–1440px overflow, mobile safe-area를 확인한다. 실제 명령과 결과는 구현 closeout에서 기록한다.

### 6.4 사람 기준 gate

처음 화면을 보는 검토자가 30초 안에 다음을 식별해야 한다.

- Admin: 지금 가장 먼저 처리할 일
- Host: 현재 단계와 다음 행동
- 두 화면: 보조 기능을 펼치는 위치

이 gate는 이번 구현 완료에서 `not measured`로 남길 수 없다. 수동 screen reader는 자동 접근성 검증과 분리해 실제 실행 여부를 정직하게 기록한다.

## 7. 변경 무효화 규칙

다음 변경은 연관된 시각 승인을 자동으로 무효화한다.

| 변경 | 다시 검증할 범위 |
| --- | --- |
| typography/color/spacing token | Admin·Host 전체 reference set |
| shared header/navigation/shell | 해당 role의 desktop·mobile shell 포함 화면 |
| Admin Today component/CSS/fixture | Admin `01`, `06`, `07`과 중간 폭 |
| Admin shell/navigation/shared page component | Admin `01`–`07` 전체 |
| Host operating room/workbox component/CSS/fixture | Host `07`–`09`, `15`–`16`과 중간 폭 |
| Host shell/navigation/shared page component | Host `07`–`17` 전체 |
| shared avatar/identity primitive | identity가 보이는 모든 승인 화면 |
| snapshot update | 해당 reference와 direct dependents 전부 |

Source hash와 비교 manifest hash가 같을 때만 기존 증거를 재사용한다.

## 8. 작업 순서와 의존성

1. ADR-0053 Proposed와 visual contract manifest schema
2. deterministic fixture와 reference registration
3. failing visual/structure tests
4. shared visual foundation
5. Admin Today desktop → Admin 나머지 desktop → Admin mobile
6. Host 운영실·작업함 desktop → Host 나머지 desktop → Host mobile
7. intermediate widths와 상태 matrix
8. canonical frontend/E2E gates
9. independent pixel review와 30초 comprehension gate
10. active design docs·ADR 검증 근거 동기화 후 ADR-0053 Accepted 검토

Admin과 Host가 같은 token/CSS를 수정하므로 병렬 구현으로 shared files를 동시에 편집하지 않는다. 독립적인 screenshot review는 구현과 분리할 수 있지만 baseline, fixture, output directory를 공유하지 않도록 한다.

## 9. Acceptance matrix 선택

- 선택: `UI or runtime state` — loading, empty, denied, stale, partial, error, wrapping, desktop, mobile 및 시각 근접도를 검증한다.
- 조건부 선택: route state를 수정하는 경우 `UI or runtime state`의 real-route E2E를 확장한다.
- 제외: actor/authorization, club context, BFF/OAuth, persistence/migration, provider, public projection — 이번 설계는 해당 contract나 server surface를 변경하지 않는다. 구현 중 이 경계를 건드리게 되면 계획을 중단하고 영향 범위를 다시 승인받는다.

## 10. 비범위와 완료 정의

비범위:

- Admin·Host API, DTO, mutation semantics 변경
- 승인 시안에 없는 새 제품 기능
- member, guest, public composition 개편
- server, migration, BFF, deploy 변경
- production 배포나 실제 회원 데이터 사용

완료는 다음을 모두 만족할 때만 선언한다.

- Admin desktop/mobile pixel gate 통과
- Host desktop/mobile pixel gate 통과
- 기능·접근성·responsive test 통과
- 독립적인 reference overlay 승인
- 30초 comprehension gate 측정·통과
- 의도적 차이와 잔여 위험 기록
- code, tests, `front/DESIGN.md`, affected active design docs와 ADR-0053이 같은 계약을 설명

배포는 별도 요청 전까지 수행하지 않는다.
