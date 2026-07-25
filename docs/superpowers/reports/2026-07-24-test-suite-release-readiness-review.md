# 테스트 스위트 최적화 브랜치 릴리스 준비 검토

## 결론

검토 범위는 `origin/main`의 `0cd590a9`부터 후보 `753e6ce0`까지다.
현재 후보에는 제품 코드, public API, 운영 migration, 배포 script,
architecture baseline/exception 변경이 없다. 변경은 테스트, public-safe
테스트 fixture, 테스트 증거 문서, benchmark helper의 출력 grouping,
그리고 CI validator 도달성에 한정된다.

Blocker와 High finding은 없다. CI 변경이 `CHANGELOG.md`의
`Unreleased`에 없던 Medium finding은 이 검토에서 해결했다. 외부
서비스와 GitHub-hosted CI를 실제 호출하지 않은 범위, 기존 Redis
best-effort invalidation, 기존 toolchain 호환성 경고는 Low residual로
남는다. 로컬에서 준비 가능한 공식 lane은 같은 후보에서 통과했으므로
`UNVERIFIED_ENV`는 0이다.

## Blocker

없음.

## High

없음.

## Medium

### 해결됨 — CI validator 도달성 변경의 릴리스 기록 누락

- 파일/라인: `.github/workflows/ci.yml:58-118`,
  `CHANGELOG.md:13-15`
- 영향: 브랜치는 tracked shell의 재귀 검증, validator의 독립 실행,
  production AI validator와 fixture 검증의 독립 step, Grafana lint
  단일 소유권을 도입한다. 제품 runtime 변경은 아니지만 PR 실패
  관찰 방식과 CI 소유권이 달라지므로 개발자와 저장소 운영자가 다음
  릴리스에서 놀랄 수 있다.
- 액션: `CHANGELOG.md`의 `Unreleased > Changed`에 CI 도달성 변경과
  변경하지 않은 제품/배포/성능 계약을 public-safe하게 기록했다.
- 검증: `actionlint .github/workflows/ci.yml`, 변경된 두 benchmark
  helper의 `bash -n`과 ShellCheck, 34개 recursive tracked shell의
  Task 4 직접 검증, `git diff --check origin/main..HEAD`가 통과했다.
  GitHub-hosted run은 이 계획이 push를 금지하므로 실행하지 않았다.

## Low

### 외부 provider, mail, live deploy, GitHub-hosted CI 미관찰

- 파일/라인:
  `docs/superpowers/reports/2026-07-24-test-suite-phase-4-browser-ci-report.md:323-327`
- 영향: local MySQL/Spring/Vite/Chromium, Testcontainers, workflow
  구조와 validator 실행은 검증됐지만 Google OAuth provider, 외부 AI
  provider, mail network, production deployment, 실제 GitHub-hosted
  runner의 상태는 이 브랜치 증거만으로 닫히지 않는다.
- 액션: merge 전 실제 PR CI를 확인하고, release tag 이후 승인된
  provider/OAuth/mail 및 production smoke를 public-safe runbook에 따라
  수행한다. private transcript나 실회원 데이터는 사용하지 않는다.
- 검증: Phase 5 Task 4의 22개 공식 gate와 두 recursive shell parity
  check는 통과했다. 외부 호출, push, tag, publish, deploy는 계획상
  실행하지 않았다.

### Redis invalidation 실패 뒤 stale cache 가능성

- 파일/라인:
  `server/src/main/kotlin/com/readmates/shared/adapter/out/redis/RedisReadCacheInvalidationAdapter.kt:23-26`,
  `server/src/main/kotlin/com/readmates/shared/adapter/out/redis/RedisReadCacheInvalidationAdapter.kt:29-61`
- 영향: public 또는 notes invalidation이 circuit-breaker fallback으로
  실패하면 strict 결과는 `false`지만 기존 cache entry는 TTL 또는 다음
  성공한 invalidation까지 남을 수 있다. 이 브랜치는 그 계약을
  변경하지 않고 실패를 관찰하는 테스트를 강화했다.
- 액션: 기존 `readmates.redis.fallbacks`와
  `readmates.redis.operation.errors` 지표를 release 후 관찰한다.
  stale window를 제거해야 한다면 별도 제품 설계와 migration 없는
  cache 정책 변경으로 검토하며 이 테스트 최적화 브랜치에 섞지 않는다.
- 검증: R07 defect injection은 mutation 상태에서 5/6 detector가
  의도대로 실패하고 복원 뒤 6/6이 통과했다. 전체 server integration과
  official gates도 통과했다.

### 기존 toolchain 호환성 경고

- 파일/라인:
  `docs/superpowers/reports/2026-07-24-test-suite-phase-4-browser-ci-report.md:330-333`
- 영향: Java native-access/dynamic-agent/Unsafe, Flyway의 MySQL 8.4
  검증 상한 경고, MySQL `VALUES` 문법, Kotlin/Jackson/Spring
  deprecation은 현재 gate를 실패시키지 않지만 향후 의존성 갱신에서
  실제 호환성 문제가 될 수 있다.
- 액션: 다음 JDK/MySQL/Flyway 및 framework dependency 갱신에서
  warning inventory를 다시 확인한다. 이 브랜치에는 dependency,
  runtime image, migration, production SQL 변경이 없다.
- 검증: Phase 5의 fresh integration 744/744와 actual server
  unit/architecture 실행이 통과했다. 경고 제거를 위한 제품 변경은
  이 계획 범위 밖이라 실행하지 않았다.

## Not an issue

### 제품·API·migration·배포 계약

- 파일/라인: `docs/superpowers/reports/2026-07-24-test-suite-final-decisions.tsv:1-526`
- 판단: `origin/main..HEAD`에서 `server/src/main/kotlin`,
  non-test frontend/BFF, 운영 Flyway migration, `deploy/` 변경 수는
  각각 0이다. 테스트 fixture
  `server/src/test/resources/db/phase2/flyway-upgrade-before-latest.sql`
  은 public-safe V41 upgrade 입력이고 운영 migration이 아니다.
- 검증: pathspec별 changed-file count와 전체 branch diff를 확인했다.
  API schema, route, auth, visibility, threshold, retry, timeout, worker,
  shard, fork, heap, cache 설정 변경은 없다.

### Security code hygiene와 테스트 값

- 파일/라인:
  `docs/superpowers/reports/2026-07-24-test-suite-mutation-evidence.tsv:1-11`
- 판단: security production code는 최종 diff에 없고 R01-R10 mutation은
  모두 복원됐다. 추가 테스트는 합성 ID, placeholder, redacted error,
  deterministic provider/mail boundary만 사용한다. 실제 secret, member
  data, private domain, deployment identifier, token-shaped 값은 추가하지
  않았다.
- 검증: mutation target blob 복원 seal, changed-file private-value scan,
  Task 4 public candidate build와 exact-candidate gitleaks scanner가
  통과했다.

### Architecture baseline과 exception

- 파일/라인: `.github/workflows/ci.yml:307-326`
- 판단: architecture lane 소유권과 JaCoCo report 업로드는 유지되며
  architecture baseline/exception 파일 변경은 0이다. 테스트 이동과
  통합은 Phase 2 decision ledger가 승인한 경로만 사용했다.
- 검증: Phase 5 supplemental actual server run에서 architecture
  25/25가 통과했고, 같은 후보의 unchanged JaCoCo minimum `0.23`
  verification도 통과했다.

### CI artifact와 public-release 대상 일치

- 파일/라인: `.github/workflows/ci.yml:120-131`
- 판단: public-release job은 build script가 만든 exact
  `.tmp/public-release-candidate`를 scanner에 전달한다. scan 대상과
  publish/deploy 대상이 갈라지는 변경은 없고, 이 브랜치는 publish와
  deploy를 수행하지 않는다. `CHANGELOG.md`와 `docs/superpowers`는
  기존 manifest가 명시적으로 제외하므로 저장소 문서 safety scan으로
  별도 검증한다.
- 검증: Task 4에서 candidate build와 exact-candidate scan이 각각
  통과했다. 이 검토의 `CHANGELOG.md` 변경 뒤 같은 두 명령을 다시
  실행했고 약 10.51 MB의 후보에서 gitleaks finding 없이 통과했다.

### Benchmark helper 동작

- 파일/라인: `scripts/bench/measure-local.sh:43-79`,
  `scripts/bench/sweep-forks.sh:17-47`
- 판단: 인접 `echo`를 shell group으로 묶어 ShellCheck `SC2129`를
  해소했을 뿐 command, run count, cold/warm 준비, output path와
  min/median/max 계산은 유지된다.
- 검증: 두 파일의 branch diff를 직접 검토했고 `bash -n`과 ShellCheck가
  통과했다. benchmark 자체는 공식 final gate가 아니며 새 측정값을
  만들기 위해 실행하지 않았다.

## 검증 명령과 결과

- `git status --short --branch`: 입력 후보 검토 시작 시 clean
- `git log --oneline origin/main..753e6ce0`: 전체 39개 branch commit 검토
- `git diff --stat origin/main..753e6ce0`: 50개 파일,
  5,564 insertions / 626 deletions
- `git diff --name-only origin/main..753e6ce0`: 전체 변경 경로 검토
- `git diff --check origin/main..753e6ce0`: PASS
- 계획의 CHANGELOG 및 broad release-risk keyword scan: 실행 완료
- `actionlint .github/workflows/ci.yml`: PASS
- `bash -n scripts/bench/measure-local.sh scripts/bench/sweep-forks.sh`: PASS
- `shellcheck scripts/bench/measure-local.sh scripts/bench/sweep-forks.sh`: PASS
- recursive tracked shell count: 34
- Grafana workflow owner count: 1
- Phase 2/3/4 decision ledger와 final/mutation ledger field-shape scan:
  malformed row 0
- changed production Kotlin/frontend/BFF/operational migration/deploy/
  architecture-baseline count: 모두 0
- Task 5 resolution scope: `CHANGELOG.md`와 이 review report만 변경,
  staged diff check PASS

## Skipped validation과 handoff

Phase 5 Task 4에서 같은 후보의 frontend lint/coverage/build, design,
server integration, full E2E, CT, script/config validator, public-release
gate를 fresh 실행했으므로 이 검토는 finding이 요구하지 않는 heavy
gate를 반복하지 않았다. 릴리스 기록과 review report 변경 뒤
candidate build/scanner와 targeted docs safety scan을 다시 실행했고
모두 통과했다. 두 문서는 기존 manifest에서 명시적으로 제외된다.

이 계획은 merge, push, PR, tag, publish, deploy를 금지한다. 따라서
실제 GitHub Actions 결과, live OAuth/provider/mail, production smoke는
위 Low residual과 release handoff로 남긴다.
