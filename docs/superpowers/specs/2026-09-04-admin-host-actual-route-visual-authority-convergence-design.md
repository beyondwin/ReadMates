# Admin·Host 실제 route 시각 권위 수렴 설계

- 상태: Approved design, implementation not started
- 승인일: 2026-09-04
- 범위: Admin 승인 시안 `01`–`07`과 Host 승인 시안 `07`–`17`, 총 18장 및 이를 렌더링하는 실제 authenticated route, 공통 shell, responsive composition, visual-authority CI
- 비범위: Public·Member 화면, 서버 API 의미 변경, 배포, 승인 PNG의 runtime 사용

ADR impact: update — ADR-0048·0050·0051의 제품 구성은 유지한다. ADR-0053은 실제 route를 최종 실행 권위로 사용하고 strict pixel·geometry·first-viewport 계약을 차단하며 광범위한 font-raster 예외를 제거하도록 갱신한다. 구현과 전체 수락이 끝날 때까지 `Proposed`를 유지한다.

관련: ADR-0048, ADR-0050, ADR-0051, ADR-0053, `front/DESIGN.md`, `front/tests/e2e/support/approved-mockup-manifest.ts`, `docs/reports/2026-09-02-admin-host-pixel-fidelity-acceptance.md`, `docs/reports/2026-09-02-host-approved-first-viewport-acceptance.md`

## 1. 문제와 목표

현재 비교 harness는 승인 PNG 18개의 hash와 candidate·overlay·diff·measurement를 생성하지만 최종 승인 대상을 실제 route로 고정하지 않았다. Host 비교는 `HostApprovedShell`과 정돈된 component fixture를 사용하고, Admin 승인 fixture는 실제 queue의 locator와 10건 밀도를 대표하지 않는다. 모든 authority capture가 `allowFontRasterException`을 사용해 manifest의 `maxDiffPixelRatio: 0.02`를 넘더라도 desktop/Admin은 0.10, Host mobile은 0.15까지 통과한다.

그 결과 테스트용 화면은 시안에 가까워져도 실제 route의 shell, 오류 상태, 고밀도 데이터, responsive composition은 계속 달라질 수 있다. 특히 Admin mobile 실제 route에서는 locator가 추가된 DOM과 locator가 없는 fixture를 기준으로 한 grid가 충돌해 제목 열이 한 글자 너비로 붕괴한다. Host 실제 route에서는 단계 보정, partial failure, 12건 작업함이 주 행동과 준비 현황을 첫 화면 아래로 밀어낸다.

목표는 CSS를 다시 덧대는 것이 아니다. **승인 시안의 구성·위계·첫 화면 노출량·인터랙션을 실제 authenticated route의 차단 계약으로 바꾸고, 실제 데이터는 그 계약 안에서 유연하게 표시하도록 전체 18개 화면을 수렴시키는 것**이다.

## 2. 디자인 결정

승인 PNG의 문구와 예시 데이터를 runtime에 고정하지 않는다. 다음 항목을 시각 권위로 고정한다.

- page composition과 영역 순서
- 정보 위계와 타이포 역할
- desktop/mobile 첫 화면 노출량
- 기본 disclosure 상태
- primary·secondary action 관계
- 목록과 detail의 상호작용
- navigation과 현재 위치 표현

실제 책, 모임, 사람, 상태, 시각, 건수는 바뀔 수 있다. 데이터 변화는 줄바꿈·밀도·오류 처리 규칙을 따라야 하며 위 권위를 깨뜨릴 수 없다.

초과 데이터는 첫 화면을 무한히 늘리지 않는다. Admin Today는 우선 업무 3건, Host workbox는 desktop 4건·mobile 3건을 기본 노출하고 나머지는 명시적인 `전체 보기` 경로로 이동한다. 내부 스크롤로 숨기거나 모든 항목을 첫 화면에 밀어 넣지 않는다.

## 3. 시각 권위 계층

충돌 시 다음 순서를 사용한다.

1. 승인 PNG 18장의 구성·위계·첫 화면 노출량·인터랙션
2. ADR-0048·0050·0051의 제품·공간 구성
3. 실제 authenticated route candidate
4. code-native UI와 component fixture
5. tracked CT snapshot

실제 route candidate가 승인 여부를 결정한다. Component fixture는 빠른 회귀와 상태 단위 검증에만 사용하며 최종 수락을 대신하지 않는다. `HostApprovedShell` 같은 test-only shell은 제품 shell의 component 테스트에는 남길 수 있지만 visual-authority PASS 근거로 사용하지 않는다.

Tracked snapshot은 직전 구현 대비 회귀 cache다. Snapshot 갱신만으로 승인하지 않으며 승인 reference, 실제 route candidate, overlay, diff, measurement, 독립 검토가 함께 있어야 한다.

## 4. 승인 자산과 실제 route 시나리오

각 id는 하나의 `VisualAuthorityScenario`를 가진다. Scenario는 다음을 등록한다.

- approved reference path와 SHA-256
- 실제 route와 URL 소유 상태
- 인증 역할과 club scope
- CSS viewport와 reference 정규화 크기
- 결정적이고 public-safe한 BFF 응답 fixture
- 첫 화면 필수 region과 순서
- 기본 노출 항목 수
- 허용되는 데이터 변화와 금지되는 구성 변화
- pixel·geometry·typography·interaction assertion

| id | 승인 파일 | 실제 route 표면 |
| --- | --- | --- |
| `admin-today-desktop` | `design/mockups/2026-08-30-admin-operations-redesign/01-today-desktop.png` | `/admin/today` desktop |
| `admin-clubs-desktop` | `design/mockups/2026-08-30-admin-operations-redesign/02-clubs-desktop.png` | `/admin/clubs` desktop |
| `admin-service-desktop` | `design/mockups/2026-08-30-admin-operations-redesign/03-service-status-desktop.png` | `/admin/health` desktop |
| `admin-records-desktop` | `design/mockups/2026-08-30-admin-operations-redesign/04-processing-records-desktop.png` | `/admin/audit` desktop |
| `admin-space-switcher-desktop` | `design/mockups/2026-08-30-admin-operations-redesign/05-space-switcher-desktop.png` | `/admin/today` desktop, space switcher open |
| `admin-today-mobile` | `design/mockups/2026-08-30-admin-operations-redesign/06-today-mobile.png` | `/admin/today` mobile list |
| `admin-work-detail-mobile` | `design/mockups/2026-08-30-admin-operations-redesign/07-work-detail-mobile.png` | `/admin/today?case=<case-id>&mode=detail` mobile |
| `host-prep-desktop` | `docs/development/host-redesign-mockups/07-host-lifecycle-operating-room-approved.png` | `/clubs/:slug/app/host?phase=prep` desktop |
| `host-live-desktop` | `docs/development/host-redesign-mockups/08-host-operating-room-live-approved.png` | `/clubs/:slug/app/host?phase=live` desktop |
| `host-closing-desktop` | `docs/development/host-redesign-mockups/09-host-operating-room-closing-approved.png` | `/clubs/:slug/app/host?phase=closing` desktop |
| `host-meetings-desktop` | `docs/development/host-redesign-mockups/10-host-meetings-library-approved.png` | `/clubs/:slug/app/host/sessions` desktop |
| `host-people-desktop` | `docs/development/host-redesign-mockups/11-host-people-ledger-approved.png` | `/clubs/:slug/app/host/people` desktop |
| `host-records-desktop` | `docs/development/host-redesign-mockups/12-host-records-ledger-approved.png` | `/clubs/:slug/app/host/records` desktop |
| `host-settings-desktop` | `docs/development/host-redesign-mockups/13-host-invites-settings-approved.png` | `/clubs/:slug/app/host/settings#invitations` desktop |
| `host-schedule-review-desktop` | `docs/development/host-redesign-mockups/14-host-unread-schedule-review-approved.png` | `/clubs/:slug/app/host/sessions/:sessionId/schedule-review` desktop |
| `host-prep-mobile` | `docs/development/host-redesign-mockups/15-mobile-host-operating-room-prep-approved.png` | `/clubs/:slug/app/host?phase=prep` mobile |
| `host-live-mobile` | `docs/development/host-redesign-mockups/16-mobile-host-live-attendance-approved.png` | `/clubs/:slug/app/host?phase=live` mobile |
| `host-person-mobile` | `docs/development/host-redesign-mockups/17-mobile-host-person-detail-approved.png` | `/clubs/:slug/app/host/people/:membershipId` mobile |

실제 route는 제품의 router, layout, controller, query, view-model, UI와 responsive CSS를 그대로 지난다. 시각 테스트는 네트워크 경계에서 결정적 BFF fixture를 공급하고 기존 개발용 인증 경로로 역할을 구성한다. 별도 page tree나 시안 전용 제품 route를 만들지 않는다.

## 5. 화면 구성과 데이터 초과 규칙

### Admin

Desktop Today는 `navigation → 우선 업무 목록 → 선택 업무 detail`을 유지한다. 기본 목록은 상위 3건이며 전체 건수와 `전체 보기`를 표시한다. Locator, 경고 아이콘, 제목, severity, age는 각자 명시적인 column을 갖는다. Mobile 제목은 남은 전체 폭을 소유하고 최소 유효 폭과 최대 행 높이를 검사한다.

Clubs, service status, processing records는 승인 시안의 row·detail 위계를 유지하되 실제 추가 데이터는 pagination, search, detail navigation으로 확장한다. Space switcher는 콘텐츠를 가리지 않고 승인 시안의 범위 설명과 선택 상태를 유지한다.

### Host

운영실의 semantic 순서는 다음과 같다.

1. 현재 모임
2. 준비실·현장·마감실 navigation
3. 다음에 할 일
4. 필요한 상태 안내
5. 준비 현황 4개
6. 작업함 요약

전체 작업 실패는 해당 action region을 오류 상태로 교체한다. Partial failure는 주 행동을 밀어내는 큰 panel이 아니라 다음 행동 아래의 compact summary와 source별 retry로 표현한다. Phase normalization은 단계 navigation 아래 한 줄 상태로 둔다. 기술 상세는 disclosure 안에 둔다.

Host workbox는 desktop 4건, mobile 3건을 기본 노출하고 나머지는 `작업함 모두 보기`로 이동한다. 우선순위 계산은 기존 domain 의미를 유지하며 CSS로 임의 정렬하지 않는다.

## 6. CSS와 component 소유권

`admin-editorial-ledger.css`에 route별 후행 override를 계속 추가하지 않는다. 전면 UI 재작성도 하지 않는다. 영향 영역만 다음 소유 단위로 분리한다.

- shell과 primary navigation
- queue/list row
- docket/detail
- state summary
- responsive composition
- Host current-meeting header와 phase navigation
- Host preparation ledger와 workbox summary

각 단위는 자체 layout, state modifier, breakpoint를 소유한다. 다른 route의 고특이도 descendant selector가 내부 grid를 재정의하지 못하게 한다. Shared token은 typography, spacing, color, focus만 제공하고 page composition을 소유하지 않는다.

UI는 기존 route-first dependency를 유지한다. `ui`는 props/callback만 렌더하고 API/query/route를 import하지 않는다. Data prioritization과 `전체 보기` 대상은 route/model이 계산한다.

## 7. 오류·권한·상태 계약

시안 수렴을 위해 기존 기능·권한·복구 계약을 삭제하지 않는다.

- 401/403은 민감한 state를 폐기하고 안전한 route로 이동한다.
- 409는 사용자의 의도를 보존하고 최신 값과 차이를 보여 준다.
- Partial source failure는 성공한 sibling을 지우지 않는다.
- Unknown outcome은 동일 mutation을 blind retry하지 않고 receipt/history로 확인한다.
- Empty, stale, unavailable 상태는 실제 route의 동일 composition 안에서 표현한다.

안전이나 접근성 때문에 승인 PNG와 달라야 할 때는 차이의 근거, 영향 region, candidate·overlay·diff를 별도 승인한다. 구현 편의, 기존 CSS, 기존 snapshot은 예외 근거가 아니다.

## 8. Strict 시각 차단 계약

고정된 Docker font/browser 환경에서 18개 scenario 각각이 다음을 모두 통과해야 한다.

- 실제 authenticated route에서 candidate 생성
- approved reference hash 일치
- 전체 이미지 `mismatchPixelRatio ≤ 0.02`
- major region 위치·크기 오차 `≤ 4 CSS px`
- 반복 행 정렬·간격 오차 `≤ 2 CSS px`
- 승인된 typography size, weight, line-height, color token 일치
- 첫 화면 필수 region과 순서 일치
- desktop/mobile 기본 노출 항목 수 준수
- 제목 최소 폭과 최대 행 높이 준수
- 수평 overflow 없음
- keyboard focus, 선택, back/forward 복원

Pretendard와 icon font는 CI image에 고정한다. 전체 capture에 0.10/0.15 font-raster ceiling을 적용하지 않는다. 불가피한 glyph raster 차이는 해당 glyph 영역, 환경, 근거, reviewer를 기록한 좁은 mask만 허용한다. Mask는 composition, background, spacing, control geometry를 덮을 수 없으며 승인 id와 함께 versioned contract로 관리한다.

## 9. 공통 스트레스 계약

승인 18장은 대표 상태의 pixel authority다. 다음 스트레스 상태는 같은 실제 route에서 semantic·geometry invariant로 별도 차단한다.

- Admin 업무 0건·3건·10건
- Host workbox 0건·4건·12건
- 장문 한국어·영어, 긴 unbroken token
- partial failure와 full failure
- stale, forbidden, conflict, unknown outcome
- 320, 390, 768, 1024, 1440 CSS px
- 실제 브라우저 200% 확대 proxy와 toolbar zoom evidence
- reduced motion

스트레스 상태를 승인 PNG와 억지로 pixel 비교하지 않는다. 첫 행동 발견성, title 최소 폭, 행 높이, overflow, disclosure, keyboard, safe-area를 검사한다.

## 10. 구현 프로그램

### Phase 0 — 실제 route gate

- 18개 `VisualAuthorityScenario` 등록
- 실제 route capture harness와 deterministic BFF fixture 연결
- 기존 strict 결과를 RED baseline으로 기록
- test-only shell을 final authority에서 제외
- broad font-raster exception 제거

### Phase 1 — Admin Today와 공통 shell

대상: `01`, `05`, `06`, `07`. Mobile title collapse를 먼저 재현하고 queue row, Today desktop/mobile, account·space switcher, selection·focus restoration을 함께 닫는다.

### Phase 2 — Admin 원장

대상: `02`, `03`, `04`. Phase 1에서 확정한 shell, row, docket, state summary만 재사용해 clubs, service status, processing records를 닫는다.

### Phase 3 — Host 운영실

대상: `07`, `08`, `09`, `15`, `16`. Prep/live/closing과 desktop/mobile first viewport, partial-state placement, workbox cap을 함께 닫는다.

### Phase 4 — Host 원장과 utility

대상: `10`, `11`, `12`, `13`, `14`, `17`. Meetings, people, records, invitations/settings, schedule review, mobile person detail을 닫는다.

### Phase 5 — 전체 수락

18개 실제 route strict capture, 공통 stress matrix, 전체 browser regression, 5인 30초 이해도, VoiceOver/Safari, NVDA/Chrome을 수행한다. 모든 근거가 닫힌 뒤에만 ADR-0053을 `Accepted`로 승격한다.

각 phase는 `RED contract → 최소 implementation → focused GREEN → 실제 route visual review → phase regression` 순서다. 앞 phase의 shared file을 뒤 phase에서 임의로 덮지 않는다.

## 11. CI와 승인 무효화

실제 route visual-authority test를 별도 필수 CI job으로 둔다. Workflow는 실제 git diff를 `approvedMockupsAffectedBy(changedPaths)`에 전달한다. 영향받은 reference는 이전 승인을 만료시키고 새 candidate·overlay·diff·measurement를 요구한다.

CI artifact에는 각 id의 reference hash, candidate hash, browser/font fingerprint, region result, pixel ratio와 mask 사용 여부를 남긴다. Snapshot 갱신은 visual-authority receipt가 아니다. Admin 또는 Host authority job이 실패하면 merge할 수 없다.

## 12. 검증과 사람 승인

자동 검증:

- focused model/UI/route test
- 18개 actual-route visual-authority test
- common stress-state responsive test
- `pnpm --dir front lint`
- `pnpm --dir front test`
- `pnpm --dir front build`
- affected `pnpm --dir front test:e2e`
- full visual/browser CI

사람 검증:

- 구현하지 않은 검토자가 18개 reference, candidate, overlay, diff를 판정한다.
- 5명의 사용자가 30초 안에 Admin 우선 업무, Host 현재 단계·다음 행동, 보조 기능 진입점을 찾는다.
- VoiceOver/Safari와 NVDA/Chrome으로 heading, landmark, state announcement, focus order를 확인한다.

사람 측정 전에는 `pending_external_human_evidence`, 수동 보조기술 확인 전에는 `not measured`로 기록한다. AI 검토나 자동 DOM audit를 사람·screen-reader evidence로 바꾸어 쓰지 않는다.

## 13. Acceptance matrix

- 선택: `UI or runtime state` — loading, empty, stale, partial, denied, wrapping, desktop/mobile, route continuity와 visual geometry.
- 조건부 선택: 실제 route scenario가 auth 또는 club-context fixture를 바꾸면 actor/authorization과 club-context focused E2E를 추가한다.
- 제외: BFF/OAuth protocol, persistence/migration, guest/public projection, provider, deploy. 이 설계는 해당 의미를 변경하지 않는다. 구현 중 필요해지면 중단하고 별도 승인을 받는다.

## 14. 완료 정의

다음 조건이 모두 충족될 때만 “Admin·Host 승인 시안 구현 완료”라고 선언한다.

- 실제 route 기준 18/18 strict PASS
- 공통 stress matrix PASS
- Admin·Host 수동 시각 실패 0건
- frontend lint/test/build와 affected E2E PASS
- 원격 visual/browser CI PASS
- 5인 30초 이해도 evidence 완료
- VoiceOver/Safari와 NVDA/Chrome evidence 완료
- code, tests, `front/DESIGN.md`, acceptance reports가 같은 계약을 설명
- ADR-0053 `Accepted`

완료 선언에 포함하지 않는 것:

- Public·Member 시각 개편
- production 배포
- 서버 API·권한 의미 변경
- snapshot만 갱신한 상태
- broad font-raster exception 아래의 PASS

## 15. 요구사항 추적

| 승인 요구 | 구현 phase | 수락 근거 |
| --- | --- | --- |
| Admin 7장 전체 | Phase 1–2 | actual-route reference/candidate/overlay/diff + strict result |
| Host 11장 전체 | Phase 3–4 | actual-route reference/candidate/overlay/diff + strict result |
| 시안 구성·위계·노출량·인터랙션 고정 | Phase 0–4 | scenario semantics, typography, geometry, first-viewport assertions |
| 실제 데이터 유연성 | Phase 1–4 | priority cap, `전체 보기`, long/high-density state |
| broad raster 예외 제거 | Phase 0 | fixed environment and strict 0.02 gate |
| 실제 route 최종 권위 | Phase 0 | route-owned capture without test-only shell |
| 스트레스 상태 | Phase 1–5 | shared runtime-state matrix |
| 사람·접근성 승인 | Phase 5 | five-person and manual AT evidence |
