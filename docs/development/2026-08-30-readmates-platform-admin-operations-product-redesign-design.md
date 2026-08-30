# ReadMates 플랫폼 어드민 운영 제품 재설계

- 날짜: 2026-08-30
- 표면: Platform admin (`/admin/**`) + 전역 공간 전환
- 상태: 설계 승인, 구현 전
- ADR impact: **supersede** — ADR-0050이 ADR-0047을, ADR-0051이 ADR-0026을 대체한다. 두 신규 ADR은 구현 전이므로 `Proposed`다.
- 관련: ADR-0019, ADR-0030, ADR-0035, ADR-0039, ADR-0040, ADR-0045, ADR-0050, ADR-0051
- 시안: `design/mockups/2026-08-30-admin-operations-redesign/`

## 1. 한 문장 정의

플랫폼 어드민을 기능 목록이나 KPI 벽이 아니라, 새 운영자도 **무엇을 왜 확인하고 다음에 무엇을 해야 하는지** 한눈에 이해하는 작은 운영 데스크로 재구성한다.

## 2. 목표와 성공 조건

### 목표

1. 대표 신규 운영자가 첫 진입 30초 안에 오늘 처리할 일, 서비스 이상, 최근 처리 결과를 구분하는 것을 목표로 한다. 현재 사용자 과업 검증은 `not measured`이며 구현 후 5명 이상의 첫 사용 과업으로 측정한다.
2. 케이스 하나를 선택하면 원인·영향·근거·최신성·가능한 조치를 한 흐름에서 이해한다.
3. 플랫폼 운영과 개인의 클럽 활동을 혼동하지 않고 안전하게 오간다.
4. 모든 화면이 같은 용어, 크기, 상태 문법, Pretendard 기반 브랜드 톤을 사용한다.
5. 모바일에서도 목록 확인부터 안전한 조치와 결과 확인까지 완료한다.
6. route-first frontend와 domain-owned safe-command를 유지하면서 과대 컴포넌트와 중복 정책을 분리한다.

### 성공 조건

- 상위 내비는 `오늘 할 일`, `클럽 관리`, `서비스 상태`, `처리 기록` 네 축만 보인다.
- 정상은 조용하고, 주의·오래됨·부분 실패·결과 불명만 강조한다.
- raw enum, 내부 ID, 개발자 용어는 기본 화면의 1급 정보가 아니다.
- 서버가 허용하지 않은 공간이나 조치는 클라이언트가 역할명으로 추론하지 않는다.
- 모든 운영 mutation은 실행 전후 상태와 영수증 또는 이력을 남기며, 결과 불명은 성공으로 축약하지 않는다.
- 320–1440px viewport 대응, 200% zoom, keyboard, screen reader, reduced motion 검증 계약을 만족한다.

## 3. 비범위

- 클럽 내부의 모임·멤버·출석·기록 운영을 플랫폼 어드민으로 옮기지 않는다.
- 기존 `/admin/**` URL과 deep link를 없애거나 `/admin-v2`를 만들지 않는다.
- ADR-0040의 command 등급·권한·receipt·convergence 계약을 약화하지 않는다.
- 시안의 예시 숫자와 문구를 운영 데이터 계약으로 간주하지 않는다.
- 이미지 생성 결과를 실제 Pretendard 렌더링 증거로 간주하지 않는다.

## 4. 현재 상태 진단

현재 플랫폼 어드민은 서버 기능과 안전 계약은 넓지만, 정보 구조와 코드 소유권이 사용자 업무 순서로 정리되어 있지 않다.

### 제품·UX 문제

- 첫 화면에서 필터와 상태가 큐의 핵심 판단보다 앞서 새 운영자가 무엇부터 해야 하는지 어렵다.
- Today 이외 화면은 page header, 상태, detail, action, receipt 문법이 고르지 않다.
- `OWNER`, `HOST`, `ACTIVE`, case ID, `Job`, `Event` 같은 내부 값과 개발자 용어가 사용자 문장보다 먼저 보이는 구간이 있다.
- 데스크톱 셸을 쌓아 올린 모바일은 상단이 길고 내비가 가로 스크롤되어 작업 순서가 끊긴다.
- 플랫폼 셸에 특정 클럽의 슬로건이나 독서 내용이 들어가면 cross-club 권한 범위가 흐려진다.
- 운영자·호스트·멤버 전환이 하나의 명확한 공간 모델이 아니라 화면별 메뉴로 나뉜다.

### 코드·구조 문제

- `AdminShellLayoutInner`는 capability 조회, authority loss, onboarding mutation, dirty navigation, 계정 전환, alarm, shell render를 함께 소유한다 (`front/features/platform-admin/route/admin-shell-layout.tsx:56`). SRP 경계가 흐리고 회귀 범위가 크다.
- 관리자 공간 목록은 `joinedClubs`의 role/status를 다시 계산하며 `approvalState`를 누락한다 (`front/features/platform-admin/model/admin-workspace-switcher-model.ts:38`). 반면 host 접근 정책은 `approvalState === ACTIVE`까지 요구한다 (`front/shared/auth/member-app-access.ts:18`). 같은 권한을 두 곳에서 다르게 계산한다.
- 공통 shell의 workspace 타입이 `member | host`에 고정되어 플랫폼 공간을 같은 모델에서 표현하지 못한다 (`front/shared/model/app-club-shell.ts:3`).
- route 대응과 fallback이 하나의 정규식 중심 model에 집중되어 새 route가 추가될수록 수정 이유가 늘어난다 (`front/src/app/workspace-route-model.ts:75`).
- 마지막 안전 목적지는 workspace별 pathname만 저장한다 (`front/src/app/workspace-route-continuity.ts:3`). query, hash, focus, scroll, club/perspective별 복귀 문맥을 보존하지 못한다.
- admin UI는 route-first 폴더 구조를 갖췄지만 큰 route/shell이 남아 있고, admin selector가 `globals.css`와 `admin-editorial-ledger.css`에 중복 분산되어 composition·transition·visual primitive 변경의 회귀 범위가 크다.

### SOLID 판단

| 원칙 | 현재 판단 | 개선 방향 |
| --- | --- | --- |
| SRP | shell·route 일부가 권한, mutation, 이동 차단, 표시를 함께 소유 | `space projection`, `transition guard`, `route state`, `page composition`으로 분리 |
| OCP | route family 정규식과 화면별 switch 수정이 필요 | route registry와 typed correspondence policy로 확장 |
| LSP | 해당 없음에 가까움; UI 상속 계층보다 composition 중심 | 새 상속 계층을 만들지 않고 prop/callback composition 유지 |
| ISP | shell이 auth 전체와 여러 mutation hook을 요구 | 필요한 projection과 callback만 받는 작은 interface 사용 |
| DIP | client가 role/status로 권한을 재계산 | server-owned `availableSpaces`, capability, `allowedActions`에 의존 |

## 5. 운영자 작업 모델

모든 화면은 다음 운영 루프 중 하나를 완결한다.

```text
신호 → 오늘 할 일 → 이유·영향·근거 확인 → 안전한 조치 → 처리 결과 → 원래 문맥으로 복귀
```

운영자가 먼저 알아야 하는 순서는 고정한다.

1. **무슨 일인가** — 사람이 이해하는 한 문장
2. **왜 중요한가** — 영향 대상과 긴급도
3. **근거가 충분한가** — 출처, 관측 시각, 임계값, 불확실성
4. **지금 할 수 있는가** — 서버가 허용한 action만
5. **무엇이 바뀌었는가** — receipt, history, convergence

## 6. 정보 구조와 라우트

기존 URL은 보존하고 상위 내비만 운영자 언어로 재구성한다.

| 상위 내비 | 현재 route | 기본 화면 문법 |
| --- | --- | --- |
| 오늘 할 일 | `/admin`, `/admin/today` | 우선순위 큐 + 설명 도켓 |
| 클럽 관리 | `/admin/clubs`, `/admin/clubs/:clubId`, `/admin/support`, `?onboarding=1` | 클럽 목록·상세 + 지원 접근 도구 + onboarding |
| 서비스 상태 | `/admin/health`, `/admin/notifications`, `/admin/ai-ops` | 한 문장 상태 + 이탈 목록 + source detail |
| 처리 기록 | `/admin/audit`, `/admin/analytics` | 시간순 운영 기록 + 분석 부록 |
| 비상 레인 | `/admin/public-takedown` | 별도 단계형 L3 flow; 상위 네 축과 시각적으로 분리 |

`알림`, `AI`, `지원`, `분석`은 독립 제품처럼 보이는 상위 메뉴가 아니라 각 운영 목적 안의 route다. Notifications/AI는 `서비스 상태`, support는 `클럽 관리`, audit/analytics는 `처리 기록` active navigation을 사용한다. 기존 deep link와 browser history는 유지한다.

## 7. 전역 공간 모델

전역 공간 kind의 전체 집합은 정확히 두 개다. UI는 서버가 현재 계정에 허용한 subset만 렌더하고, 하나만 허용되면 switcher를 숨기거나 비활성화한다.

| 전역 공간 | 의미 | 다음 선택 |
| --- | --- | --- |
| 플랫폼 운영 | 여러 클럽과 서비스의 cross-club 운영 | 네 운영 내비 |
| 내 클럽 | 사용자가 참여한 한 클럽의 활동 | 클럽 선택 후 `멤버로 보기` 또는 권한이 있을 때 `호스트로 운영` |

계정 identity는 공간 전환과 분리한다. 플랫폼 셸에는 현재 개인 클럽의 슬로건·책·모임 내용을 노출하지 않는다.

### 전환 계약

- 서버는 `availableSpaces`와 club별 가능한 perspective를 투영한다. 각 목적 route는 기존 capability/guard로 action authority를 다시 확인하고, client는 role enum으로 공간 접근을 다시 만들지 않는다.
- 클럽 identity는 ADR-0019대로 URL이 소유한다.
- return target은 `pathname + search + hash + focus target + scroll`을 보존하고 공간·club·perspective별로 분리한다. 복원 전에 최신 `availableSpaces`, route correspondence, route-owned allowlist를 다시 검사하고 stale/invalid target과 허용되지 않은 query/hash/focus를 폐기한다.
- 전환 상태는 `clean`, `dirty`, `pending`, `unknown-outcome` 네 종류다.
- `dirty`는 이탈 확인 뒤 이동할 수 있다. `pending`은 request가 응답하거나 domain별 timeout에 도달할 때까지 이동을 막고, timeout이면 `unknown-outcome`으로 전환한다. `unknown-outcome`은 자동 재실행하지 않고, receipt가 있는 command는 같은 identity로 조회·재개하며 L1은 authoritative state/history를 다시 읽는다.
- authority loss는 민감 cache와 draft를 폐기하고 안전한 허용 공간으로 `replace` 이동한다.
- 목적 route가 대응되지 않으면 이전 안전 목적지, 해당 perspective의 대표 route 순으로 fallback한다.

## 8. 화면 계약

### 8.1 공통 셸

- 좌측에는 ReadMates와 네 운영 내비, 하단에 계정과 비상 레인을 둔다.
- 본문 상단에는 전역 공간 전환과 현재 데이터 시각을 둔다.
- left rail을 제외한 본문 max width는 멤버 제품과 같은 `1240px`다. Today도 같은 상한을 사용하고 별도 무제한 폭을 만들지 않는다.
- desktop 화면은 공통 header, left rail, content gutter, title baseline을 공유한다.
- 현재 위치는 시각, `aria-current`, 제목 중복 없이 한 번만 명확히 표시한다.

### 8.2 오늘 할 일 — 38:62 운영 데스크

- 사용 가능한 본문 폭이 960px 이상일 때 좌측 38% 우선순위 큐와 우측 62% 설명 도켓을 persistent split으로 표시한다. 각 pane 최소 폭은 queue 340px, docket 560px다.
- 본문 폭이 960px 미만이면 URL-addressable list/detail flow로 전환한다. Docket 순서는 `무슨 일인가 → 왜 중요한가 → 확인한 근거 → 다음 행동 → 최근 처리 기록`이다.
- 큐 선택은 URL에 남고 Back/Forward, reload, deep link에서 복원된다.
- 처리 직후에는 현재 case detail에 결과를 남겨 확인한 다음 사용자가 다음 항목으로 이동한다. Queue를 떠난 뒤의 영구 결과 조회는 기존 처리 기록 deep link를 사용하며 새 `recentlyHandled` projection을 가정하지 않는다.
- filter/status는 보조 제어이며 큐 앞에 놓지 않는다.
- raw source payload, internal ID, enum은 접힌 기술 정보에서만 필요할 때 보인다.
- 1차 lifecycle action은 서버가 현재 허용하는 `확인함`, `잠시 미룸`, `처리함`만 제공한다. `무시`와 `병합`은 별도 server semantics가 없으므로 표시하지 않는다.

### 8.3 클럽 관리

- 목록은 이름, 공개 상태, 운영 준비, 최근 신호를 우선 표시한다. 마지막 확인 시각은 현재 source가 제공할 때만 표시하며 만들지 않는다.
- 정상 행은 무채색이고, 확인이 필요한 행만 상태 라벨과 다음 행동을 갖는다.
- 상세는 `기본 정보 → 현재 상태 → 영향 → 가능한 조치 → 최근 처리 기록` 순서다.
- 특정 클럽의 모임·책·멤버 콘텐츠는 platform scope에서 운영 판단에 꼭 필요한 aggregate를 제외하고 복제하지 않는다.

### 8.4 서비스 상태

- 최상단 문장은 `정상`, `주의 필요`, `일부 확인 불가`, `오래됨`을 데이터 최신성과 함께 설명한다.
- 정상 항목의 숫자 카드는 펼치지 않는다. 변화나 이탈이 있는 source만 위로 올린다.
- 알림 배달, AI 작업, DB·Redis·Kafka·outbound resilience 등 현재 health source는 같은 freshness·availability 문법을 쓰되 각 domain detail route가 사실을 소유한다. 별도 API availability/latency source는 이 설계가 새로 가정하지 않는다.
- view model의 `확인 불가`, `사용 안 함`, `데이터 없음`, `오래됨` 상태를 정상 0건으로 합치지 않는다. 이는 wire enum 추가를 전제하지 않고 현재 응답의 refresh/source 상태를 사용자 언어로 정규화한 값이다.

### 8.5 처리 기록

- 한 행은 `시각 · 누가 · 무엇에 · 무엇을 했고 · 결과가 무엇인지` 읽히는 문장이다.
- 결과는 `완료`, `실패`, `차단됨`, `진행 중`, `결과 확인 필요`로 번역한다.
- 사유, request/receipt identity, 재시도·수렴 상태는 detail에 계층적으로 노출한다.
- 분석은 처리 결정을 바꾸는 aggregate만 부록으로 제공하고 첫 화면 KPI 벽으로 만들지 않는다.

### 8.6 모바일

- shell을 축소하지 않고 `목록 → 상세 → 안전한 조치 → 결과`의 URL-addressable query state flow로 재구성한다.
- Today는 목록과 상세를 한 화면에 동시에 넣지 않는다.
- 하단 내비는 최대 네 운영 축, 현재 공간 전환은 header control로 둔다.
- 주 행동은 한 개만 강조하고 나머지는 overflow 또는 다음 단계로 이동한다.
- L3 비상 명령은 모바일 UI에서 desktop handoff를 기본 행동으로 제공한다. 이는 viewport 기반 보안 경계가 아니며 direct URL/API는 기존 capability와 safe-command 정책이 동일하게 검사한다.

## 9. 상태와 카피 원칙

### 상태 문법

| 상태 | 화면 표현 | 행동 |
| --- | --- | --- |
| 정상 | 무채색 짧은 문장 | 없음 또는 detail 보기 |
| 주의 필요 | muted ochre + 이유 | 확인/보류/도메인 route |
| 오래됨 | 마지막 성공 시각 + 오래된 정도 | 새로 확인 |
| 일부 실패 | 성공한 범위와 실패한 source 분리 | 실패 source 재시도/이동 |
| 결과 확인 필요 | 성공/실패로 추정하지 않음 | 같은 receipt로 조회/재개 |
| 권한 없음 | 빈 UI가 아니라 제한 이유 | 허용 공간으로 이동 |

### 용어 사전

| 내부/기존 표현 | 사용자 라벨 |
| --- | --- |
| Today / 운영 케이스 | 오늘 할 일 |
| Club registry | 클럽 관리 |
| Health / Pipeline | 서비스 상태 |
| Audit ledger / receipt list | 처리 기록 |
| ACKNOWLEDGED | 확인함 |
| SNOOZED | 잠시 미룸 |
| RESOLVED | 처리함 |
| OWNER / OPERATOR / SUPPORT | 역할명이 꼭 필요한 detail에서만 `소유자 / 운영자 / 지원 담당` |
| unknown outcome | 결과 확인 필요 |

카피는 짧고 구체적인 한국어 동사를 쓴다. “최적화”, “인텔리전스”, “오케스트레이션”, “인사이트”처럼 행동을 설명하지 않는 AI식 명사를 피한다.

## 10. 시각 시스템

- font family: `--f-sans: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif`
- desktop type scale: `36 / 28 / 20 / 17 / 16 / 14 / 12px`
- body line-height: `1.6`
- surface: warm paper
- text: charcoal/ink
- primary action: deep ink-blue
- attention: muted ochre
- divider: low-contrast hairline
- 정상 상태에 녹색 badge를 반복하지 않는다.
- 장식 gradient, glow, glass, 과도한 card, dark NOC theme를 사용하지 않는다.
- 숫자 비교에만 tabular number를 사용한다.

시안은 톤과 비율의 권위이며 픽셀 복사 대상이 아니다. 실제 구현은 repository token과 bundled Pretendard를 사용하고, Korean/English wrapping, contrast, focus, reduced motion을 code/CT/browser로 검증한다.

## 11. 프런트엔드 목표 구조

route-first 의존성(`app → pages → features → shared`)을 유지하면서 책임을 다음처럼 나눈다.

```text
app
  global-space route composition, transition guard, authority-loss coordination
  /api/auth/me projection consumption and restore orchestration
shared/global-space
  model: destination/correspondence/return-target policy
  ui: two-level space switcher rendered from props
features/platform-admin
  api: domain wire contracts
  queries: cache/mutation/invalidation
  model: copy, status, page view models
  route: URL state and prop assembly
  ui: shell primitives and prop/callback presentation
shared
  brand tokens and truly reusable controls only
```

구조 원칙:

- `AdminShellLayout`은 shell composition과 authority boundary만 소유한다.
- onboarding은 기존 `/admin/clubs?onboarding=1` deep link를 유지하되 clubs route/controller가 소유하고 shell에 mutation hook을 두지 않는다.
- space projection 조회와 transition orchestration은 app composition root가 소유한다. 실제로 두 shell이 재사용하는 pure model/UI만 shared에 두고, platform-admin feature에는 projection과 callback을 props/slot으로 주입해 feature-to-feature import를 만들지 않는다.
- UI는 API/queries/router를 import하지 않는다.
- enum 번역, freshness, priority, next-action 계산은 pure model에 둔다.
- 새 abstraction은 최소 두 화면에서 같은 의미로 재사용할 때만 shared로 올린다.
- CSS는 token, shell, page-pattern, domain detail 경계를 나누고 한 파일에 모든 route selector를 계속 추가하지 않는다.

## 12. 서버·계약 원칙

- `/api/auth/me`의 additive versioned `availableSpaces` field가 사용자가 열 수 있는 전역 공간과 club perspective를 명시한다. 기존 `joinedClubs`, `platformAdmin`, `recommendedAppEntryUrl`은 호환 기간 유지하며 각 목적 route의 기존 capability/guard는 action authority를 계속 재검증한다.
- platform capability와 case `allowedActions`가 권위이며 client role mapping은 표시용 번역에만 사용한다.
- 현재 보류 UI가 수집하지만 request가 버리는 사유 입력은 제거한다. 향후 사유가 필요하면 raw free-text가 아니라 versioned `reasonCategory`와 필요한 경우 bounded/redacted note를 request, application service, event/audit까지 함께 구현한 뒤 노출한다.
- `무시`와 `병합`은 1차 비범위다. source identity, reopen, history 보존 규칙을 갖춘 별도 server contract 없이 UI에 표시하지 않는다.
- 운영 상태를 표현하는 read projection은 generated/as-of, source availability, partial failure를 구분한다.
- safe-command는 ADR-0040의 L1/L2/L3, idempotency, receipt, convergence를 그대로 사용한다.

## 13. 접근성·반응형·복구 검증

- viewport: 320, 390, 768, 900, 1024, 1440px 및 200% zoom
- keyboard: skip link, space menu, queue roving/selection, dialog focus trap/return, Back/Forward
- semantics: `aria-current`, selection, pressed state를 한 control에 중복 선언하지 않음
- wrapping: 긴 한국어/영어 club name, status sentence, button label
- states: loading, true empty, filtered empty, stale, partial source failure, 403, 409, invalid cursor, authority loss, pending, unknown outcome
- recovery: refresh, retry, same receipt 또는 authoritative history lookup, safe fallback, focus/scroll restoration
- novice comprehension: 구현 후 처음 보는 운영자 5명 이상에게 `오늘 처리할 일 찾기`, `서비스 이상 구분`, `직전 처리 결과 찾기` 3개 과업을 주고 각 30초 내 3/3 성공을 목표로 측정한다. 측정 전 결과는 `not measured`다.
- motion: reduced-motion에서 position/opacity animation 제거

## 14. 시안 자산 계약

승인된 일관 세트만 추적한다. 모든 PNG에는 생성 prompt가 embedded되어 있고 같은 이름의 JSON sidecar가 있다.

| 파일 | 크기 | SHA-256 | 의도 |
| --- | --- | --- | --- |
| `01-today-desktop.png` | 1672×941 | `5d4d778850e45bce7449002c186ccea6fa7f830d1cee76ff38a904b1971ea76b` | 38:62 오늘 운영 데스크 |
| `02-clubs-desktop.png` | 1672×941 | `273f2fbfc4df955ce837b0120cb9b518f10991be546c218d707ded9a32d67c91` | 클럽 관리 |
| `03-service-status-desktop.png` | 1672×941 | `6b6af23ba5eb6b25437d5ff2bdbe50f9d9dcbf8e62092705ed28485a1a584b2b` | 서비스 상태 |
| `04-processing-records-desktop.png` | 1672×941 | `0d318e14a7757e279cb4595a3bfc299335a6262a95edf23ed5c719b62940cbd3` | 처리 기록 |
| `05-space-switcher-desktop.png` | 1672×941 | `dfc9222888cf41cdd4f0e3c03c260be349f5fe3120068486f0151fc1a07578a8` | 플랫폼 운영/내 클럽 전환 |
| `06-today-mobile.png` | 853×1844 | `c3171752bfd56d7957dea6cfb06f4031692113024a0bf3b2bcc452f61b6d9aeb` | 모바일 오늘 목록 |
| `07-work-detail-mobile.png` | 853×1844 | `a6098cbb77c991197e7e03e2b803438342a66daad3d83c46b2dc74b90de16291` | 모바일 상세·조치 |

## 15. 구현 순서와 ADR 승격

1. additive `availableSpaces v1` projection을 기존 auth field와 함께 제공하고, 구 client 호환과 projection 부재/invalid 시 fail-closed 또는 기존 안전 fallback을 검증한다.
2. 전환 안전 model과 공통 two-level switcher를 만든다.
3. 현재 UI-only 사유 입력을 제거하고 `무시`·`병합`이 표시되지 않는 정직한 action contract를 잠근다.
4. 공통 token/copy/status/shell primitive와 실제 admin shell visual test를 고정한다.
5. Today를 38:62 desktop + route-based mobile로 완성한다.
6. 클럽 관리, 서비스 상태, 처리 기록을 같은 shell과 상태 문법으로 순차 이관한다.
7. raw enum/ID, 중복 CSS, oversized route/shell 책임을 제거한다.
8. 전체 route, authority, safe-command, responsive, accessibility evidence를 통과한다.
9. `docs/development/architecture.md`, `front/DESIGN.md`를 실제 코드와 맞춘 뒤 ADR-0050/0051을 `Accepted`로 승격한다.

각 단계는 이전 URL과 서버 권한을 유지한 독립 릴리스가 가능해야 한다. 상세 task와 파일·테스트는 구현 계획에서 고정한다.

## 16. 참고한 제품 패턴

- [Linear Triage](https://linear.app/docs/triage): 우선순위 inbox와 정규 목록 분리
- [Intercom Inbox](https://www.intercom.com/help/en/articles/6258745-the-inbox-explained): queue에서 detail로 이어지는 처리 흐름
- [Sentry Issue Details](https://docs.sentry.io/product/issues/issue-details/): evidence와 event hierarchy
- [Stripe Workbench](https://docs.stripe.com/workbench/overview): 작업과 결과 추적
- [GitHub audit log](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization): actor/action/target 기반 기록
- [Cloudflare audit logs](https://developers.cloudflare.com/fundamentals/account/account-security/audit-logs/): 운영 변경의 감사 가능성
- [Grafana no data and error states](https://grafana.com/docs/grafana/latest/alerting/fundamentals/alert-rule-evaluation/nodata-and-error-states/): no data/error를 정상으로 축약하지 않는 상태 모델

외부 제품의 화면을 복제하지 않는다. 위 패턴은 queue, evidence, receipt, no-data semantics의 비교 근거로만 사용하며 구현 기준은 이 문서와 현재 ReadMates 계약이다.
