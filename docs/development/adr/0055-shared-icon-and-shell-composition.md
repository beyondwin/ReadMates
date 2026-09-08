# ADR-0055: 공유 브랜드 primitive에 아이콘과 셸 일관성 계약을 포함

- 상태: Accepted
- 결정일: 2026-09-05
- 기록일: 2026-09-09
- 작성자: product/design/front
- 관련: ADR-0045, ADR-0048, ADR-0050, ADR-0053, ADR-0054

## 컨텍스트

ADR-0045는 역할 간 paper/ink primitive 공유를 유지하는 결정이다. 2026-09-05 시각 충실도 작업은 공통 아이콘과 route별 셸 override 금지를 구현하면서 이 Accepted ADR 본문에 제약을 추가했다. 기존 결정의 본문을 보존하기 위해 추가된 계약을 이 후속 ADR로 분리한다.

## 결정

ADR-0045의 공유 브랜드 계약을 계승한다. 모든 역할은 warm paper, ink hierarchy, restrained navy accent, semantic state, typography, spacing, focus primitive를 공유한다. Host의 page composition은 ADR-0048, platform admin은 ADR-0050을 따르며, public·guest·member composition과 서버 권한·행동 계약은 이 결정으로 바꾸지 않는다.

Host와 platform admin의 제품 셸·원장·작업함 아이콘은 `front/shared/ui/icon.tsx`의 `ReadmatesIcon`과 `ReadmatesIconBadge`를 사용한다. `ReadmatesIcon`은 24 viewBox, 기본 stroke 1.75, size 16/20/24, `data-icon` 이름과 기본 `aria-hidden`을 제공하며, title을 받으면 접근성 이름을 제공한다.

- 제품 아이콘을 CSS `mask-image`/`background-image`의 `data:image/svg+xml`로 그리지 않는다.
- 셸의 route별 차이는 셸 컴포넌트의 명시적 prop/slot/context로 표현한다. `.admin-shell:has(<route class>)` 같은 후행 CSS override로 셸 크롬을 나누지 않는다.
- `front/tests/unit/shell-chrome-guards.test.ts`가 `features`, `shared`, `src/styles` CSS의 data URI와 `.admin-shell:has(` 출현을 baseline 0으로 감시한다.

## 근거와 결과

공용 SVG 컴포넌트는 아이콘의 기하와 접근성 표현을 한 곳에서 관리한다. 셸이 route별 CSS에 따라 달라지지 않도록 변경 지점을 명시하면 같은 역할의 화면 간 크롬 불일치를 줄일 수 있다. 공용 변경이 여러 화면에 영향을 주므로 소비 화면의 회귀 검증은 계속 필요하다.

## 검증과 상태

현재 구현 source는 `front/shared/ui/icon.tsx`이고, 아이콘의 기본 SVG·접근성 이름·채움 variant·badge tone은 `front/shared/ui/icon.test.tsx`가 검증한다. 위 CSS guard는 두 금지 패턴만 검사하며, 모든 시각·접근성 품질을 보장하지 않는다.

2026-09-09 `CI=true npx --yes corepack@0.35.0 pnpm --dir front exec vitest run shared/ui/icon.test.tsx tests/unit/shell-chrome-guards.test.ts`는 2개 파일·6개 테스트를 통과했다. pnpm 11.13.1을 사용했으며 로컬 Node 26에서 실행되어 CI Node 24 동등성 증거는 아니다. 코드·이 테스트·`front/DESIGN.md`·`docs/development/architecture.md`가 공용 primitive와 셸 제약을 같은 의미로 기술하므로 이 범위의 결정을 `Accepted`로 기록하고 ADR-0045를 대체한다.

이 ADR은 공용 primitive와 셸 변경 경계만 다룬다. 승인 PNG의 픽셀 통과, 전체 route 회귀, 사람·보조기술 측정은 별도 증거이며 ADR-0053의 남은 gate를 통과로 바꾸지 않는다. ADR-0054의 Quiet Desk 계약도 여전히 미구현 방향이다.
