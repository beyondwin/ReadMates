# ADR-0053: 승인 시안을 Admin·Host 픽셀 근접 합격 기준으로 사용

- 상태: Proposed
- 결정일: 2026-09-02
- 갱신일: 2026-09-04
- 작성자: product/design/front
- 관련: ADR-0045, ADR-0048, ADR-0050, ADR-0051, `docs/superpowers/specs/2026-09-02-admin-host-pixel-fidelity-design.md`, `docs/superpowers/specs/2026-09-02-host-approved-first-viewport-design.md`, `docs/superpowers/specs/2026-09-04-admin-host-actual-route-visual-authority-convergence-design.md`, `front/DESIGN.md`

> 제품 구성은 ADR-0048·0050을 유지한다. 승인 PNG를 page composition 권위로, 실제 authenticated route를 최종 실행 권위로 사용한다. Component fixture와 tracked snapshot은 보조 회귀 근거일 뿐 최종 수락을 대신하지 않는다. Composition·geometry·typography·first viewport·interaction은 18/18 통과했지만 strict pixel 18/18 `not_passed_0.02`, lint·CT·cross-browser·focused E2E 실패, 사람 30초 gate, 수동 보조기술 검증, 원격 CI가 남아 `Proposed`다.

## 컨텍스트

ADR-0048은 Host를 현재 모임 생애주기 운영실+작업함으로, ADR-0050은 Admin을 오늘 할 일 중심 운영 데스크로 고정했다. 기능, 권한, 회복성, responsive geometry 검증은 폭넓게 구현됐지만 이 결정 시점의 화면은 승인 시안의 정보 위계와 밀도에서 벗어나 있었다.

아래 §컨텍스트는 이 결정을 내리게 만든 **당시 상태의 기록**이다. 현재 구현 상태는 §검증을 따른다.

이 결정 시점에 18개 authority capture는 모두 strict mismatch ratio 0.02를 초과했고, 보고된 PASS는 desktop/Admin 0.10, Host mobile 0.15까지 허용하는 당시의 `allowFontRasterException`에 의존했다(이 예외 API는 이후 제거됐다. §검증 참고). 이 예외는 glyph raster뿐 아니라 spacing, 배경, control geometry 차이까지 전체 이미지 비율로 흡수할 수 있어 픽셀 근접 수락의 의미를 보장하지 못한다.

당시 Host 비교는 실제 authenticated route가 아니라 `HostApprovedShell`과 정돈된 component fixture를 최종 candidate로 **사용했다**. 반대로 실제 route에는 단계 보정, partial failure, 12건 작업함 같은 runtime 상태가 함께 나타나 첫 화면 구성과 노출량이 승인 시안에서 **벗어났다**. Admin mobile 실제 route는 locator가 추가된 queue DOM과 이를 반영하지 않은 fixture/grid 계약이 갈라져 제목 열이 한 글자 너비로 **붕괴했다**. 이 세 가지는 모두 이후 수렴 작업에서 해소됐다: 18개 candidate는 실제 authenticated route가 소유하고, 작업함 기본 노출은 desktop 4건·mobile 3건으로 제한되며, Admin mobile 제목 열 붕괴는 재발하지 않는다(§검증).

기존 tracked screenshot은 직전 구현 대비 회귀를 찾을 수 있지만, baseline 갱신이 승인 원본과 실제 route의 재대조를 요구하지 않으면 drift를 새 기준으로 굳힐 수 있다. 따라서 승인 자산, actual-route deterministic fixture, measurable geometry, 변경 무효화, 사람의 첫 작업 발견성을 하나의 합격 계약으로 연결해야 한다.

## 결정

Admin과 Host의 승인 PNG를 page composition의 최상위 시각 권위로 사용한다. 구현은 code-native semantic UI로 유지하되, 실제 authenticated route가 제품 router, layout, controller, query와 responsive CSS를 지난 뒤 등록된 desktop/mobile viewport에서 승인 자산에 픽셀 근접하도록 재현한다. Test-only shell과 component fixture는 빠른 회귀 근거로만 사용하고 final authority PASS 근거에서 제외한다.

Admin 승인 자산 `01`–`07`과 Host 승인 자산 `07`–`17` 전체를 범위로 한다. 주요 영역은 등록 위치·크기 대비 4 CSS px 이내, 반복 component 내부 정렬·간격은 2 CSS px 이내여야 한다. 제목·줄바꿈·section 순서·first viewport 노출·기본 disclosure state는 승인 자산과 일치해야 하며 고정 CI 환경의 전체 이미지 mismatch ratio 0.02를 차단한다. 전체 capture에 적용하는 0.10/0.15 font-raster ceiling은 허용하지 않는다. 불가피한 glyph raster 차이는 해당 glyph 영역과 근거를 versioned contract로 기록한 좁은 mask만 별도 승인할 수 있다.

현재 기능·접근성·권한·안전 계약은 삭제하지 않고 승인 시안의 흐름 안에서 progressive disclosure 또는 다음 단계로 재배치한다. Admin Today는 우선 업무 3건, Host workbox는 desktop 4건·mobile 3건을 기본 노출하고 초과 데이터는 명시적 `전체 보기` 경로로 이동한다. Partial failure와 phase normalization은 주 행동과 첫 화면 핵심 region을 밀어내지 않는 compact state summary로 표현한다. 접근성이나 안전성 때문에 시안과 달라져야 할 때는 차이, 근거, 영향, 비교 증거를 별도로 승인한다.

Token, shared CSS/component, fixture, route 또는 baseline 변경은 영향 reference의 기존 승인을 무효화한다. CI가 실제 changed paths를 reference dependency mapping에 전달해 새 actual-route candidate를 요구한다. Candidate snapshot 갱신만으로 합격하지 않으며 approved reference, candidate, overlay, diff, measurement report와 독립 검토가 필요하다. 첫 화면의 Admin 우선 작업, Host 현재 단계·다음 행동, 보조 기능 진입점을 30초 안에 식별하는 사람 기준 검증과 VoiceOver/Safari·NVDA/Chrome 수동 검증은 전체 수락의 필수 조건이다.

이 결정은 ADR-0048·0050의 product composition을 대체하지 않고 시각 수락 방식을 보완한다.

## 근거

- 승인 시안의 정보 우선순위를 executable acceptance로 옮겨 구현 편의가 시각 권위를 대체하지 못하게 한다.
- 기능·접근성 gate와 pixel gate를 분리해 한쪽 통과로 다른 쪽 실패가 가려지지 않는다.
- Shared token과 baseline 변경이 일으키는 downstream drift를 명시적으로 재검증한다.
- Overlay와 measurement report가 subjective screenshot 승인보다 원인과 의도적 차이를 추적하기 쉽다.
- 30초 discovery gate가 첫 viewport의 실제 이해도를 `not measured`인 채 닫는 것을 막는다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| 화면별 직접 CSS 보정 | 빠르지만 공통 shell·타이포·간격이 다시 갈라지고 downstream drift를 막지 못한다. |
| 구조적 유사성만 hard gate | 기존 geometry·semantic 검증과 차이가 작아 승인 시안과의 밀도·위계 차이를 다시 허용한다. |
| UI 시스템 전면 재구축 | 기능 회귀와 범위가 과도하며 기존 route-first·안전 계약을 불필요하게 흔든다. |
| 승인 PNG를 runtime background로 사용 | semantic HTML, responsive, accessibility, editable source를 잃는다. |

## 결과

긍정적:

- Admin·Host의 visual source of truth와 합격 증거가 명시된다.
- 잘못 갱신된 snapshot이나 오래된 visual seal이 새 변경을 자동 승인하지 못한다.
- 기능 보존, 접근성, pixel fidelity가 각각 검토 가능한 계약이 된다.
- 공통 기반을 먼저 고쳐 두 역할의 타이포·shell drift를 줄인다.

부정적/감수한 비용:

- Deterministic fixture, reference registration, overlay/diff pipeline 유지 비용이 생긴다.
- Font rendering 환경을 고정하고 미세한 raster 차이를 분류하는 검토 비용이 생긴다.
- Shared visual primitive 변경 시 Admin·Host reference를 넓게 다시 검증해야 한다.
- 사람의 30초 discovery 검증이 없으면 자동 gate가 통과해도 완료할 수 없다.

## 검증

`Proposed`를 유지한다.

2026-09-04 실제 authenticated route 수렴 이후의 측정 상태는 `docs/reports/2026-09-04-admin-host-actual-route-visual-authority-acceptance.md`에 있다. 진전된 부분:

- 18개 `VisualAuthorityScenario`가 실제 authenticated route를 candidate로 소유한다. Test-only shell을 최종 candidate로 쓰지 않는다.
- Broad font-raster exception API(`allowFontRasterException`, `fontRasterExceptionMaxRatio`, `skipMismatchRatioAssertion`)는 코드에서 제거됐고 unit 검사가 재도입을 막는다. 18/18이 `0.02` fail-closed이며 mask는 18/18 `null`이다.
- Composition, major region 4px, repeated alignment 2px, typography, first viewport, item cap, interaction, request audit가 18/18 통과했다. 가로 overflow는 18/18 0px이고 unmatched·effecting 요청은 0건이다.
- 18/18 산출물(reference/candidate/overlay/diff/report.json)이 완전하고 `referenceSha256`는 manifest와 18/18 일치한다.
- `approvedMockupsAffectedBy(changedPaths)`가 CI의 실제 diff와 연결돼 영향 승인을 만료시킨다.

닫히지 않은 조건:

- Strict pixel은 18/18 `not_passed_0.02`다. 승인 AI PNG 대비 raster 잔여가 남는다.
- `pnpm --dir front lint`가 error 4건으로 실패한다(제품 route 파일의 `react-hooks/refs` 포함).
- `pnpm --dir front test:ct:docker`가 18건 실패한다. 보조 회귀 suite의 geometry·semantic·tracked snapshot이 새 composition과 어긋난다.
- Cross-browser smoke 9건과 focused E2E 7건(+2 did not run)이 실패한다. 기존 Admin heading 계약과 Host 작업함 기대치가 새 밀도·disclosure 계약으로 갱신되지 않았다.
- 사람 30초 discovery gate는 `pending_external_human_evidence`다.
- Chrome toolbar 200% 실측과 VoiceOver/Safari, NVDA/Chrome은 `not_measured`다.
- 원격 CI는 `pending_remote_ci`다. 로컬 parity로 CI 성공을 추정하지 않는다.
- Candidate capture가 byte 단위로 완전 결정적이지 않다. 세 id(`admin-today-desktop`, `admin-space-switcher-desktop`, `host-live-mobile`)는 같은 실행의 재시도 간 candidate PNG hash가 달랐다. 측정 비율은 재현되지만 immutable receipt를 주장하려면 원인 확인이 필요하다.

이 조건이 모두 닫히기 전에는 `Accepted`로 올리지 않는다. 자동화 테스트나 AI 검토를 사람·보조기술·원격 CI 증거로 대신 쓰지 않는다.

`docs/superpowers/specs/2026-09-04-admin-host-actual-route-visual-authority-convergence-design.md`가 이후 수렴 작업의 current approved design이다. 이전 Host 슬라이스의 test-only fixture 합격은 역사적 근거로 보존하지만 전체 또는 실제 route 수락으로 사용하지 않는다.

구현 후 다음 조건이 모두 충족될 때 `Accepted`로 승격한다.

- Admin·Host approved asset hash와 deterministic fixture manifest를 추적한다.
- 실제 authenticated route를 소유하는 18개 `VisualAuthorityScenario`를 등록한다.
- Focused RED tests가 heading, queue-first, default disclosure, first-viewport, item cap, title width, 68:32, mobile single-action 계약을 먼저 실패한 뒤 구현 후 통과한다.
- Approved reference, actual-route candidate, 50% overlay, diff, measurement report를 18개 state마다 생성해 독립 검토한다.
- 고정 font/browser 환경에서 18개 모두 mismatch ratio 0.02, major region 4px, repeated alignment 2px 계약을 통과한다.
- 0·3·10건 Admin queue, 0·4·12건 Host workbox, 장문, partial/full failure, 320–1440px와 200% 확대 stress matrix를 통과한다.
- `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`, affected `pnpm --dir front test:e2e`가 통과한다.
- Keyboard, focus, 44px target, reduced motion, wrapping, 320–1440px overflow와 mobile safe-area를 검증한다.
- 30초 discovery gate를 실제 측정해 Admin 우선 작업, Host 단계·다음 행동, 보조 기능 진입점을 식별한다.
- VoiceOver/Safari와 NVDA/Chrome으로 heading, landmark, state announcement와 focus order를 확인한다.
- `front/DESIGN.md`, Admin·Host active design docs, tests와 visual baseline이 같은 계약을 설명한다.

## 후속 작업

- 구현 계획에서 각 actual-route reference state를 task와 acceptance evidence에 일대일로 연결한다.
- 기존 active design의 “픽셀 복사 대상이 아니다” 문구를 code-native pixel-near 계약과 충돌하지 않게 갱신한다.
- `approvedMockupsAffectedBy(changedPaths)`를 CI의 실제 diff와 연결해 영향 승인을 만료시킨다.
- 구현 완료 전에는 ADR-0053을 `Accepted`로 올리지 않는다.
