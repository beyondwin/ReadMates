# ReadMates 테스트 스위트 실효성 감사·최적화 설계

**작성일:** 2026-07-24

**상태:** 사용자 승인 완료, 구현 계획 작성 전

**영향 표면:** frontend unit/route/BFF/E2E/visual CT, server unit/integration/architecture, design system, CI·검증 scripts

---

## 1. 배경

ReadMates 테스트 스위트는 frontend, Cloudflare Pages Functions BFF, Kotlin/Spring Boot server, MySQL/Flyway, design system, public-release automation을 함께 검증한다. 2026-07-24 파일 스캔 기준으로 자동화 테스트 파일은 510개이고, 해당 테스트 파일 자체의 총 길이는 약 10.9만 줄이다. 이 수치는 일반 `*.test.*`/`*.spec.*` 및 Kotlin `*Test.kt` 파일 504개와 Playwright CT `*.ct.tsx` 파일 6개를 합친 값이다.

현재 구성에는 다음 검증 lane이 있다.

- frontend Vitest node/jsdom 및 coverage gate;
- Playwright E2E와 component visual regression;
- server unit, integration/Testcontainers, architecture/ArchUnit 및 JaCoCo gate;
- design system build/test;
- public-release, agent guidance, production config, observability 관련 script 검증.

공식 CI와 로컬 검증 명령이 여러 계층을 실행하고 있지만, 테스트 통과와 coverage만으로는 각 테스트의 실효성을 증명할 수 없다. 실행되는 테스트가 mock 또는 fixture 자체를 재확인하거나, 실제 회귀를 잡지 못하거나, 더 적절한 계층에서 이미 같은 위험을 검증하면서 실행시간만 늘릴 수 있다. 반대로 coverage가 높아도 권한 부정 경로, tenant 격리, 동시성, rollback, provider 장애 같은 핵심 실패 모드가 비어 있을 수 있다.

현재 tree에는 범용 mutation-testing 도구가 설정되어 있지 않다. 따라서 이 작업은 coverage 수치만으로 삭제·보강 결정을 내리지 않고, 구현 분기 추적과 제한된 결함 주입을 함께 사용한다.

## 2. 목표와 비목표

### 2.1 목표

1. 공식 테스트 파일 전체를 실제 실행 lane과 연결하고 실행 누락·중복을 찾는다.
2. 각 테스트를 `유지`, `강화`, `통합`, `삭제`, `계층 이동`, `분리` 중 하나로 판정한다.
3. 실제 제품 회귀를 탐지하지 못하는 assertion, mock, snapshot, fixture 검증을 제거하거나 강화한다.
4. 인증·인가, 클럽 격리, 공개 범위, BFF trust boundary, lifecycle, transaction, migration, cache, AI 비용·복구의 누락 테스트를 보강한다.
5. 회귀 탐지력을 유지하거나 높이면서 테스트 및 CI wallclock, 중복 실행, flake를 줄인다.
6. 변경 전후 근거와 남은 위험을 날짜가 있는 감사 보고서에 남긴다.

### 2.2 비목표

- 제품 기능 또는 제품 계약 자체를 변경하지 않는다.
- coverage threshold를 낮추거나 broad exclude를 추가해 gate를 통과시키지 않는다.
- retry, timeout, sleep 증가로 flake를 숨기지 않는다.
- 모든 production 코드를 무차별적으로 mutation test하지 않는다.
- 테스트 정리와 무관한 architecture refactor를 수행하지 않는다.
- 실제 회원 데이터, secret, private domain, deployment state, 로컬 절대 경로를 fixture, 문서, 로그에 추가하지 않는다.

### 2.3 작업 분해

510개 자동화 테스트 파일 전체의 inventory, 코드 변경, 결함 주입, 전체 검증을 하나의 implementation plan에 담으면 작업 단위와 검토 범위가 지나치게 커진다. 전체 목표와 판정 규칙은 이 설계가 통제하되 실행은 다음의 bounded plan으로 나눈다.

1. 기준선, 전체 파일 inventory, 실행 연결성, 고위험 gap matrix;
2. server unit/integration/architecture 최적화;
3. frontend unit/route/BFF 최적화;
4. E2E/visual CT/design system/CI·script 최적화;
5. cross-surface 결함 주입, 전체 회귀 검증, 최종 보고.

`superpowers:writing-plans`로 바로 전환하는 첫 계획은 1번까지만 다룬다. 2~4번 계획은 1번에서 확인한 실제 중복·누락·실행시간 증거를 입력으로 작성하며, 5번 계획은 앞선 변경의 통합 검증을 담당한다. 후속 계획은 이 승인된 설계의 목표와 판정 규칙을 다시 결정하지 않는다.

## 3. 검토한 접근법

### 3.1 증거 기반 계층 감사 — 채택

현재 결과와 실행시간을 기준선으로 잡고, 제품 위험에서 구현 분기, 테스트 assertion, CI lane까지 추적한다. 중요 경로에는 제한된 결함을 임시 주입해 테스트가 실제로 실패하는지 확인한다.

장점은 의미 없는 green test와 coverage 착시를 가장 잘 찾고, 가치 있는 테스트를 성급하게 삭제하지 않는다는 점이다. 단점은 전체 파일 inventory와 중요 경로의 결함 주입에 시간이 든다는 점이다.

### 3.2 Coverage 중심 정리 — 기각

미실행 source와 중복 coverage를 중심으로 빠르게 정리한다. 실행은 되지만 의미 없는 assertion, mock이 구현을 복제하는 테스트, 실패 모드를 누락한 happy-path test를 놓칠 수 있어 단독 판정 근거로 사용하지 않는다.

### 3.3 고위험 경로 집중 — 부분 채택

인증·권한·BFF·공개 범위·AI 비용·migration을 먼저 깊게 검토하는 우선순위는 채택한다. 다만 나머지를 표본 검사로 끝내지 않고 모든 공식 테스트 파일을 inventory에 포함한다.

## 4. 감사 모델

감사 근거는 다음 방향으로 연결한다.

```text
제품 요구·보안 경계
        ↓
구현 분기와 실패 모드
        ↓
담당 테스트와 assertion
        ↓
실제 test runner 및 CI lane
        ↓
결함 주입·반복 실행 증거
        ↓
유지 / 강화 / 통합 / 삭제 / 이동 / 분리
```

각 테스트 파일의 inventory에는 최소한 다음 정보를 둔다.

| 필드 | 의미 |
| --- | --- |
| 경로 | 테스트 파일의 repo-relative path |
| 계층 | unit, route, BFF, integration, architecture, E2E, CT, script 등 |
| 담당 계약 | 보호하려는 제품 규칙 또는 기술 경계 |
| production target | 직접 검증하는 구현 파일·endpoint·migration·script |
| runner/CI lane | include/tag와 실제 실행 job |
| assertion 관찰점 | 반환값, DOM, HTTP 계약, DB side effect, event, log/metric 등 |
| test double | mock, fake, stub, fixture 및 실제 경계 대체 범위 |
| 중복 관계 | 같은 failure mode를 검증하는 다른 테스트 |
| 판정 | 유지, 강화, 통합, 삭제, 계층 이동, 분리 |
| 근거 | 코드 추적, 실행 결과, 결함 주입, 반복 실행 결과 |

자동 분석은 실행 누락, skip/only/todo, mock 밀도, 큰 테스트 파일, snapshot 사용, include/exclude/tag 불일치, 동일 production target 집중 같은 후보를 좁히는 용도로만 사용한다. 최종 판정은 구현과 assertion을 함께 읽은 뒤 내린다.

## 5. 변경 판정 규칙

### 5.1 삭제

테스트 삭제는 다음 조건을 모두 충족할 때만 허용한다.

1. 공식 명령 또는 CI에서 현재 실행되는지 확인했다.
2. 담당 제품 계약과 구현 분기를 추적했다.
3. 고유하게 탐지하는 회귀가 없거나 더 적절한 계층의 테스트가 동일한 failure mode를 탐지한다.
4. assertion이 mock 설정값, 상수, fixture 자체를 다시 확인하는 수준인지 검토했다.
5. 삭제 후 focused suite와 관련 결함 주입이 여전히 예상대로 실패한다.

실행되지 않는 테스트는 즉시 삭제하지 않는다. include/tag/config 오류로 빠진 유효 테스트인지, 제거된 구현을 가리키는 dead test인지 먼저 구분한다.

### 5.2 통합

동일 production branch, 동일 failure mode, 사실상 같은 fixture와 assertion을 여러 파일 또는 계층에서 반복할 때 통합한다. 서로 다른 관찰점, 예를 들어 unit domain rule과 실제 DB constraint, frontend contract와 cross-language serialization은 이름이 비슷해도 중복으로 보지 않는다.

### 5.3 강화

다음 테스트는 삭제보다 assertion 또는 경계 강화를 우선 검토한다.

- 렌더링 또는 함수 호출만 하고 사용자 결과나 상태 변화를 확인하지 않는 테스트;
- mock이 production 로직을 복제해 mock 설정만 확인하는 테스트;
- HTTP status만 확인하고 body contract, authorization, persistence side effect를 확인하지 않는 테스트;
- 광범위한 snapshot 하나로 의미를 대신하는 테스트;
- happy path만 있고 중요한 부정·장애 경로가 없는 테스트;
- 테스트 이름과 실제 assertion이 다른 테스트.

### 5.4 계층 이동

- 순수 계산과 view model은 빠른 unit test로 둔다.
- loader/action, query invalidation, route continuity는 route/component test로 둔다.
- trusted header, cookie, redirect, edge proxy behavior는 BFF test와 최소 E2E 증거로 둔다.
- serialization, Zod/Kotlin 계약, SQL, Flyway, transaction, cache invalidation은 실제 경계 test에 둔다.
- E2E는 핵심 사용자 vertical slice와 브라우저/BFF/backend 통합 증거만 유지한다.
- architecture test는 import/package/dependency 구조를 검증하고 제품 동작을 대신하지 않는다.
- visual CT는 의미 있는 layout 회귀를 보호하고 데이터 흐름·권한·라우팅을 대신하지 않는다.

## 6. 우선 검토할 사각지대

### 6.1 보안과 데이터 공개

- 역할별 허용뿐 아니라 거부 matrix;
- 클럽 간 resource ID 교차 사용과 tenant 격리;
- browser가 위조한 `x-readmates-*` header, cookie, OAuth return URL;
- 공개, 멤버 전용, 참석자 전용 record의 visibility 전이;
- 응답, 로그, metric label, fixture의 PII·token·secret 노출.

### 6.2 lifecycle과 일관성

- session/member/invitation/publication 상태 전이의 금지 경로;
- idempotency, 중복 command/event, 동시 실행;
- transaction 중간 실패와 rollback;
- commit 이후 cache invalidation 및 stale read;
- Flyway 신규 설치와 기존 schema/data upgrade.

### 6.3 외부 의존성과 운영

- Redis, Kafka, mail, LLM provider 장애·timeout·부분 성공;
- AI 비용 상한, provider call reservation, 취소·만료·복구 경쟁 조건;
- retry/backoff가 중복 side effect를 만들지 않는지;
- test profile 또는 fake가 production 설정과 다른 거짓 통과;
- operator-facing error, health, audit, observability 계약.

### 6.4 test infrastructure

- Vitest project include/exclude 및 server tag가 테스트를 누락하거나 중복 실행하는지;
- Playwright retry가 flake를 가리는지;
- 공유 DB, Redis keyspace, clock, port, filesystem fixture로 인한 순서 의존성;
- fixture가 실제 lifecycle invariant를 우회하는지;
- coverage 대상에서 Functions, scripts, generated cross-language contract가 빠지는지;
- visual baseline이 renderer drift 또는 copy 변화에 과민한지.

## 7. 실행 단계

### 7.1 단계 1: 기준선과 실행 연결성

1. repo-defined Corepack launcher와 Gradle wrapper를 사용한다.
2. 공식 lane의 pass/fail, 테스트 수, coverage, wallclock, retry/skip을 기록한다.
3. Vitest include/exclude, JUnit tag, Gradle task graph, Playwright match/shard, GitHub Actions job을 파일 inventory와 연결한다.
4. 실행되지 않거나 중복 실행되는 테스트를 별도 후보로 표시한다.

전체 suite는 변경 전과 최종 상태에서 실행한다. Flake 또는 성능 판단이 필요한 focused lane은 최소 3회 반복하고 median과 범위를 기록한다. 환경 비용이 큰 전체 E2E·integration·CT를 모든 작은 변경마다 반복하지 않고, 관련 focused test와 단계별 gate를 사용한다.

### 7.2 단계 2: 저위험 정리

다음 순서로 작은 변경 묶음을 만든다.

1. dead test와 runner 연결 오류;
2. fixture·상수·mock 자체만 검증하는 assertion;
3. 완전한 failure-mode 중복;
4. 불필요한 Spring context, database, browser 구동;
5. 지나치게 큰 테스트 파일의 책임 분리.

각 변경 묶음은 담당 production target의 focused test를 먼저 실행한 뒤 다음 단계로 넘어간다.

### 7.3 단계 3: 핵심 위험 보강

사각지대 matrix와 현재 테스트를 비교해 누락된 부정, 장애, 동시성, rollback test를 추가한다. 테스트를 추가할 때 가장 낮으면서도 실제 위험을 관찰할 수 있는 계층을 선택한다. 실제 DB, browser, edge 또는 provider adapter semantics가 필요한 검증을 mock-only unit test로 대체하지 않는다.

### 7.4 단계 4: 구조와 실행시간 최적화

- pure logic을 느린 계층에서 unit으로 내린다.
- E2E setup과 반복 navigation을 줄이되 핵심 vertical slice는 유지한다.
- integration fixture와 database reset 범위를 격리한다.
- CI에서 같은 test task를 중복 호출하지 않도록 한다.
- concurrency를 늘리기 전 공유 상태와 memory/container 비용을 검증한다.
- retry와 timeout은 원인 확인 없이 늘리지 않는다.

최적화는 전후 wallclock이 개선되고 failure-mode 탐지력이 유지되는 경우에만 채택한다. 속도가 개선되지 않거나 flake를 늘리는 변경은 되돌린다.

### 7.5 단계 5: 전체 검증과 감사 보고

최종 보고에는 다음을 포함한다.

- 변경 전후 테스트 파일·케이스 수와 계층별 분포;
- 실행 누락과 중복 실행 수정 내역;
- 삭제, 통합, 강화, 추가, 이동된 테스트와 사유;
- coverage 전후 값;
- 전체 및 주요 lane wallclock;
- 제한된 결함 주입 결과;
- flake 또는 retry 관찰 결과;
- 실행하지 못한 검증과 잔여 위험.

감사 결과는 날짜가 있는 `docs/superpowers/reports/` snapshot으로 남긴다. 현재 contributor rule 또는 공식 명령이 바뀌는 경우에만 active `docs/development/test-guide.md`를 갱신한다.

## 8. 결함 주입 프로토콜

결함 주입은 테스트 코드의 효과를 확인하기 위한 일시적 작업이며 최종 diff에 남기지 않는다.

1. 중요 requirement의 production branch 하나를 선택한다.
2. boolean 반전, authorization guard 제거, boundary comparison 변경, cache invalidation 생략처럼 작고 설명 가능한 결함을 한 번에 하나만 적용한다.
3. 해당 결함을 잡아야 하는 최소 focused suite를 실행한다.
4. 예상 테스트가 실패했는지, 다른 테스트만 우연히 실패했는지 기록한다.
5. 결함을 즉시 복원하고 clean diff 또는 예상된 작업 diff만 남았는지 확인한다.
6. 원본 상태의 focused suite가 다시 통과하는지 확인한다.

결함 주입은 실제 secret, private data, destructive migration, 외부 provider call, 운영 deployment를 사용하지 않는다. 복구 대상과 현재 diff가 불명확하면 실행하지 않는다.

## 9. 실패 처리와 중단 조건

- 기준선 실패는 테스트 삭제로 해결하지 않는다. production defect, stale expectation, 환경 문제, flake로 분류한다.
- Docker, browser, toolchain 같은 환경 의존성이 없으면 해당 lane을 `미검증`으로 기록한다. 통과로 간주하지 않는다.
- 결함 주입이 담당 테스트 외의 광범위한 실패를 만들면 테스트 isolation 또는 fixture coupling 문제로 기록하고 주입 범위를 줄인다.
- 삭제가 고유 failure-mode 탐지를 없애면 삭제하지 않는다.
- 반복 실행에서 비결정 실패가 나오면 속도 최적화보다 flake 원인 제거를 우선한다.
- 사용자 변경이 생기거나 audit 대상 파일과 겹치는 미커밋 변경이 발견되면 덮어쓰지 않고 범위를 재확인한다.
- architecture source of truth 또는 보안 경계와 상충하는 테스트 기대값은 임의로 바꾸지 않는다.
- private data, secret, deployment identifier가 필요해지는 검증은 중단하고 public-safe fixture 또는 별도 권한을 확인한다.

## 10. 공식 검증

변경 표면에 따라 focused test를 먼저 실행하고, 최종 상태에서는 최소 다음 명령을 실행한다.

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test:coverage
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
corepack pnpm --dir front test:ct:docker
corepack pnpm design:check
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
```

CI, scripts, docs 또는 public-release candidate 표면을 변경하면 다음도 실행한다.

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

실제 implementation plan은 workflow와 scripts를 다시 확인해 공식 CI의 추가 config·observability self-test를 작업별 acceptance command에 연결한다.

## 11. 완료 기준

다음 조건을 모두 충족해야 완료로 본다.

1. 공식 테스트 파일 전체에 실행 lane과 판정 근거가 있다.
2. 발견된 runner 누락과 의도하지 않은 중복 실행이 해소됐다.
3. 삭제·통합된 테스트가 보호하던 failure mode는 다른 적절한 테스트가 계속 탐지한다.
4. 핵심 보안·데이터·lifecycle·운영 사각지대에 focused test 또는 명시적인 잔여 위험이 있다.
5. 선택한 중요 경로의 결함 주입이 담당 테스트를 실패시킨다.
6. coverage gate는 유지되며 의미 있는 감소가 있으면 코드·계층 변화로 설명된다.
7. 주요 lane의 wallclock과 flake가 악화되지 않는다.
8. 실행 가능한 공식 전체 gate가 통과한다.
9. 실행하지 못한 검증과 환경 이유를 완료 보고에 명시한다.

테스트 수 감소 또는 실행시간 단축 자체는 성공 기준이 아니다. 회귀 탐지력이 유지되거나 증가했다는 증거가 있을 때만 최적화로 인정한다.
