# ReadMates 플랫폼 어드민 Service Spine 전면 개편 설계

작성일: 2026-08-22

상태: APPROVED DESIGN SPEC

구현 상태: 시작 전

대상 표면: `front/`의 `/admin/**`, `front/functions` BFF, Spring platform-admin API와 관련 persistence·audit

ADR impact: `new` — ADR-0039, ADR-0040. ADR-0020·ADR-0029·ADR-0030·ADR-0033·ADR-0037을 준수한다.

## 1. 문서의 역할과 선행 설계 관계

이 문서는 플랫폼 어드민 전체를 하나의 운영 제품으로 다시 구성하는 승인된 기준이다. 단순한 시각 정돈이
아니라 정보 구조, 현재 미연결 기능, 위험 작업의 서버 계약, 오류·복구, 모바일 완결성, 검증·출시 기준을
함께 다룬다.

다음 선행 문서는 현재 구현과 결정의 근거로 유지한다.

- `2026-08-04-readmates-platform-admin-operations-command-center-design.md`: 운영 케이스와 지휘대 기반
- `2026-08-12-readmates-platform-admin-site-tone-redesign-design.md`: 운영 기록대의 시각 언어와 `/admin/today`
- `2026-06-25-readmates-admin-support-audit-operations-design.md`: 지원 grant와 감사 상세의 안전 계약

이 문서와 선행 문서가 충돌하면 `/admin/**` 전체의 메뉴 구조, 공통 화면 문법, route별 기능 범위,
구현 순서와 수용 기준은 이 문서를 따른다. 선행 문서의 이미 구현된 운영 케이스 lifecycle, URL selection,
source freshness, optimistic version, support metadata redaction 계약은 명시적으로 변경하지 않는 한 유지한다.

현재 코드, 테스트, migration, `docs/development/architecture.md`가 구현 시점의 source of truth다. 이 문서는
승인된 목표와 미구현 의무를 기록하며 아직 존재하지 않는 동작을 현재 기능처럼 설명하지 않는다.

## 2. 문제 정의

플랫폼 어드민은 다음 아홉 route를 제공한다.

- `/admin/today`
- `/admin/clubs`
- `/admin/clubs/:clubId`
- `/admin/health`
- `/admin/notifications`
- `/admin/ai-ops`
- `/admin/support`
- `/admin/audit`
- `/admin/analytics`

각 route는 실제 데이터와 여러 운영 기능을 갖고 있지만 완성도와 화면 문법이 서로 다르다.
`/admin/today`는 지속 가능한 case queue, source freshness, URL selection, cursor 누적, optimistic conflict,
mobile drill-in을 갖춘 반면 나머지 route는 서로 다른 세대의 카드, 표, 즉시 실행 버튼, 불완전한 빈 상태로
구성되어 있다. 그 결과 운영자는 다음 질문에 일관되게 답할 수 없다.

1. 지금 플랫폼 전체에서 무엇을 먼저 처리해야 하는가?
2. 이 신호의 원천과 최신성, 영향 대상, 경과 시간은 무엇인가?
3. 현재 역할로 무엇을 볼 수 있고 어떤 작업을 수행할 수 있는가?
4. 실행 전에 바뀔 대상과 제외 대상, 비용과 되돌림 가능성을 확인했는가?
5. 실행 요청의 응답이 끊겼을 때 중복 실행 없이 결과를 확인할 수 있는가?
6. 부분 성공과 실패를 대상별로 구분해 후속 조치를 할 수 있는가?
7. 나중에 누가 무엇을 왜 실행했고 결과가 어땠는지 재구성할 수 있는가?

전면 개편의 핵심은 화면을 닮게 만드는 것이 아니라 이 운영 질문에 모든 route가 같은 문법으로 답하게
만드는 것이다.

## 3. 현재 구현 진단

### 3.1 유지할 기준 구현

`front/features/platform-admin/route/admin-today-route.tsx`와 관련 operations model·query·UI는 다음
기준을 이미 제공한다.

- 우선순위가 있는 운영 case queue와 선택 inspector
- state, severity, source, assignee filter와 URL selection
- acknowledge, snooze, resolve, source-driven reopen lifecycle
- source별 freshness와 partial failure
- cursor 누적, dedupe, 새 데이터가 들어와도 검토 위치를 보존하는 snapshot
- permission loss와 version conflict의 구분
- 좁은 화면에서 목록 → 상세 → 상태 변경으로 이어지는 drill-in

전면 개편은 이 계약을 폐기하지 않고 공통 문법으로 추출해 다른 route에 맞게 적용한다. 공통 UI가 각
도메인의 fetch, 권한, mutation을 대신 소유하지는 않는다.

### 3.2 route별 확인된 사각지대

| Route | 현재 강점 | 반드시 닫을 사각지대 |
| --- | --- | --- |
| 오늘 | 가장 완성된 case queue·inspector·복구 | resolve dialog focus trap·초기 focus·trigger 복원, 601–768px composition |
| 클럽 목록 | triage 정렬, 상태 filter, onboarding 진입 | 서버 search/cursor 부재, 100개 hard cap, 7열 table의 mobile record 부재, capability와 무관한 CTA |
| 클럽 상세 | readiness와 운영 aggregate, 관련 route drill | metadata·public visibility·domain component/API가 있으나 current route에서 도달 불가, 보조 source 하나의 실패가 전체 loader를 실패시킴 |
| 서비스 건강 | server freshness, provider-local card, deploy evidence | 영어·한국어 naming 불일치, loading/error landmark, raw metric과 작업 case 연결 부족 |
| 알림 | snapshot, event/delivery ledger, replay preview/confirm | cursor·status·channel UI 누락, preview warning·예상 status count 숨김, `skippedCount` 손실, 불명확한 실패 문구 |
| AI 작업 | 비용·실패 summary, trend, filter, job action | cursor/status filter 없음, query failure와 empty 혼동, unavailable을 0으로 표시, 즉시 mutation, 잘못된 503 판정 |
| 지원 | 대상 검색, risk 검토, reason·expiry, grant lifecycle | 검색 accessible label, create/revoke role 표현 불일치, revoke 확인 없음, read error와 mutation error 혼합 |
| 감사 | 여러 source ledger, 기간, detail, partial source | filter UI 축소, load-more가 누적 대신 page 교체, actor·target 미표시, case event와 AI action coverage 누락 |
| 분석 | 기간별 KPI, availability, series, benchmark, CSV | 화면 benchmark와 CSV field 불일치, unavailable/zero 경계, keyboard·zoom·export 완료 증거 부족 |

Security chain까지 포함한 계약 재검토에서는 다음을 추가로 확인했다.

- AI force-cancel·retry POST의 exact method/path가 현재 Spring CSRF ignore matcher에 없다. 정상 BFF
  요청이 403이 되는 명시적 결함이며 standalone controller test는 BFF → security filter chain을 우회한다.
- Support grant write와 audit가 하나의 atomic transaction/receipt로 결속되지 않으며 active duplicate의
  동시 생성 방지, idempotency, response-loss 복구가 없다.
- Legacy support projection은 role만으로 전체 reason과 user UUID를 노출할 수 있어 ADR-0030의 민감 정보
  capability 분리를 적용해야 한다.
- Global audit union이 `admin_operation_case_events`와 AI admin action ledger를 모두 포함하지 않는다.

### 3.3 공통 원인

- route별로 page header, freshness, filter, list, detail, action 상태를 새로 구성해 의미와 품질이 drift한다.
- server가 가진 cursor, warning, skipped count, actor, target 정보를 frontend가 온전히 표현하지 않는다.
- frontend role matrix와 server authorization 결과가 하나의 capability 계약에서 파생되지 않는다.
- 위험 mutation의 preview-confirm 성숙도가 도메인마다 다르고 AI·지원은 중복 실행과 결과 불명에 취약하다.
- loading, unavailable, empty, zero가 일부 화면에서 같은 표현으로 수렴한다.
- 넓은 표를 CSS로 좁히는 것만으로 mobile workflow를 해결한다.
- audit가 모든 운영 case와 command를 하나의 추적 가능한 사건으로 연결하지 못한다.

## 4. 외부 리서치에서 채택한 원칙

외부 제품의 외형을 복제하지 않는다. 운영 workflow와 안전 패턴만 ReadMates의 도메인에 번역한다.

- [Linear Triage](https://linear.app/docs/triage): 외부 신호를 즉시 업무로 확정하지 않고 수락, 중복 처리,
  보류, 담당 지정이 가능한 inbox lifecycle로 정규화한다.
- [Linear SLA](https://linear.app/docs/sla): priority와 시간 기반 SLA·임박도를 함께 우선순위 판단에 쓴다.
- [Sentry Issue Details](https://docs.sentry.dev/product/issues/issue-details/): 영향, 최초·최근 발생,
  근거, 소유자, 이슈 activity timeline을 한 상세 문맥에 결합한다.
- [Stripe Dashboard basics](https://docs.stripe.com/dashboard/basics): 요청·응답·관련 리소스와 안전한
  test 경계를 남긴다.
- [Stripe uncaptured payment review](https://docs.stripe.com/radar/reviews/auth-and-capture): 검토 승인과
  실제 외부 영향 실행을 분리한다.
- [Stripe refunds](https://docs.stripe.com/refunds): 요청을 즉시 완료로 단정하지 않고 후속 상태와,
  가능한 결제수단에서는 추적 reference를 제공하며 unavailable도 명시한다.
- [GitHub security insights](https://docs.github.com/en/code-security/how-tos/view-and-interpret-data/analyze-organization-data/viewing-security-insights):
  high-risk 대상, alert 상태, remediation progress를 filter·정렬한다. ReadMates는 이를 근거로 장식적
  KPI보다 실제 조치 대상을 먼저 둔다.
- [GitHub enterprise roles](https://docs.github.com/en/enterprise-cloud%40latest/admin/concepts/enterprise-fundamentals/roles-in-an-enterprise):
  관찰과 설정 변경을 최소권한으로 분리한다.
- [Shopify activity logs](https://help.shopify.com/en/manual/shopify-admin/activity-logs): 사람, 앱, 자동화를
  포함한 actor provenance를 구분하되 system/channel actor로 남을 수 있음을 표시하고, 동시 편집을 별도
  경고한다.
- [GOV.UK uptime and availability](https://www.gov.uk/service-manual/technology/uptime-and-availability-keeping-your-service-online):
  외부 의존성 장애에서도 최소 기능과 read-only fallback을 유지한다. ReadMates는 이 원칙을
  last-known-good source 보존으로 구체화한다.
- [GOV.UK error message](https://design-system.service.gov.uk/components/error-message/): 무엇이 잘못됐고
  어떻게 복구하는지를 구체적으로 말하며 form 입력값을 보존한다. ReadMates는 URL selection과 filter
  문맥까지 함께 보존한다.

이 리서치에서 도출한 공통 원칙은 다음과 같다.

> 플랫폼 어드민은 KPI 대시보드가 아니라 우선순위가 있는 case를 검토하고, 근거와 영향을 확인하고,
> 제한된 권한으로 안전한 작업을 수행한 뒤, 결과와 audit receipt를 남기는 작업대다.

## 5. 목표와 비목표

### 5.1 목표

1. 운영자가 `/admin/today` 첫 화면에서 가장 중요한 platform-wide 작업을 5초 안에 찾는다.
2. 모든 route가 동일한 page context, source freshness, search/filter, list/detail, action 문법을 사용한다.
3. 현재 존재하지만 도달할 수 없는 클럽 metadata, 공개 상태, domain 기능을 안전한 상세 flow에 연결한다.
4. 모든 범위 목록이 실제 search/filter/cursor를 제공하고 이전 page를 누적·dedupe한다.
5. loading, stale, partial, empty, filtered empty, 403, 409, partial execution, unknown outcome을 구분한다.
6. 위험한 운영 작업은 preview, reason, final confirm, version, idempotency, receipt, audit를 거친다.
7. platform admin과 club host 권한·작업 범위를 혼합하지 않는다.
8. desktop과 mobile 모두 조회, 판단, 실행, 결과 확인, 복구까지 완료할 수 있다.
9. ReadMates의 차분한 편집 브랜드를 유지하면서 cross-club 운영에 필요한 밀도와 즉시성을 제공한다.
10. 구현은 자동 테스트, 실제 브라우저, 시각·접근성, 독립 review evidence를 모두 충족한다.

### 5.2 비목표

- 범용 `/api/admin/execute`, action registry, 임의 command dispatch API
- club host의 모임, 회원, 출석, 기록, 알림 준비·게시 mutation을 platform admin에 복제
- AI가 운영 case를 자동으로 해결하거나 영향 있는 command를 사람 승인 없이 실행
- raw member content, email body, transcript, prompt, completion, provider raw error 노출
- generic CRM, helpdesk chat, comment thread, attachment 시스템
- 모든 값을 카드·pill·차트로 바꾸는 generic SaaS dashboard
- 실체 없는 KPI, 장식용 chart, 작동하지 않는 placeholder action
- receipt가 없는 무제한 bulk action 또는 서로 다른 원인의 묶음 실행
- 장기 이중 route, 별도 admin v2 앱, 전역 디자인 시스템 교체
- actual production deploy, 실제 이메일·알림 발송, billable AI provider smoke
- ADR-0037 긴급 public takedown을 다른 mutation에 섞어 조기 구현
- 현재 `OWNER`, `OPERATOR`, `SUPPORT` 역할 체계를 이번 UI 개편만으로 재정의

## 6. 선택한 제품 개념: Service Spine

선택한 구조는 **Service Spine**이다. 한국어 UI에서는 은유를 메뉴 이름으로 노출하지 않고 `플랫폼 운영`
또는 `운영`을 사용한다. Service Spine은 화면 장식이 아니라 다음 연결 구조를 뜻한다.

```text
플랫폼 신호
  → 우선순위 운영 case
    → 원천 evidence와 영향 범위
      → 도메인별 안전 command
        → immutable receipt와 audit
          → 후속 재검증 또는 재개방
```

검토한 대안은 다음과 같다.

| 대안 | 장점 | 선택하지 않은 이유 |
| --- | --- | --- |
| SaaS monitoring dashboard | 시스템 상태를 빠르게 요약 | metric card와 chart가 개별 case 판단·조치를 밀어낸다. |
| 역할별 독립 desk | 역할 경계가 강함 | route마다 다시 분절되고 platform-wide 우선순위가 약해진다. |
| Evidence docket | 위험 작업의 근거를 잘 보여줌 | 전체 IA보다 상세 panel pattern에 적합하다. |
| Service Spine | 신호부터 후속 확인까지 연결 | 공통 문법을 유지하면서 도메인 소유권을 분리할 수 있다. |

Service Spine은 역할별 독립 desk의 권한 분리와 Evidence docket의 근거·receipt 구조를 필수 계약으로
흡수한다.

## 7. 시각·콘텐츠 방향

ADR-0020의 하나의 브랜드 시스템과 역할별 composition grammar를 적용한다. Platform admin은
`cross-club system command ledger`다.

### 7.1 유지할 시각 문법

- warm paper canvas, cream surface, 짙은 ink hierarchy, 절제된 ink-blue accent
- 위험·실패에만 제한적으로 쓰는 둔한 적갈색과 텍스트 label
- page title에는 editorial identity, 운영 label·숫자·action에는 읽기 쉬운 sans hierarchy
- 중첩 card와 큰 shadow 대신 1px 선, surface 명도, 여백, ledger row
- 비교 가능한 수치에만 tabular numeral
- 긴 콘텐츠와 한국어·영어 provider 이름이 잘려도 의미가 보존되는 wrapping

### 7.2 금지할 시각 패턴

- gradient hero, glow, glassmorphism, dark command-center theme
- literal paper roll, 서류철, stamp 같은 스큐어모피즘
- 모든 값을 pill로 감싸는 badge wall
- 같은 비중의 metric card가 첫 화면을 점유하는 구조
- 색만으로 severity, state, availability를 전달하는 표현
- 큰 빈 장식 영역, hero image, 움직임 자체가 목적인 animation

### 7.3 카피

- UI group과 action은 한국어를 우선한다. provider·model·protocol 고유명만 원문을 병기한다.
- 오류는 `무엇이 확인되지 않았는지 · 현재 영향 · 다음 행동` 순서로 쓴다.
- `처리 중 오류`처럼 실행 여부를 모호하게 쓰지 않는다.
- `실패한 3건만 다시 시도`, `결과를 확인할 수 없어 영수증을 조회합니다`처럼 대상과 다음 행동을
  구체적으로 쓴다.
- destructive action은 결과를 중립적으로 설명하고 공포성 경고나 과도한 사과를 쓰지 않는다.

## 8. 정보 구조

### 8.1 네 개의 primary area

| Primary area | 포함 route | 운영 질문 |
| --- | --- | --- |
| 오늘 | `/admin/today` | 지금 무엇을 먼저 판단하고 처리해야 하는가? |
| 클럽 | `/admin/clubs`, `/admin/clubs/:clubId` | 어떤 클럽이 준비되지 않았고 어떤 설정·공개·domain 조치가 필요한가? |
| 서비스 | `/admin/health`, `/admin/notifications`, `/admin/ai-ops` | 플랫폼 서비스와 provider 작업은 정상이며 실패를 어떻게 복구하는가? |
| 검토 | `/admin/support`, `/admin/audit`, `/admin/analytics` | 누가 어떤 권한으로 무엇을 실행했고 운영 추세는 어떤가? |

사이드바는 네 primary area만 같은 위계로 보여준다. `서비스`와 `검토`는 확장된 하위 메뉴에서 기존
route로 이동한다. 기존 URL과 deep link는 유지한다. create와 detail은 primary tab이 아니라 해당
resource 아래 nested flow다.

### 8.2 navigation behavior

- 넓은 화면: 이름이 보이는 고정 navigation과 현재 하위 route
- 중간 화면: 축소 가능한 navigation이되 아이콘만으로 의미를 전달하지 않음
- 모바일: 이름 있는 menu sheet → route list → detail로 이동
- 현재 위치는 text weight, left rule 또는 surface, `aria-current`를 함께 사용
- shell의 club 검색은 모든 클럽을 선행 로드하지 않고 server search 결과만 사용
- 전역 `새 클럽`은 제거하고 `/admin/clubs`의 capability-aware contextual action으로 둔다.

### 8.3 signal, case, source의 관계

- **Signal**은 health, notification, AI, club readiness 같은 원천이 관측한 사실이다.
- **Operation case**는 사람이 triage하고 소유·보류·해결·재개방하는 지속 가능한 작업 단위다.
- **Source record**는 event, delivery, job, club, metric, grant, audit처럼 상세 route에서 보는 원천 사실이다.

조치 가능한 signal만 operation case가 된다. raw entity와 evidence를 case table로 복제하지 않는다.
Case는 source identity와 안전한 summary를 참조하고, detail route는 최신 원천을 다시 조회한다.

## 9. 공통 page grammar

모든 route는 필요한 부분만 다음 순서로 조합한다.

### 9.1 Page context

- primary area, route title, scope, 짧은 현재 상태 문장
- contextual primary action 한 개 이하
- 현재 platform role과 capability 변화를 설명하는 읽기 전용 상태
- 선택한 club이나 case가 있으면 breadcrumb와 URL에 반영

### 9.2 Source freshness strip

- source별 `FRESH`, `REFRESHING`, `STALE`, `UNAVAILABLE`
- generated time, last successful time, stale age
- background refresh 동안 last-known-good 유지
- partial failure 때 정상 source를 제거하지 않고 실패 범위와 영향만 표시
- client fetching spinner가 server freshness를 대신하지 않음

### 9.3 Work views, search, filters

- 업무 목적이 명확한 saved view는 고정된 filter alias로 제공
- route contract가 share-safe로 allowlist한 비민감 search/filter/sort/scope, selected record, detail tab만
  URL로 복원 가능
- 적용된 filter 수와 reset 제공
- true empty와 filtered empty의 설명·다음 행동 분리
- filter menu는 keyboard 이동, Escape close, trigger focus restore 지원

### 9.4 Queue/list와 inspector

- desktop: 비교 가능한 queue 또는 ledger와 지속적인 inspector
- medium: list 위에 detail을 압축하지 않고 필요하면 selection-based drill-in
- mobile: list → detail → action review → confirm → receipt의 완전한 단계 이동
- row는 제목, state, source, impact, age, owner 중 현재 업무에 필요한 최소 정보를 제공
- inspector는 summary → impact → evidence → history → capability → next action 순서
- 선택은 opaque stable ID로 추적하며 화면상의 짧은 순번은 영구 ID가 아님

### 9.5 Action dock

- 현재 capability와 대상 state에서 가능한 action만 설명과 함께 제공
- 권한이 없을 때 단순히 숨겨 우회시키지 않고 read-only 이유를 전달
- 위험 action은 inline one-click으로 실행하지 않음
- pending 중 duplicate click을 막고 navigation 전 receipt reconciliation 여부를 명시
- 완료 후 toast만 남기지 않고 durable receipt summary와 audit link 제공

## 10. route별 목표 기능

### 10.1 `/admin/today` — 플랫폼 우선순위 큐

- 전체 source의 actionable signal을 지속 가능한 case로 정규화한다.
- 기본 정렬은 severity, SLA/age, reopen, impact의 서버 정책을 따른다.
- work view는 `처리 필요`, `내가 확인`, `보류`, `오늘 해결`처럼 고정 filter alias로 제공한다.
- queue에서 source, scope, impact, age, assignee, state를 비교한다.
- inspector에서 근거와 history를 읽고 acknowledge, snooze, resolve 또는 source detail로 이동한다.
- resolve는 source가 실제로 사라졌거나 검증 가능한 receipt가 있을 때만 허용한다.
- background reconciliation이 selection과 scroll을 흔들지 않는다.
- resolve dialog는 초기 focus, focus trap, Escape, trigger restore를 갖는다.
- 601–768px도 두 column을 억지로 쌓지 않고 명시적 drill-in을 사용한다.

### 10.2 `/admin/clubs` — registry와 onboarding

- server-owned search, filter, sort, opaque cursor를 제공하며 100개 hard cap을 제거한다.
- shell과 route는 전체 club list를 선행 로드하지 않는다.
- default view는 readiness, public visibility, domain action, first-host onboarding 신호로 triage한다.
- desktop은 고밀도 비교 ledger, mobile은 label-value record와 detail 진입을 사용한다.
- `새 클럽`은 capability-aware contextual action이다.
- onboarding은 입력 → server validation/preview → 영향·초대 대상·domain 상태 확인 → confirm → receipt로 구성한다.
- onboarding 실패는 이미 생성된 club, 초대 발송 여부, 재개 가능한 단계와 안전한 reference를 구분한다.

### 10.3 `/admin/clubs/:clubId` — 완전한 club control surface

현재 숨은 component와 API를 실제 route에서 도달 가능하게 연결한다.

- Overview: identity, status, public visibility, readiness, host onboarding, current risk
- Profile: name, tagline, about 등 platform-owned metadata와 read-only identity인 slug
- Publication: 공개 상태와 안전 조건. 일반 host publication workflow를 대신하지 않음
- Domains: desired/current state, provider-safe 상태, manual action, recheck
- Operations: member/session/notification/AI/closing-risk aggregate와 source drill
- Support: active grant count와 support workbench deep link
- Activity: 관련 operation case, command receipt, audit deep link

각 section query는 독립 error boundary를 가져 보조 source 하나의 실패로 전체 route가 blank 되지 않는다.
Metadata edit는 최신 version을 재검증하고, 공개·domain처럼 영향이 큰 action은 safe-command protocol을 따른다.
Detail identity와 기본 profile은 paged registry에서 `find`하지 않고 `GET /api/admin/clubs/{clubId}` 또는
동등한 authoritative by-ID query로 조회한다. Registry page에 대상이 없어도 deep link가 동작해야 한다.
Slug mutation은 이번 범위에 포함하지 않는다. 향후 slug를 바꾸려면 ADR-0019의 canonical URL, public·host
deep link, redirect와 cache migration을 다루는 별도 cross-surface 결정이 필요하다.

### 10.4 `/admin/health` — 서비스 건강과 사건 근거

- health, dependency, backlog, deploy 상태를 source freshness와 함께 보여준다.
- 카드 자체가 목적이 아니라 threshold, current value, last normal, affected service, evidence와 관련 case를 연결한다.
- 정상·0건 상태는 compact하게 줄이고 경고·실패에 evidence density를 집중한다.
- provider-local failure를 전체 snapshot 실패로 합치지 않는다.
- mutation은 제공하지 않고 notification, AI, case detail로 안전하게 drill한다.
- `사건`, `Platform Health` 같은 naming 혼용을 없애고 `서비스 건강`으로 통일한다.

### 10.5 `/admin/notifications` — 실패 복구 workbench

- operations snapshot, failure cluster, outbox event, delivery ledger를 구분한다.
- club, event state, delivery state, channel, time filter와 cursor 누적을 실제 UI로 제공한다.
- replay preview의 warning, status별 예상 대상, 제외 대상, limit, snapshot time을 숨기지 않는다.
- confirm 결과의 `replayedCount`, `skippedCount`, 대상별 outcome, receipt를 보존한다.
- 전체 실패를 다시 보내는 것이 아니라 preview가 고정한 eligible failed target만 실행한다.
- partial과 unknown outcome을 지원하며 같은 idempotency key로 receipt를 조회한다.
- Replay confirm의 origin outbox mutation과 이후 실제 delivery convergence를 구분한다. Confirm 성공을
  전달 완료로 표현하지 않고 같은 receipt/workflow identity에 delivery attempt와 결과를 연결한다.
- 실제 이메일·알림 전송 smoke는 별도 승인 없이 자동 검증하지 않는다.

### 10.6 `/admin/ai-ops` — content-free AI execution ledger

- 7/30/90일 비용·실패·latency summary와 availability를 분리한다.
- club, status, safe error code, provider/model, time filter와 cursor 누적을 제공한다.
- loading/unavailable/empty/zero를 다른 상태로 표현한다.
- job detail은 content-free metadata, attempts, current lease/state, safe error, 비용 basis, receipt·audit만 보여준다.
- raw transcript, prompt, completion, evidence, provider raw error를 노출하지 않는다.
- force cancel, retry commit 등 영향 작업은 preview, reason, expected state/version, idempotency, receipt를 거친다.
- action pending, queued, running, partial, failed, unknown을 명시하고 immediate one-click mutation을 제거한다.
- AI는 case 분류·담당 제안을 할 수 있으나 운영자 승인 없이 case를 해결하거나 command를 실행하지 않는다.

### 10.7 `/admin/support` — 최소권한 access workbench

- subject search에는 visible label, safe identity, club scope, eligibility와 risk를 제공한다.
- 이름·이메일 free-text, user UUID subject identity, reason, preview ID는 URL, browser history,
  local/session storage에 넣지 않고 in-memory ephemeral state로 유지한다. Shareable support reference가 꼭
  필요하면 민감 target을 encode하지 않은 짧은 TTL의 capability-gated opaque reference를 별도 설계한다.
- grant create는 scope, expiry, reason category, bounded note, 영향을 preview한 뒤 confirm한다.
- revoke도 create와 동일한 capability projection, reason, confirm, receipt를 사용한다.
- read query error, validation error, mutation error를 분리해 기존 입력을 보존한다.
- active, expiring, expired, revoked grant를 구분하고 cursor가 필요하면 누적한다.
- frontend button과 server authorization은 같은 server capability projection에서 파생한다.
- support 접근은 club host membership이나 일반 member 권한으로 변환되지 않는다.

### 10.8 `/admin/audit` — 통합 evidence ledger

Audit union은 최소한 다음 사건을 포함한다.

- operation case create, acknowledge, snooze, resolve, reopen
- club onboarding, metadata, visibility, domain command
- notification replay preview/confirm과 대상별 결과
- AI admin action과 execution round 결과
- support grant create, expire, revoke
- ADR-0037 emergency takedown과 convergence attempt는 구현 후 별도 source로 연결

필터는 time, club, actor, target, source, category, action, outcome을 지원한다. Load more는 page를 교체하지 않고
누적·dedupe한다. Row와 inspector는 actor type/ID의 safe display, target type/ID, reason category,
before/after state code, receipt, occurred time, correlation reference를 보여준다. 삭제 가능한 content나 raw
provider error를 audit payload에 복제하지 않는다.

Filter는 각 source query에 page limit 적용 전 push down해 오래된 matching event를 누락하지 않는다.
Opaque cursor는 snapshot upper bound와 source별 continuation을 담고, 전체 merge는
`occurredAt DESC → source rank → immutable event ID DESC`의 stable total order를 사용한다. 다음 page는
동일 top page를 반복하지 않고 `(sourceType, eventId)`로 누적·dedupe한다. 일부 source가 실패하면 정상
source cursor와 실패 source 상태를 함께 보존하며 재시도 때문에 이미 본 event의 순서가 바뀌지 않는다.

### 10.9 `/admin/analytics` — 운영 의사결정과 검증

- KPI는 정의, 기간, availability, source freshness, 비교 기준을 함께 제공한다.
- active members, session completion, RSVP, AI cost/session, notification delivery 등 현재 metric을 유지한다.
- chart는 추세나 비교 결정을 돕는 경우만 사용하고 metric card wall을 만들지 않는다.
- aggregate에서 관련 club, notification, AI route로 drill한다.
- 화면에 표시한 benchmark field와 CSV column·값·기간·availability가 정확히 일치한다.
- unavailable은 0으로 export하지 않고 명시적 unavailable/blank contract를 사용한다.
- high-cardinality identifier를 metric tag로 추가하지 않는다.

## 11. 위험 작업 safe-command protocol

### 11.1 안전 등급

모든 action에 같은 확인 절차를 강제하지 않는다. 영향과 복구 난이도에 따라 다음 등급을 적용한다.

| 등급 | 대상 | 필수 계약 |
| --- | --- | --- |
| L1 — 가역적 lifecycle·derived refresh | case acknowledge/snooze/resolve, domain 상태 recheck | capability, domain-appropriate concurrency guard, 필요한 source 재검증, atomic history |
| L2 — 권한·공개·대상 변경 | support grant, club onboarding의 DB 변경, public visibility, domain create | durable preview, impact·exclusion, final confirm, idempotency receipt, immutable audit |
| L3 — provider·cross-store effect | AI recovery, email/notification replay, public convergence | L2 + origin mutation receipt, outbox/convergence attempt ledger, 같은 receipt 기반 resume |

L1을 가볍게 유지하는 것은 one-click을 허용한다는 뜻이 아니다. 의미가 명확한 action과 optimistic
conflict, 원자적 event history가 필요하며 global audit에서 조회 가능해야 한다. Destructive하거나
사용자·공개 상태에 영향이 있는 command는 L2 이상이다.
한 command가 여러 effect를 가지면 가장 높은 등급을 적용한다. 예를 들어 onboarding의 club·host DB
변경은 L2지만 commit 이후 invitation email 전달까지 포함한 전체 workflow는 L3 convergence를 갖는다.

### 11.2 L2·L3 공통 단계

```text
대상 선택
  → preview 요청
    → 영향·제외·비용·되돌림·최신 version 검토
      → reason 입력
        → 최종 confirm
          → queued/running/succeeded/partial/failed/unknown
            → receipt와 audit
              → source 재검증 또는 후속 case
```

### 11.3 preview contract

Preview는 최소한 다음 안전한 정보를 반환한다.

- `previewId`, `commandType`, `expiresAt`
- actor capability snapshot과 target identity snapshot
- current state와 version·lease·monotonic observation token 중 도메인에 맞는 concurrency token
- 해당 command에 의미 있는 영향 대상 또는 safe before/after 요약
- 적용 가능한 제외 대상·이유와 warning. 의미 없는 0 count는 만들지 않음
- 비동기 여부, 비용 또는 외부 영향 가능성
- 되돌림 가능 여부와 가능한 복구 경로
- confirm 전에 다시 확인해야 하는 invariant

Preview는 실행하지 않는다. Preview 응답이나 audit에 private content를 넣지 않는다.

### 11.4 confirm contract

Confirm은 `previewId`, `idempotencyKey`, domain concurrency token과 policy상 필요한 reason category·bounded
note를 받는다. 정상 action에 의미 없는 boilerplate reason을 강제하지 않는다.
Application service는 다음을 다시 검사한다.

1. actor가 active platform admin인가
2. 해당 domain capability가 현재도 유효한가
3. preview가 만료·소비되지 않았는가
4. target identity와 scope가 같은가
5. concurrency token과 state가 preview와 같은가
6. canonical request hash가 같은가

Idempotency scope는 최소
`(platformAdminUserId, commandType, targetIdentity, idempotencyKey)`다. 같은 key와 같은 canonical
request는 저장된 receipt를 반환하고 같은 key의 다른 request는 conflict로 거절한다. Response loss 뒤
재시도는 새 mutation, 새 audit receipt, 새 provider effect를 만들지 않는다.

Canonical request identity는 ADR-0028의 versioned canonical HMAC 정책을 재사용한다. Validation과
default 적용 뒤 operation별 schema가 Unicode, field/collection order, null·omitted·default 의미를
고정한다. Raw payload나 평문 SHA digest를 저장하지 않고 server secret-keyed HMAC digest, schema version,
digest key version만 저장한다.

Response-loss 재호출에서는 matching completed receipt 조회를 preview expired/consumed 거절보다 먼저
수행한다. Receipt 조회도 현재 active platform admin과 read capability를 다시 확인하며 권한을 잃은 actor에게
sensitive metadata를 반환하지 않는다. Preview와 idempotency ownership row는 bounded retention으로
정리하되 immutable receipt는 삭제 가능한 target에 destructive FK를 두지 않고 redacted ID snapshot을
보존한다.

도메인 application service가 transaction boundary를 소유한다. mutation과 immutable receipt는 같은
transaction에서 결속한다. Provider 호출처럼 transaction 밖에서 수렴하는 작업은 같은 receipt 또는
convergence identity에 append-only attempt를 남긴다.

### 11.5 결과 상태와 복구

- `QUEUED`: 접수됐으며 아직 시작 전
- `RUNNING`: 실행 중이며 duplicate confirm 금지
- `SUCCEEDED`: 모든 확정 대상 성공
- `PARTIAL`: 일부 대상 성공. 대상별 outcome과 retry eligibility 제공
- `FAILED`: domain mutation이 적용되지 않았거나 실패가 확정됨
- `UNKNOWN`: client가 결과를 확인할 수 없음. 같은 command를 새 key로 다시 실행하지 않고 receipt 조회

`409`는 최신 preview를 다시 확인해야 하는 conflict다. `403`은 capability loss로 fail closed한다.
Validation failure는 입력을 보존하고 잘못된 field와 수정 방법을 제시한다. Transport timeout은 실패로
단정하지 않고 `UNKNOWN` reconciliation으로 전환한다.

### 11.6 소유권

- notification, AI, support, club, emergency takedown은 각 도메인 endpoint와 application service를 유지한다.
- 범용 admin executor나 string action dispatch를 만들지 않는다.
- 공통 value object, UI grammar, error envelope, receipt link 형식은 공유할 수 있다.
- 각 도메인은 eligibility, transaction, retry, redaction 규칙을 직접 소유한다.

## 12. 권한·보안·개인정보 경계

- `OWNER`, `OPERATOR`, `SUPPORT`는 기존 platform admin role이다. 이 설계만으로 새 role을 만들지 않는다.
- UI capability는 server가 반환하는 권한 projection에서 파생하고 server가 confirm 때 다시 검사한다.
- 숨겨진 버튼은 authorization이 아니다. Direct URL과 직접 API 요청도 같은 계약으로 거절한다.
- platform admin 권한과 club membership/host 권한은 독립이다.
- mutating BFF request는 ADR-0029의 BFF secret과 Origin/Referer 검증을 함께 적용한다.
- Browser mutation은 same-origin BFF만 사용한다. BFF는 path를 정규화하고 browser가 주입한 내부
  header를 폐기한 뒤 server-only secret과 canonical Origin/Referer를 붙인다.
- Spring은 secret, allowlisted origin, active platform admin, command capability를 독립적으로 다시 확인한다.
  BFF trust 검증 뒤 exact method/path만 CSRF 예외로 등록하고 near-miss는 계속 보호한다.
  `ROLE_PLATFORM_ADMIN`은 route gate이지 command authority가 아니다.
- browser bundle, HTML, log, docs에 BFF secret이나 private environment 값을 노출하지 않는다.
- public-safe DTO만 사용한다. raw email, meeting URL/passcode, transcript, prompt/result, provider raw error,
  삭제 가능한 private content를 admin receipt/audit에 저장하지 않는다.
- reason note는 bounded, redacted, 보존 기간이 명확해야 하며 secret·private content 입력을 유도하지 않는다.
- capability 상실 때 sensitive query cache, selected target, preview와 pending form을 폐기한다.
- emergency public takedown은 ADR-0037의 별도 capability와 receipt/convergence 계약을 따른다.

Authoritative projection은 same-origin `GET /api/bff/api/admin/capabilities`가 proxy하는
`GET /api/admin/capabilities`의 additive DTO로 제공한다.

```json
{
  "schemaVersion": 1,
  "role": "OPERATOR",
  "status": "ACTIVE",
  "capabilities": ["VIEW_TODAY", "VIEW_CLUBS"],
  "generatedAt": "2026-08-22T00:00:00Z"
}
```

Capability는 server allowlist enum이며 route view와 domain command를 분리한다. 실제 목록은 현재 기능과
새 typed command를 기준으로 contract test에서 고정하고 frontend local role matrix에서 추론하지 않는다.
Projection 응답은 `no-store`이며 shell loader와 auth refresh에서 다시 읽는다. 어떤 admin query나 command가
401/403을 반환하면 projection을 재조회하고 sensitive query cache, selected private target, preview와 pending
form을 즉시 폐기한다. Projection은 UI 설명용이며 confirm 시 server의 active actor·capability 재검사를
대체하지 않는다.

## 13. 상태·오류·복구 문법

| 상태 | 화면 계약 | 금지 |
| --- | --- | --- |
| Initial loading | 데이터가 전혀 없을 때만 skeleton과 `role=status` | 0이나 empty를 loading으로 표시 |
| Background refresh | last-known-good 유지, source와 갱신 중 상태 표시 | 전체 화면 blank, selection 초기화 |
| Fresh | server generated/last-success time 표시 | client fetch time을 source freshness로 사용 |
| Stale | 마지막 정상 데이터, stale age, 영향, retry 제공 | 정상인 것처럼 색만 유지 |
| Partial failure | 정상 source 보존, 실패 범위와 재시도 분리 | 하나의 보조 query 때문에 route 전체 실패 |
| True empty | 데이터가 실제로 없음과 가능한 첫 행동 | filter empty와 같은 문구 |
| Filtered empty | 현재 filter 결과 없음, reset 제공 | 원천 데이터가 없다고 단정 |
| 403 | capability 상실, read-only 또는 안전한 이탈 | 버튼만 숨기고 stale data 유지 |
| 409 | 최신 version과 바뀐 영향 재검토 | 강제 덮어쓰기 |
| Partial execution | 대상별 outcome, skipped, retry eligibility | 전체 성공 toast |
| Unknown outcome | idempotency key로 receipt 재조정 | 새 key로 blind retry |
| Invalid cursor | filter 문맥 유지, 첫 page로 명시적 복구 | silently empty 처리 |

Long content, timezone, locale, network offline/slow, duplicated click, browser back/forward, expired preview,
late query response, permission change 중 selection을 각 route의 characterization fixture에 포함한다.

## 14. frontend architecture와 데이터 흐름

### 14.1 route-first 경계

- `front/src/app/routes/admin.tsx`가 기존 URL과 lazy route ownership을 유지한다.
- feature route가 loader, query, URL state, capability projection, view model을 소유한다.
- shared page grammar component는 fetch, 권한 판단, domain mutation을 수행하지 않는다.
- Zod/runtime contract와 TypeScript type이 server DTO의 additive 변경을 검증한다.
- 전역 admin mega-store를 만들지 않는다.

### 14.2 URL state

- Route별 allowlist에 등록한 비민감 search/filter/sort/scope와 public-safe selected
  `caseId|clubId|recordId`, detail tab만 URL에 표현한다.
- Support의 이름·이메일 검색어, user UUID, reason, preview처럼 민감하거나 저엔트로피인 값은 URL,
  Referer, browser history, telemetry, persistent web storage에 넣지 않는다.
- 기존 route가 URL cursor를 지원하면 parse·restore하되, `더 보기`는 이전 item에 append·dedupe한다.
- back/forward는 selection, filters, scroll recovery key를 보존한다.
- modal-only state는 shareable해야 할 때 nested route 또는 query state로 승격한다.

### 14.3 query와 last-known-good

- source별 query key와 error boundary를 분리한다.
- merge는 opaque ID와 server version을 기준으로 높은 version을 보존한다.
- background data가 현재 snapshot 순서를 바꾸면 `새 항목` notice를 제공하고 operator가 반영 시점을 선택한다.
- permission loss는 last-known-good 보존의 예외다. sensitive data와 pending command를 즉시 폐기한다.
- Legacy 또는 잘못된 URL에 민감 support parameter가 있으면 route loader가 사용하지 않고 `replace`로
  제거한다. Navigation과 authority loss 때 ephemeral support search/target/preview도 폐기한다.
- shell club search는 paged server lookup이며 전체 club registry query와 결합하지 않는다.

### 14.4 BFF

- browser는 same-origin `/api/bff/**`를 사용한다.
- BFF는 typed domain endpoint를 proxy하고 secret, cookie, origin boundary를 소유한다.
- BFF가 business eligibility, lifecycle, version conflict를 재구현하지 않는다.
- server의 safe error code와 receipt reference를 손실 없이 전달한다.

## 15. server architecture와 필요한 계약 확장

기존 clean architecture slice를 유지한다.

- `admin.operations`: signal reconciliation, case lifecycle, source freshness
- `club`: registry, onboarding, metadata, visibility, domain, club operations snapshot
- `admin.health`: read-only health snapshot과 provider-local failure
- `notification`: operations read, replay eligibility와 transaction
- `aigen`: content-free job operations와 admin action audit
- `support`: search와 grant lifecycle
- `admin.audit`: 여러 immutable source의 read union
- `admin.analytics`: aggregate read model과 export

필요한 확장은 다음과 같다.

1. Club registry에 server search/filter/sort/opaque cursor를 추가하고 legacy 100개 hard cap 소비를 제거한다.
2. Club detail identity를 authoritative by-ID query로 제공하고 보조 source를 독립 query 또는 partial
   response로 제공해 registry pagination과 하나의 source failure를 격리한다.
3. Notification UI가 이미 존재하는 cursor, warning, status summary, `skippedCount`를 모두 소비한다.
4. AI job list에 status/cursor와 명확한 unavailable contract를 제공한다.
5. AI와 support 위험 action에 preview, version/state, reason, idempotency, receipt를 추가한다.
6. Audit union에 operation case events, AI admin actions, domain command receipt를 추가한다.
7. Audit filter가 club, actor, target, source, category, action, outcome을 server에서 수행한다.
8. Analytics CSV가 화면 benchmark와 같은 source/definition/availability를 사용한다.
9. Partial/unknown execution round와 receipt lookup을 domain별로 제공한다.
10. Authoritative `/api/admin/capabilities` projection과 Zod contract를 추가하고 local role-derived action
    matrix를 제거한다.
11. AI mutation의 누락된 exact CSRF exemption을 RED security-chain test로 먼저 재현한 뒤, BFF 정상 요청,
    missing secret/origin/role/capability 거절과 near-miss 보호를 유지하는 최소 matcher를 GREEN으로 추가한다.
12. Support의 민감 reason과 user identity projection을 별도 capability와 최소 표시값으로 제한한다.
13. Audit filter를 각 source query에 push down하고 source-aware snapshot cursor와 stable merge order를
    구현한다.

Migration과 endpoint는 additive를 우선한다. 기존 consumer를 제거하거나 response 의미를 바꾸기 전에
characterization과 contract compatibility evidence를 갖춘다. 새 write model은 application service가
transaction을 소유하며 web controller나 BFF가 repository를 직접 조정하지 않는다.

## 16. responsive·접근성 계약

### 16.1 viewport composition

- `1440px`: full navigation, queue/list와 inspector 병렬, 충분한 evidence density
- `1024px`·`900px`: 축소 navigation, content 우선, inspector 너비가 본문을 압박하면 drill-in 전환
- `768px`: tablet에서 실제 task flow를 기준으로 병렬 또는 drill-in을 명시적으로 선택
- `390px`·`320px`: menu sheet → list → detail → action. L2/L3 action은 impact review → confirm → receipt
- `200% zoom`: 가로 scroll 없이 주요 읽기·실행 흐름 완료. 데이터 표는 의미 있는 record composition 또는
  명시적 table scroll과 row label을 사용

### 16.2 keyboard와 assistive technology

- 모든 action과 row selection을 keyboard로 수행
- Modal dialog/sheet는 목적에 맞는 initial focus, focus trap, Escape, background inert, scroll lock,
  trigger focus restore를 제공
- 비모달 menu는 focus trap을 사용하지 않고 roving focus 또는 동등한 arrow/Home/End navigation,
  Escape·outside close와 trigger focus restore를 제공
- selected row와 current route에 `aria-selected`·`aria-current` 또는 동등 semantics
- loading은 status, blocking failure는 alert, field error는 field association
- visible label과 accessible name 일치
- target size는 최소 44×44px를 원칙으로 하며 compact table control도 equivalent hit area 제공
- focus가 sticky header, bottom dock, sheet에 가려지지 않음
- 400% text resize 또는 200% browser zoom에서 content와 action 손실 없음
- reduced motion에서 essential하지 않은 transition 제거

### 16.3 mobile completion

모바일에서 단지 내용이 보이는 것만으로 통과하지 않는다. 각 route의 primary task가 끝나야 한다.

- Today: filter → case → evidence → lifecycle action
- Clubs: search → record → detail section → preview 가능한 contextual action
- Services: failure record → evidence → safe recovery → receipt
- Review: subject/event search → detail → grant/action receipt 또는 export

Bottom action dock은 `env(safe-area-inset-bottom)`을 포함하고 마지막 field·오류·focus target을 가리지 않는다.
Virtual keyboard가 열린 320px/390px viewport에서도 reason 입력, impact review, confirm과 취소에 도달할 수
있어야 한다. Modal sheet는 background를 inert 처리하고 body scroll을 잠그되 sheet 내부 긴 콘텐츠는
scroll 가능해야 하며 keyboard close나 viewport resize 뒤 action 위치를 잃지 않는다.

## 17. 구현 프로그램과 단계별 gate

### Phase 0. Characterization과 계약 고정

- 현재 아홉 route, API, role, auth, cursor, empty/error behavior를 테스트로 기록한다.
- unreachable component와 현재 endpoint를 inventory한다.
- 기존 URL, deep link, case lifecycle, notification atomic replay를 회귀 기준으로 고정한다.
- AI force-cancel·retry BFF POST가 현재 security chain에서 403인 결함을 failing integration test로 고정한다.
- Audit cursor가 같은 top page를 반복하고 post-filter가 오래된 matching event를 누락하는 현상을 failing
  integration test로 고정한다.
- ADR-0039와 ADR-0040은 `Proposed`로 유지한다.

통과 조건: 구현 전 regression boundary와 red test 목록이 route matrix에 존재한다.

### Phase 1. Service Spine foundation

- 네 primary area와 nested navigation
- shared page context, freshness strip, work view/filter, queue/inspector, state boundary, action dock
- shell club search 분리와 capability projection
- desktop/tablet/mobile composition과 focus foundation

통과 조건: 모든 route가 새 shell에서 접근 가능하고 기존 URL·권한·deep link가 보존된다.

### Phase 2. Club registry와 상세 기능 완결

- server search/cursor와 mobile record
- onboarding preview/confirm/receipt
- metadata, public visibility, domain, operations, support, activity를 실제 detail route에 연결
- section-local partial failure

통과 조건: 현재 숨은 관리 기능이 unreachable하지 않고 SUPPORT에게 허용되지 않은 CTA가 노출되지 않는다.

### Phase 3. Service workbenches와 safe command

- health의 case/evidence 연결
- notification cursor/filter/warning/skipped/receipt
- AI cursor/status/unavailable와 safe action
- AI exact CSRF matcher 보정과 BFF mutation origin/security parity

통과 조건: notification·AI 위험 작업이 preview 없이 실행되지 않고 partial/unknown을 재조정한다.

### Phase 4. Review surfaces

- support revoke와 capability parity
- audit union, filter, append cursor, actor/target/receipt
- analytics availability와 CSV parity

통과 조건: 모든 위험 command가 audit에서 추적되고 화면과 export가 같은 사실을 표현한다.

### Phase 5. 품질 closeout과 점진 활성화

- route × state × viewport × role matrix 회귀
- 실제 브라우저 시각·keyboard·screen-reader semantics 검토
- 독립 서브에이전트 code/design review와 발견 사항 수정
- read-only fallback, migration compatibility, release readiness와 public safety

통과 조건: 섹션 18의 전체 수용 기준과 canonical check가 증거와 함께 통과한다.

### Phase 6. ADR-0037 별도 capability

Emergency public takedown은 앞 단계와 별도 구현 계획, migration, incident runbook, preview/receipt,
provider convergence evidence를 가진다. 다른 admin mutation의 완료를 이유로 자동 활성화하지 않는다.

## 18. 검증 전략과 수용 기준

### 18.1 TDD와 contract evidence

각 수직 slice는 다음 순서를 따른다.

1. 현재 behavior characterization
2. 누락된 capability·state·contract의 실패 테스트
3. 최소 구현
4. unit·component·contract·integration·E2E green
5. 실제 브라우저와 accessibility QA
6. 독립 review와 발견 사항 수정

Compilation이나 happy-path test 하나만으로 완료하지 않는다.

### 18.2 canonical commands

Frontend 변경:

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

Auth/BFF 또는 end-to-end 변경:

```bash
corepack pnpm --dir front test:e2e
```

Server PR-level과 full integration:

```bash
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
```

Public release 범위일 때만:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

실제 AI provider 호출, 이메일·알림 발송, 실사용자 grant 변경은 별도 승인 없는 자동 smoke에서 제외한다.
Fixture, fake provider, contract, transaction, sandbox evidence로 자동 gate를 구성한다.

### 18.3 route matrix

모든 아홉 route가 공통으로 증명할 항목:

- 첫 진입, loader, refresh, shareable URL restore, browser back/forward
- initial loading, fresh/stale/unavailable과 route를 구성하는 source의 partial failure
- true empty와 해당 route에 filter가 있으면 filtered empty
- long content, slow/offline transport, permission loss와 safe recovery
- URL·history·Referer·telemetry에 support 검색어, user UUID, reason, preview가 남지 않는 privacy check
- OWNER, OPERATOR, SUPPORT, inactive actor의 view/capability 경계
- 1440, 1024, 900, 768, 390, 320px와 200% zoom
- keyboard-only, focus order/restore, reduced motion, status/alert semantics

목록 route에 적용할 항목:

- large result, next cursor 없음/있음/invalid, append·dedupe, selection 보존
- Clubs는 registry page 밖의 club by-ID deep link
- Audit는 source-aware stable cursor, filter push-down, partial source continuation

Mutation route에 안전 등급별로 적용할 항목:

- 공통: 403, validation, duplicate click, navigation이 mutation을 실행하지 않음
- L1: concurrency conflict와 atomic history
- L2/L3: preview expiry/consumption, 409, idempotency, receipt, response-loss unknown outcome
- L3: origin success/provider failure, partial outcome, 같은 convergence identity resume

`/admin/health`와 `/admin/analytics` 같은 read-only route에 409, unknown command outcome, 인공 cursor UI를
만들지 않는다. Analytics export와 Health drill처럼 실제 기능에 해당하는 상태만 검증한다.

### 18.4 최종 product-level 수용 기준

- [ ] 네 primary area와 nested flow가 기존 아홉 URL을 정직하게 표현한다.
- [ ] 모든 route가 page context, freshness, filter, list/detail, state/action 문법을 공유한다.
- [ ] `/admin/today`가 platform-wide 우선순위와 case lifecycle의 단일 시작점이다.
- [ ] Club registry가 100개 제한 없이 search/cursor를 제공한다.
- [ ] Club metadata, visibility, domain 기능이 detail route에서 도달 가능하다.
- [ ] Notification, AI, Audit의 cursor가 실제 UI에서 누적·dedupe된다.
- [ ] Notification warning/status/`skippedCount`와 AI unavailable state가 손실되지 않는다.
- [ ] 위험 action마다 preview, impact, exclusion, reason, confirm, idempotency, receipt, audit가 있다.
- [ ] Partial, failed, unknown outcome의 대상별 복구가 가능하다.
- [ ] Support create/revoke의 UI capability와 server authorization이 일치한다.
- [ ] Audit가 case event, actor, target, AI/admin command receipt를 포함한다.
- [ ] Analytics 화면과 CSV가 동일한 metric definition, period, availability, value를 사용한다.
- [ ] Mobile에서 모든 primary task를 조회부터 결과 확인까지 완료한다.
- [ ] 접근성 dialog/menu/selection/loading/error semantics가 검증된다.
- [ ] Mobile safe area, virtual keyboard, modal inert/scroll-lock과 긴 confirmation content가 검증된다.
- [ ] Platform admin이 club host workflow나 private content를 우회하지 않는다.
- [ ] Placeholder, dead control, unreachable component, decorative KPI가 남지 않는다.
- [ ] 자동·브라우저·시각·접근성·독립 review evidence가 모두 존재한다.

## 19. 출시·관측·복구

### 19.1 점진 활성화

1. additive server read contract와 characterization을 먼저 배포한다.
2. 새 shell과 read-only route composition을 활성화한다.
3. domain별 preview/receipt가 준비된 mutation만 capability로 활성화한다.
4. audit union과 analytics parity를 확인한다.
5. legacy UI path는 deep link와 rollback window가 검증된 뒤 제거한다.

하나의 feature flag로 어드민 전체를 영구 이중 운영하지 않는다. Rollout flag는 짧은 호환 기간과 명확한
삭제 조건을 가진다.

### 19.2 운영자 fallback

- source 장애: last-known-good와 실패 범위 표시, 해당 source action만 제한
- write contract 장애: route 전체가 아니라 해당 action을 read-only로 전환
- permission service 불명: fail closed, sensitive cache와 preview 폐기
- provider 결과 불명: receipt 조회와 reconciliation, blind retry 금지
- migration rollback 불가: forward-fix 가능한 additive schema와 backward-compatible reader 유지

### 19.3 관측

- route pattern, safe error code, command type, outcome, latency, partial count, reconciliation age
- high-cardinality user/club/case/receipt ID는 metric tag에 사용하지 않음
- receipt ID는 operator lookup과 audit에만 사용
- source freshness와 stale duration을 별도 측정
- UI error telemetry에 private input, reason note, provider raw error를 넣지 않음

## 20. ADR 상태와 다음 단계

- ADR-0020: 하나의 브랜드와 platform-admin command-ledger composition을 유지한다. 구현과 design guide가
  일치한 뒤에만 `Accepted`로 승격한다.
- ADR-0039: 네 primary area와 task-centered Service Spine IA를 `Proposed`로 기록한다.
- ADR-0040: domain-owned preview/confirm/idempotency/receipt protocol을 `Proposed`로 기록한다.
- ADR-0037: emergency public takedown은 독립 `Proposed` 결정으로 유지한다.

이 승인 명세가 문서 review를 통과한 뒤 별도 구현 계획을 작성한다. 구현 계획은 Phase 0부터 Phase 5를
작은 수직 slice로 분해하고, 각 task에 변경 파일, RED/GREEN test, browser evidence, review gate를 적는다.
설계 승인만으로 제품 코드, migration, live mutation, deploy를 시작하지 않는다.
