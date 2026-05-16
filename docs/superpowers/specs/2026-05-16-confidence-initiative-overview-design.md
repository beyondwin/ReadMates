# Confidence Initiative — Overview

- Status: Draft
- Author: kws
- Date: 2026-05-16
- Scope: internal-facing 4-phase backbone 작업 (architecture boundary + observability)

## 1. Why

ReadMates는 v1.9까지 BFF 보안 경계, 알림 outbox + Kafka relay, 멀티 클럽 도메인, 수동 알림 워크벤치까지 빠르게 확장했다. 그 결과 두 가지 통증이 다음 큰 product 작업을 막는 임계점에 가까워졌다:

1. **변경 시 회귀 영향이 불투명한 모듈이 남아 있다.** `feedback` 모듈은 README/CHANGELOG가 명시한 future split 후보이며 upload mutation과 access-controlled read가 한 application service 안에 섞여 있다. notification ↔ session ↔ membership 경계도 manual dispatch path가 세 context를 동시에 참조해 변경 비용을 정확히 산정하기 어렵다.
2. **운영 중 발생한 실패의 근본 원인을 빠르게 추적하기 어렵다.** outbox state machine의 `FAILED`/`DEAD` 누적은 metric으로는 보이지만 *어떤 요청이 어떤 publish 시도를 거쳐 어디서 실패했는지*를 단일 trace로 재구성하려면 여러 로그를 수동으로 이어 붙여야 한다. BFF → Spring → Kafka producer → consumer → SMTP 경로에 공통 correlation ID가 없다.

Confidence Initiative는 이 두 통증을 4-phase로 동시에 한 단계 낮추는 internal-facing 작업이다. 각 phase는 독립적으로 shippable하고 별도 spec/plan을 가진다.

## 2. Success Definition

이 initiative가 완료되었을 때 다음이 *동시에* 참이다:

- **변경 신뢰성** — `feedback` 모듈과 가장 엉킨 cross-context boundary 1개가 `note`/`publication`/`archive`와 동일한 read/write 패턴으로 분리되고 `@ReadOnlyApplicationService` marker + ArchUnit 규칙으로 강제된다. boundary backlog는 ranked 표 형태로 문서화되어 다음 사이클 의사결정 비용이 일정해진다.
- **운영 가시성** — 단일 `requestId`로 BFF → Spring → Kafka publish → consumer → SMTP까지 로그가 grep 한 번에 이어진다. SLO 최소 3개(notification dispatch 성공률, BFF→API p95, login 성공률)가 코드에 정의되어 dashboard로 보인다.
- **운영 자동화** — 플랫폼 관리자가 `/app/admin/outbox`에서 dead-letter 항목을 list/inspect/retry/resolve할 수 있고, manual dispatch 한 건을 correlation ID로 BFF 요청부터 SMTP send까지 audit drill-down할 수 있다.

## 3. Phase 구성

| Phase | 제목 | 핵심 산출물 | 의존 |
| --- | --- | --- | --- |
| 0 | Observability backbone | correlation ID end-to-end, structured JSON logging baseline, SLO 카탈로그(코드), Grafana dashboards-as-code 2종 | — |
| 1 | Boundary inventory + ArchUnit 일반화 | bounded context 표(read/write 분리 상태, cross-context 직접 호출, mixed 잔존), ranked split backlog, ArchUnit 규칙 generalize, anti-corruption layer 컨벤션 docs | 0 |
| 2 | feedback CQRS split + 첫 cross-context decoupling | `feedback` read/write 패키지 분리 + marker + ArchUnit rule, Phase 1 backlog top-1(예상: notification ↔ session) 실제 분리 with 명시적 inbound port | 0, 1 |
| 3 | Operator console + alerting | `/app/admin/outbox` dead-letter UI, manual dispatch audit drill-down(correlation ID linking), SLO 기반 alert 라우팅 | 0, 2 |

Phase 4 (optional): Phase 1 backlog의 두 번째 항목 split. Phase 3 종료 시점의 우선순위 재평가 결과를 따른다.

### 3.1 Sequencing 근거

- **Phase 0이 먼저**여야 하는 이유: Phase 2의 boundary refactor는 회귀 가능성이 큰 작업이고, Phase 3의 운영 도구는 correlation ID/SLO 없이 만들면 기존 metric 화면 정도로 가치가 떨어진다. 둘 모두 Phase 0의 산출물 위에서 정량 측정 가능해야 한다.
- **Phase 1을 Phase 2 앞에 두는 이유**: feedback split만 먼저 끝내도 가치는 있으나, 두 번째 split을 *어디서* 하는 것이 ROI가 높은지는 audit 없이는 추정에 그친다. ranked backlog가 있으면 Phase 2의 두 번째 작업 선택, Phase 4 여부, 다음 release의 product 작업 우선순위 의사결정 비용이 모두 낮아진다.
- **Phase 3이 마지막인 이유**: dead-letter 콘솔과 audit drill-down 모두 Phase 0의 correlation ID와 structured log를 활용하지 않으면 reinvent에 가깝다.

## 4. Phase별 측정지표 (Exit Criteria)

- **Phase 0** — (a) Spring 서버 `application-*.yml`이 JSON logging encoder를 활성화한다. (b) Cloudflare Pages BFF 요청 1건의 `X-Request-Id`가 Spring 로그, outbox row(`request_id` column), Kafka 헤더, consumer 로그, SMTP send 로그에 모두 동일한 값으로 등장한다는 회귀 테스트가 통과한다. (c) `slos.yaml`(또는 동등 코드 자료)을 로드해 schema 검증하는 unit test가 통과하고, Grafana dashboard JSON 2종이 `ops/grafana/dashboards/`에 커밋되어 `jq` lint를 통과한다.
- **Phase 1** — `docs/development/architecture.md`(또는 동일 경로)에 모든 bounded context 표가 추가된다. ArchUnit이 임의의 새 application service에 marker가 없으면 실패하도록 일반화된 규칙이 그린이다. ranked split backlog가 별도 문서에 존재한다.
- **Phase 2** — `feedback`이 read/write 패키지로 분리되고 read-side가 `@ReadOnlyApplicationService` marker를 가지며 mutation port 의존 없이 ArchUnit 두 규칙을 통과한다. Phase 1 backlog top-1의 inbound port 분리가 동일한 검증을 통과한다. 두 변경 모두 v1.9 perf 게이트와 기존 E2E `manual-notifications.spec.ts`를 깨지 않는다.
- **Phase 3** — `/app/admin/outbox`가 ADMIN role + 평소 호스트 권한과 분리된 path로 접근 가능, dead-letter row를 list/inspect(masked)/retry/resolve할 수 있고 모든 액션이 기존 audit ledger 패턴으로 기록된다. SLO 위반 시 Prometheus alert rule 1개 이상이 정의된다.

## 5. Non-goals

- 신규 product 기능 추가(예: 캘린더 알림, AI 통합, 멤버 통계 대시보드, 책 추천 흐름)
- BFF/OAuth 재설계 — 현재 BFF 보안 경계와 secret rotation case study가 source of truth로 유지된다.
- DB schema 광범위 재설계 — phase별로 필요한 최소 Flyway migration만 추가한다(예: Phase 0에서 outbox `request_id` column).
- 다국어 지원, 결제, AI 콘텐츠 in-app 생성. 이들은 본 initiative의 범위 밖이며, initiative 완료 후 별도 의사결정.

## 6. Risk & Sequencing 정책

- **Polish-forever risk**: 4 phase 누적이 internal-facing이며 약 3~4개 릴리즈에 해당한다. product 작업이 막히지 않도록 다음 정책을 둔다:
  - 각 phase는 독립 shippable. product feature 작업이 끼어들어도 backbone이 깨지지 않도록 Phase 0의 모든 추가 column/필드는 NULL-safe로 도입한다.
  - Phase 1 audit 결과는 Phase 2 우선순위를 변경할 수 있다. 이 경우 별도 phase spec을 다시 작성한다(추가 turn 비용 < 잘못된 split 비용).
  - Phase 4는 진정 optional. Phase 3 완료 시점에 product backlog와 비교해 결정한다.
- **로그 비용 변화**: Phase 0의 JSON encoder + correlation MDC field 도입은 로그 volume을 늘릴 수 있다. Phase 0 spec에서 sampling/필드 표준화로 상한을 둔다.
- **MDC 전파 누락**: Kafka consumer thread, async @Scheduled, CompletableFuture 경계에서 MDC가 손실되는 사례가 있다. Phase 0 spec에서 각 경계를 명시적으로 다룬다.
- **operator console 권한 오용**: `/app/admin/outbox`는 host 권한과 분리된 platform admin 권한에서만 접근 가능해야 하며, retry 액션은 idempotency key를 강제한다. Phase 3 spec에서 구체화한다.

## 7. 산출물 경로 규약

- 각 phase의 spec: `docs/superpowers/specs/2026-05-16-confidence-initiative-phase-<N>-<topic>-design.md`
- 각 phase의 implementation plan: `docs/superpowers/plans/2026-05-XX-confidence-initiative-phase-<N>-<topic>-implementation.md`
- 본 overview 문서는 단일 source of truth로 phase 진행 상태(Exit criteria 충족 여부)를 표로 업데이트한다.

## 8. 다음 단계

1. Phase 0 spec 작성 — `2026-05-16-confidence-initiative-phase-0-observability-design.md` (본 문서와 같은 PR 또는 직후 commit).
2. Phase 0 implementation plan은 spec 승인 후 `superpowers:writing-plans` skill로 생성한다.
3. Phase 1 spec은 Phase 0 implementation이 main에 머지된 직후 별도 brainstorming으로 시작한다(`feedback` 모듈을 audit 대상에 포함하되 분리 자체는 Phase 2의 일이다).
