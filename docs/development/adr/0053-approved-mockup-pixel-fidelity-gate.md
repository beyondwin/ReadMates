# ADR-0053: 승인 시안을 Admin·Host 픽셀 근접 합격 기준으로 사용

- 상태: Proposed
- 결정일: 2026-09-02
- 작성자: product/design/front
- 관련: ADR-0045, ADR-0048, ADR-0050, ADR-0051, `docs/superpowers/specs/2026-09-02-admin-host-pixel-fidelity-design.md`, `front/DESIGN.md`

> 제품 구성은 ADR-0048·0050을 유지한다. 이 ADR은 승인 PNG를 참고 자산으로만 보고 구현 snapshot을 최종 회귀 권위로 삼던 검증 해석을 좁힌다. 독립 시각 검토(16/18 FAIL)와 사람 30초 gate가 남아 `Proposed`다.

## 컨텍스트

ADR-0048은 Host를 현재 모임 생애주기 운영실+작업함으로, ADR-0050은 Admin을 오늘 할 일 중심 운영 데스크로 고정했다. 기능, 권한, 회복성, responsive geometry 검증은 폭넓게 구현됐지만 현재 화면은 승인 시안의 정보 위계와 밀도에서 벗어났다.

Admin active design은 filter/status를 queue 앞에 두지 않고 사용자 라벨을 `오늘 할 일`로 사용하도록 정한다. 그러나 현재 `ADMIN_TODAY_HEADING`은 `오늘의 운영 케이스`이고(`front/features/platform-admin/ui/admin-today-ledger.tsx:25`), `AdminTodayControls`와 source 상태는 queue의 controls로 전달된다(`front/features/platform-admin/ui/admin-today-ledger.tsx:161`, `front/features/platform-admin/ui/admin-today-ledger.tsx:246`). 관련 unit/route tests도 기존 heading을 기대해 drift를 보호한다.

Host responsive CT는 semantic order와 68:32 geometry를 확인하지만 default workbox row의 visible control density는 검증하지 않는다. 현재 `HostWorkItem`은 모든 `NOW` item에서 defer select와 button을 항상 펼친다(`front/features/host/ui/workbox/host-work-item.tsx:55`). 이는 기능적으로 유효하지만 승인 시안의 compact workbox와 다르다.

기존 tracked screenshot은 직전 구현 대비 회귀를 찾을 수 있지만, baseline 갱신이 승인 원본과의 재대조를 요구하지 않으면 drift를 새 기준으로 굳힐 수 있다. 따라서 승인 자산, deterministic fixture, measurable geometry, 변경 무효화, 사람의 첫 작업 발견성을 하나의 합격 계약으로 연결해야 한다.

## 결정

Admin과 Host의 승인 PNG를 page composition의 최상위 시각 권위로 사용한다. 구현은 code-native semantic UI로 유지하되, deterministic fixture와 등록된 desktop/mobile viewport에서 승인 자산에 픽셀 근접하도록 재현한다.

Admin 승인 자산 `01`–`07`과 Host 승인 자산 `07`–`17` 전체를 범위로 한다. 주요 영역은 등록 위치·크기 대비 4 CSS px 이내, 반복 component 내부 정렬·간격은 2 CSS px 이내를 목표로 한다. 제목·줄바꿈·section 순서·first viewport 노출·기본 disclosure state는 승인 자산과 일치해야 한다. Font rasterization처럼 환경 의존적인 차이만 근거와 overlay가 있을 때 예외로 승인할 수 있다.

현재 기능·접근성·권한·안전 계약은 삭제하지 않고 승인 시안의 흐름 안에서 progressive disclosure 또는 다음 단계로 재배치한다. 접근성이나 안전성 때문에 시안과 달라져야 할 때는 차이, 근거, 영향, 비교 증거를 별도로 승인한다.

Token, shared CSS/component, fixture 또는 baseline 변경은 영향 reference의 기존 승인을 무효화한다. Candidate snapshot 갱신만으로 합격하지 않으며 approved reference, candidate, overlay, diff, measurement report와 독립 검토가 필요하다. 첫 화면의 Admin 우선 작업, Host 현재 단계·다음 행동, 보조 기능 진입점을 30초 안에 식별하는 사람 기준 검증은 구현 수락의 필수 조건이다.

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

`Proposed`를 유지한다. 비교 harness와 18-entry manifest는 구현됐지만 `docs/reports/2026-09-02-admin-host-pixel-fidelity-acceptance.md` 기준 독립 시각 검토는 16/18 FAIL이고 사람 30초 gate는 `pending_external_human_evidence`다. 이 조건이 닫히기 전에는 `Accepted`로 올리지 않는다.

구현 후 다음 조건이 모두 충족될 때 `Accepted`로 승격한다.

- Admin·Host approved asset hash와 deterministic fixture manifest를 추적한다.
- Focused RED tests가 heading, queue-first, default disclosure, first-viewport, 68:32, mobile single-action 계약을 먼저 실패한 뒤 구현 후 통과한다.
- Approved reference, candidate, 50% overlay, diff, measurement report를 desktop/mobile 대표 state마다 생성해 독립 검토한다.
- `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`, affected `pnpm --dir front test:e2e`가 통과한다.
- Keyboard, focus, 44px target, reduced motion, wrapping, 320–1440px overflow와 mobile safe-area를 검증한다.
- 30초 discovery gate를 실제 측정해 Admin 우선 작업, Host 단계·다음 행동, 보조 기능 진입점을 식별한다.
- `front/DESIGN.md`, Admin·Host active design docs, tests와 visual baseline이 같은 계약을 설명한다.

## 후속 작업

- 구현 계획에서 각 reference state를 task와 acceptance evidence에 일대일로 연결한다.
- 기존 active design의 “픽셀 복사 대상이 아니다” 문구를 code-native pixel-near 계약과 충돌하지 않게 갱신한다.
- 구현 완료 전에는 ADR-0053을 `Accepted`로 올리지 않는다.
