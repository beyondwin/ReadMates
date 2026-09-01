# ADR-0050: 플랫폼 어드민을 오늘 할 일 중심 운영 데스크로 재구성

- 상태: Accepted
- 결정일: 2026-08-30
- 작성자: 제품·디자인·플랫폼 운영·프런트엔드
- 관련: ADR-0039, ADR-0040, ADR-0045, ADR-0047, `docs/development/2026-08-30-readmates-platform-admin-operations-product-redesign-design.md`, `front/features/platform-admin/**`

## 컨텍스트

ADR-0047의 케이스 데스크와 운영 서사는 구현되었지만, 개편 전 화면은 기능명·상태 필터·raw enum이 운영자의 핵심 질문보다 먼저 보이고 route별 밀도와 mobile 완료 경로가 고르지 않았다. 개편 전 `AdminShellLayoutInner`는 capability, authority loss, onboarding mutation, navigation blocking, account switching, alarm과 shell render를 함께 소유했다. 현재는 shell 책임을 `front/features/platform-admin/route/admin-shell-controller.tsx`, onboarding 책임을 clubs route의 `front/features/platform-admin/route/admin-onboarding-controller.tsx`로 분리했다.

새 승인 시안은 ADR-0047의 A+B 방향을 계승하지만 상위 내비, Today 비율, 설명 순서, platform-neutral copy, desktop/mobile 일관 계약을 더 좁고 명확하게 고정한다. 기존 결정을 조용히 수정하지 않고 새 composition 결정으로 대체해야 한다.

## 결정

플랫폼 어드민의 page-level composition을 **오늘 할 일 중심 운영 데스크**로 고정한다.

- 1차 내비는 `오늘 할 일`, `클럽 관리`, `서비스 상태`, `처리 기록` 네 축이다. 긴급 공개 회수는 하단 비상 레인으로 유지한다.
- 사용 가능한 본문 폭이 960px 이상이면 Today desktop은 38:62의 우선순위 queue와 설명 docket이다. Queue는 최소 340px, docket은 최소 560px이며, 그 아래는 URL-addressable list/detail flow로 전환한다. Docket은 `무슨 일인가 → 왜 중요한가 → 확인한 근거 → 다음 행동 → 최근 처리 기록` 순서를 사용한다.
- Mobile은 desktop 축소판이 아니라 `목록 → 상세 → 안전한 조치 → 결과`의 route-based 완료 흐름이다.
- 모든 route는 warm paper, ink hierarchy, deep ink-blue action, muted ochre attention, Pretendard와 member product type scale을 사용한다.
- 정상은 조용히 표시하고 주의·오래됨·부분 실패·결과 불명만 강조한다. KPI card wall, raw enum/ID 우선 노출, AI식 추상 명사, 특정 클럽 슬로건·독서 내용은 platform shell에서 사용하지 않는다.
- 기존 `/admin/**` URL, ADR-0039의 cross-club Service Spine과 domain route ownership, ADR-0040의 safe-command, ADR-0045의 shared brand primitive는 유지한다.

이 결정은 ADR-0047을 대체한다. ADR-0045의 shared paper/ink primitive와 host composition은 대체하지 않는다.

## 근거

- 기능 카탈로그보다 실제 운영 순서가 먼저 보여 새 운영자의 학습 비용을 줄인다.
- queue와 설명 docket의 책임이 분명해 빠른 순회와 충분한 근거 확인을 함께 제공한다.
- 네 축이 클럽, service health, audit를 동등한 탭이 아니라 운영 목적에 맞게 묶는다.
- desktop과 mobile의 동일한 완료 계약이 단순 CSS stacking보다 회복성과 접근성을 높인다.
- 현재의 robust capability·receipt·convergence 계약을 유지하면서 표현과 composition만 사용자 업무에 맞춘다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| ADR-0047 유지 + cosmetic polish | 내비 명칭, Today 정보 순서, mobile flow, platform-neutral copy가 durable 계약으로 남지 않는다. |
| KPI dashboard 중심 첫 화면 | 수치가 판단 근거와 다음 행동을 밀어내고 정상 상태 소음이 커진다. |
| 모든 기능을 flat navigation으로 노출 | 새 운영자가 route 이름을 먼저 학습해야 하고 화면 hierarchy가 사라진다. |
| dark operations center | ReadMates 브랜드와 서비스 성격보다 긴장감과 장식이 앞선다. |
| 별도 admin v2 | URL, auth, telemetry, test surface가 이중화된다. |

## 결과

긍정적:

- 네 운영 축과 한 가지 상태·행동 언어를 모든 admin route에서 재사용한다.
- 신규 운영자가 원인, 영향, 근거, 조치, 결과를 같은 순서로 읽는다.
- design asset, code token, desktop/mobile acceptance가 하나의 계약으로 연결된다.

부정적/감수한 비용:

- 기존 route를 유지한 채 shell과 각 page를 순차 이관해야 한다.
- 실제 AdminShell, long Korean copy, 모든 상태 조합의 visual/browser baseline 유지 비용이 생긴다.
- Today 밖의 핸드롤 화면과 대형 CSS를 단계적으로 분해해야 한다.

## 검증

- `front/features/platform-admin/model/admin-route-catalog.ts`가 네 축과 기존 URL의 대응을 고정하고, route/E2E가 `/admin` deep link, reload, Back/Forward와 URL-owned selection/filter를 검증한다.
- `front/features/platform-admin/ui/admin-today-ledger.tsx`와 `front/features/platform-admin/ui/use-admin-content-width.ts`가 observed content width 960px을 기준으로 38:62 desk와 list/detail flow를 선택한다. 320, 390, 768, 900, 1024, 1440px browser/visual matrix와 실제 Chrome 200% zoom에서 수평 overflow 없음과 focus target을 확인했다.
- route·unit·component·E2E 검증이 loading, empty, stale, partial, 403, 409, invalid cursor, pending, unknown outcome, keyboard/focus, reduced motion와 긴 한국어/영어 wrapping을 다룬다. Docker Chromium component gate는 104/104를 통과했고 대표 admin shell·ledger·support PNG를 추적한다.
- `front/features/platform-admin/model/admin-copy.ts`, `front/features/platform-admin/model/admin-status-language.ts`와 UI 경계 검증이 raw enum/ID와 특정 club content를 1급 정보로 올리지 않도록 고정한다.
- Canonical frontend lint/test/build, focused/full E2E, server PR gate, MySQL/Testcontainers 1,422건, public release candidate 검증을 통과했고 code·tests·tracked visual evidence·`front/DESIGN.md`·`docs/development/architecture.md`가 일치해 `Accepted`로 승격했다.
- 5명 초보 운영자의 30초 이해 연구와 VoiceOver/Safari·NVDA/Chrome 수동 screen-reader announcement order는 아직 `not measured`다. 이 미측정은 구현과 자동 접근성 계약의 acceptance를 막지 않지만, 해당 사용자 연구와 수동 announcement 검증을 완료했다고 주장할 수는 없다.

## 후속 작업

- 5명 초보 운영자의 30초 이해 연구와 VoiceOver/Safari·NVDA/Chrome 수동 screen-reader 검증을 별도 evidence로 수행한다. 완료 전에는 정성 이해도나 announcement order를 production 검증 완료로 표현하지 않는다.
- 새 admin route를 추가할 때 `admin-route-catalog.ts`, 공통 상태 문법, tracked visual matrix와 exact capability/safe-command 계약을 함께 갱신한다.
