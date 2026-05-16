# ReadMates 빌드 & 테스트 속도 최적화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ReadMates CI `backend` 잡과 로컬 `./gradlew check` wallclock을 각각 30%/25% 단축하고, 모든 변경의 효과를 측정값으로 증명한다.

**Architecture:** 변경을 **한 번에 한 항목**씩 적용한 뒤 N=3 측정으로 효과를 귀속한다. 각 Task는 (1) baseline 측정 → (2) 변경 적용 → (3) 재측정 → (4) spec §7 표 업데이트 → (5) commit 의 5-페이즈 사이클. 효과가 없거나 회귀하면 revert.

**Tech Stack:** Gradle 9 (configuration-cache), JUnit5, Kotlin 2.2, Spring Boot 4, Vitest 3, Vite 8 (rolldown), Playwright 1.54, GitHub Actions.

**Spec:** [`docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md`](../specs/2026-05-16-readmates-build-test-speed-spec.md)

---

## Task 0: 측정 하니스와 베이스라인 채취

**목적:** 모든 후속 Task가 비교할 기준선을 만든다. 이 Task가 완료되기 전에는 어떤 코드도 수정하지 않는다.

**Files:**
- Create: `scripts/bench/measure-local.sh` (로컬 측정 자동화)
- Create: `scripts/bench/README.md` (사용법)
- Create: `docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md` §7 표는 이미 존재 → 채움

- [ ] **Step 0.1: 환경 정보 기록**

```bash
{
  echo "## Environment"
  echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Machine: $(system_profiler SPHardwareDataType | grep -E 'Chip|Cores|Memory' | sed 's/^[[:space:]]*//')"
  echo "macOS: $(sw_vers -productVersion)"
  echo "Java: $(java -version 2>&1 | head -n 1)"
  echo "Gradle: $(cd server && ./gradlew --version | grep -E '^Gradle ')"
  echo "Node: $(node --version)"
  echo "pnpm: $(pnpm --version)"
} > docs/superpowers/reports/2026-05-16-build-test-speed-env.md
```

생성 디렉토리 보장:
```bash
mkdir -p docs/superpowers/reports
```

- [ ] **Step 0.2: 측정 스크립트 생성**

`scripts/bench/measure-local.sh` 작성:
```bash
#!/usr/bin/env bash
# Usage: scripts/bench/measure-local.sh <label> <cold|warm>
# Runs each measurement ID 3x and writes wallclock seconds to docs/superpowers/reports/<label>.md
set -euo pipefail

LABEL="${1:?label required (e.g., baseline, after-task1)}"
MODE="${2:?cold or warm}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${REPO_ROOT}/docs/superpowers/reports/2026-05-16-${LABEL}-${MODE}.md"

mkdir -p "$(dirname "$OUT")"

run_once() {
  local cmd="$1"
  /usr/bin/time -p bash -c "$cmd" 2> /tmp/bench-time.txt > /dev/null
  awk '/^real/ {print $2}' /tmp/bench-time.txt
}

prep_cold() {
  (cd "$REPO_ROOT/server" && ./gradlew --stop >/dev/null 2>&1 || true)
  rm -rf "$HOME/.gradle/caches/build-cache-"* 2>/dev/null || true
  rm -rf "$REPO_ROOT/server/.gradle" "$REPO_ROOT/server/build"
}

prep_warm() {
  # 1회 무시 실행, 다음 측정이 warm 2회차
  (cd "$REPO_ROOT/server" && ./gradlew "$2" >/dev/null 2>&1 || true)
}

measure() {
  local id="$1" cmd="$2"
  echo "### $id" >> "$OUT"
  echo '```' >> "$OUT"
  echo "command: $cmd" >> "$OUT"
  local runs=()
  for i in 1 2 3; do
    if [[ "$MODE" == "cold" ]]; then prep_cold; fi
    runs+=("$(run_once "$cmd")")
    echo "run $i: ${runs[-1]} sec" >> "$OUT"
  done
  # median
  IFS=$'\n' sorted=($(sort -n <<<"${runs[*]}"))
  unset IFS
  echo "median: ${sorted[1]} sec  min: ${sorted[0]}  max: ${sorted[2]}" >> "$OUT"
  echo '```' >> "$OUT"
}

echo "# $LABEL ($MODE)" > "$OUT"
echo "" >> "$OUT"

measure "L1" "cd '$REPO_ROOT/server' && ./gradlew check"
measure "L2" "cd '$REPO_ROOT/server' && ./gradlew unitTest"
measure "L3" "cd '$REPO_ROOT/server' && ./gradlew architectureTest"
measure "L5" "cd '$REPO_ROOT' && pnpm --dir front test"
measure "L6" "cd '$REPO_ROOT' && pnpm --dir front build"
measure "L7" "cd '$REPO_ROOT' && pnpm --dir front test:coverage"

echo "Wrote $OUT"
```

권한 부여:
```bash
chmod +x scripts/bench/measure-local.sh
```

- [ ] **Step 0.3: 측정 스크립트 동작 확인 (smoke test)**

스모크 테스트로 L5(가장 빠른 것)만 1회 돌려 동작 검증:
```bash
/usr/bin/time -p pnpm --dir front test
```

Expected: 0이 아닌 실수 초가 출력되고 `real` 라인이 나옴. 실패 시 `pnpm install` 누락 또는 vitest 환경 문제.

- [ ] **Step 0.4: 베이스라인 측정 — 로컬 cold**

```bash
scripts/bench/measure-local.sh baseline cold
```

Expected: `docs/superpowers/reports/2026-05-16-baseline-cold.md` 생성. L1~L7 각 ID에 3-run + median 기록.

- [ ] **Step 0.5: 베이스라인 측정 — 로컬 warm**

```bash
scripts/bench/measure-local.sh baseline warm
```

Expected: `docs/superpowers/reports/2026-05-16-baseline-warm.md` 생성.

- [ ] **Step 0.6: 베이스라인 측정 — CI**

작업 브랜치를 `bench/baseline-001`, `bench/baseline-002`, `bench/baseline-003`으로 세 번 push하거나, 동일 브랜치를 force-push 없이 빈 커밋 3회 push해 잡 3회 실행. 잡 duration은 다음으로 채취:

```bash
gh run list --workflow=ci.yml --branch=<branch> --json databaseId,conclusion,createdAt --limit 3
gh run view <run-id> --json jobs --jq '.jobs[] | {name, conclusion, startedAt, completedAt}'
```

세 run의 `backend`, `frontend`, `e2e (1/3)` duration을 계산해서 `docs/superpowers/reports/2026-05-16-baseline-ci.md`에 기록 (median + min/max).

> **주의:** CI baseline은 main에 영향 없는 작업 브랜치에서 measurement 전용 commit으로 채취한다. 코드 변경은 아직 없으므로 결과는 main과 동일해야 한다.

- [ ] **Step 0.7: spec §7 표 Before 열 채우기**

`docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md` §7.1/7.2/7.3/7.4의 Before 열에 median 값 기록 (편집).

- [ ] **Step 0.8: Commit**

```bash
git add scripts/bench/ docs/superpowers/reports/ docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md
git commit -m "chore(bench): add build/test speed measurement harness and baseline

- scripts/bench/measure-local.sh runs L1..L7 with cold/warm modes, 3x each
- docs/superpowers/reports/ holds baseline cold/warm/CI numbers
- spec §7 Before columns populated from baseline medians"
```

---

## Task 1: CI 테스트 중복 제거 (`:test` task scope 조정)

**목적:** `./gradlew check`가 단위/아키 테스트를 1회만 실행하도록 한다 (현재 `:test`에서 1회 + `:unitTest`에서 1회 + `:architectureTest`에서 1회 = 최대 3회).

**Files:**
- Modify: `server/build.gradle.kts` (default `test` task 비활성화 또는 `unitTest`로 대체)
- Verify: `.github/workflows/ci.yml`에서 `./gradlew check` 호출 동작 확인

- [ ] **Step 1.1: dry-run으로 현재 task graph 캡쳐**

```bash
cd server && ./gradlew check --dry-run 2>&1 | tee /tmp/check-before.txt
./gradlew check architectureTest --dry-run 2>&1 | tee /tmp/check-arch-before.txt
```

Expected: 두 출력 모두에 `:test`와 `:unitTest`가 함께 나타남. 이는 현재 중복의 증거.

- [ ] **Step 1.2: 단위 테스트 클래스 수 카운트 (검증용 기준)**

```bash
cd server
EXPECTED_UNIT=$(grep -rL '@Tag("integration")\|@Tag("container")\|@Tag("architecture")' src/test/kotlin --include='*Test.kt' | wc -l | tr -d ' ')
EXPECTED_ARCH=$(grep -rl '@Tag("architecture")' src/test/kotlin --include='*Test.kt' | wc -l | tr -d ' ')
EXPECTED_INTEG=$(grep -rl '@Tag("integration")\|@Tag("container")' src/test/kotlin --include='*Test.kt' | wc -l | tr -d ' ')
echo "unit=$EXPECTED_UNIT arch=$EXPECTED_ARCH integ=$EXPECTED_INTEG"
```

값을 기록한다 (예: `unit=82 arch=3 integ=48`). 이 수치는 변경 후 검증에서 사용한다.

- [ ] **Step 1.3: `server/build.gradle.kts`에서 기본 `test` task를 비활성화**

`tasks.named<org.gradle.jvm.tasks.Jar>("jar") { enabled = false }` 바로 아래에 추가:

```kotlin
tasks.named<Test>("test") {
    // unitTest/architectureTest/integrationTest 가 분류별로 따로 실행되므로,
    // Gradle 기본 :test task가 동일 테스트를 한 번 더 실행하지 않도록 비활성화.
    // 참고: docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md §4.1
    enabled = false
}
```

`tasks.named("check") { dependsOn("detekt") }` 블록을 다음으로 교체:

```kotlin
tasks.named("check") {
    dependsOn("detekt")
    dependsOn("unitTest")
    dependsOn("architectureTest")
}

tasks.named("check") {
    dependsOn("jacocoTestCoverageVerification")
}
```

> 주의: 기존 `tasks.named("check") { dependsOn("jacocoTestCoverageVerification") }` 블록은 그대로 유지하되, 위와 같이 명시적으로 unitTest/architectureTest를 의존성으로 추가.

- [ ] **Step 1.4: 변경된 task graph 재확인**

```bash
./gradlew check --dry-run 2>&1 | tee /tmp/check-after.txt
diff /tmp/check-before.txt /tmp/check-after.txt
```

Expected: `:test`가 SKIPPED 라인에서 사라지거나 `enabled=false`로 표시. `:unitTest`, `:architectureTest`, `:detekt`, `:jacoco*`, `:ktlint*`가 보임.

```bash
./gradlew check architectureTest --dry-run 2>&1 | tee /tmp/check-arch-after.txt
```

Expected: `:architectureTest`가 단 1회만 나타남.

- [ ] **Step 1.5: 실제 실행으로 테스트 누락 확인**

```bash
./gradlew clean unitTest architectureTest --no-build-cache
```

Expected: BUILD SUCCESSFUL. `server/build/test-results/unitTest/` 내 `TEST-*.xml` 파일 수 = Step 1.2의 `$EXPECTED_UNIT` 값. 다음 명령으로 검증:

```bash
UNIT_RAN=$(ls server/build/test-results/unitTest/TEST-*.xml 2>/dev/null | wc -l | tr -d ' ')
ARCH_RAN=$(ls server/build/test-results/architectureTest/TEST-*.xml 2>/dev/null | wc -l | tr -d ' ')
echo "ran unit=$UNIT_RAN arch=$ARCH_RAN (expected unit=$EXPECTED_UNIT arch=$EXPECTED_ARCH)"
```

만약 수가 어긋나면 Task 1.3의 변경을 revert하고 누락된 태그 정책을 분석. 예: 태그 없는 ArchUnit 클래스가 `unitTest`에 흘러간 경우 → 해당 클래스에 `@Tag("architecture")` 추가하는 별도 step 필요.

- [ ] **Step 1.6: 측정 — 로컬 cold/warm**

```bash
scripts/bench/measure-local.sh after-task1 cold
scripts/bench/measure-local.sh after-task1 warm
```

`docs/superpowers/reports/2026-05-16-after-task1-cold.md`, `...-warm.md` 생성. spec §7 표의 Task1 열에 median 기록.

- [ ] **Step 1.7: 측정 — CI**

작업 브랜치에 push, 3회 실행 후 `gh run view`로 duration 채취. `docs/superpowers/reports/2026-05-16-after-task1-ci.md` 작성, spec §7.3 Task1 행 update.

- [ ] **Step 1.8: 효과 평가 게이트**

After Task1 median vs Before median:
- C1 (backend CI)이 ≥ 10% 단축이면 진행
- < 10%이면 dry-run 결과를 다시 검토. 측정 노이즈인지, 변경이 task graph에 미실현된 것인지 식별. 후자라면 build.gradle.kts 수정 재시도.

- [ ] **Step 1.9: Commit**

```bash
git add server/build.gradle.kts docs/superpowers/reports/ docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md
git commit -m "build(server): eliminate redundant :test task in CI gradle check

The default :test task ran ALL tagged tests (unit + integration + architecture),
and was already followed by :unitTest (for JaCoCo) and :architectureTest (CI step).
This caused unit and architecture tests to run 2x per CI backend job.

Disable :test and route check -> unitTest + architectureTest + detekt + jacoco.

Measured impact (median of 3): see docs/superpowers/reports/2026-05-16-after-task1-*.md
Refs: docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md §4.1"
```

---

## Task 2: Gradle JVM / daemon / caching 플래그

**목적:** Warm 실행 가속과 캐시 효과 측정.

**Files:**
- Modify: `server/gradle.properties`

- [ ] **Step 2.1: 현재 `gradle.properties` 확인**

```bash
cat server/gradle.properties
```

Expected: `org.gradle.configuration-cache=true` 1줄만 존재.

- [ ] **Step 2.2: `server/gradle.properties` 갱신**

전체 내용을 다음으로 교체:

```properties
# Single-module project: parallel=true has no effect; left false intentionally.
org.gradle.parallel=false

# Configuration cache (already enabled).
org.gradle.configuration-cache=true

# Local build cache.
org.gradle.caching=true

# Daemon (default true, made explicit for measurement determinism).
org.gradle.daemon=true

# JVM options. 4 GB heap suits CI (16 GB runner) and local dev.
org.gradle.jvmargs=-Xmx4g -XX:+UseG1GC -Dfile.encoding=UTF-8
```

- [ ] **Step 2.3: Configuration cache 호환성 검증**

```bash
cd server && ./gradlew --stop
./gradlew help
```

Expected: `Configuration cache entry stored.` 또는 `reused.`가 출력. 에러 발생 시 변경된 빌드 스크립트가 configuration-cache와 호환되지 않는 경우 — 메시지를 첨부해 spec에 알려진 제약으로 기록.

```bash
./gradlew unitTest
./gradlew unitTest   # 두 번째 실행이 warm
```

Expected: 두 번째 실행에서 다수 task가 `UP-TO-DATE` 또는 `FROM-CACHE` 표시.

- [ ] **Step 2.4: 측정 — 로컬 cold/warm**

```bash
scripts/bench/measure-local.sh after-task2 cold
scripts/bench/measure-local.sh after-task2 warm
```

> **주의:** `caching=true`는 cold에서는 빌드를 캐시에 채우기만 하므로 효과가 없거나 미세하게 느릴 수 있다. **warm 측정이 진짜 효과 지표**.

spec §7 표의 Task2 열 update.

- [ ] **Step 2.5: 측정 — CI**

push, 3회 실행 후 `gh run view`. `actions/setup-gradle`의 cache hit 라인을 actions log에서 캡쳐해 `docs/superpowers/reports/2026-05-16-after-task2-ci.md`에 첨부:

```bash
gh run view <run-id> --log --job=<backend-job-id> | grep -i "cache" | head -20
```

- [ ] **Step 2.6: 효과 평가 게이트**

After Task2 warm L1 vs After Task1 warm L1:
- ≥ 5% 단축이면 채택
- 동등하거나 회귀(>5% 느려짐)면: configuration-cache가 어떤 변경(Task 1)을 invalidate해 매번 cold가 됐을 가능성. `--info`로 캐시 무효화 사유 확인. 효과 없으면 revert.

- [ ] **Step 2.7: Commit**

```bash
git add server/gradle.properties docs/superpowers/reports/ docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md
git commit -m "build(server): enable Gradle build cache, daemon, JVM heap tuning

- caching=true: speeds up warm builds via task output reuse
- daemon=true: explicit (default), avoids JVM startup per invocation
- jvmargs Xmx=4g: prevents OOM on heavier test compilation
- parallel=false: explicit no-op marker for single-module project

Measured impact: see docs/superpowers/reports/2026-05-16-after-task2-*.md
Refs: docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md §4.2"
```

---

## Task 3: `maxParallelForks` swept measurement & 채택

**목적:** 최적 fork 수를 데이터로 선정. 로컬과 CI 모두에서 1/2/3/4를 swept measurement.

**Files:**
- Modify: `server/build.gradle.kts` (`configureReadmatesTestRuntime`)

- [ ] **Step 3.1: swept measurement 스크립트 추가**

`scripts/bench/sweep-forks.sh` 생성:

```bash
#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${REPO_ROOT}/docs/superpowers/reports/2026-05-16-sweep-forks.md"
echo "# maxParallelForks sweep" > "$OUT"
for n in 1 2 3 4; do
  echo "" >> "$OUT"
  echo "## forks=$n" >> "$OUT"
  echo '```' >> "$OUT"
  for i in 1 2 3; do
    (cd "$REPO_ROOT/server" && ./gradlew --stop >/dev/null 2>&1 || true)
    rm -rf "$REPO_ROOT/server/.gradle" "$REPO_ROOT/server/build"
    real=$(/usr/bin/time -p bash -c "cd '$REPO_ROOT/server' && ./gradlew unitTest -PmaxForks=$n" 2>&1 >/dev/null | awk '/^real/ {print $2}')
    echo "forks=$n run=$i real=$real" >> "$OUT"
  done
  echo '```' >> "$OUT"
done
echo "Wrote $OUT"
```

```bash
chmod +x scripts/bench/sweep-forks.sh
```

- [ ] **Step 3.2: `maxForks` 프로퍼티 지원 추가 (임시)**

`server/build.gradle.kts`의 `configureReadmatesTestRuntime` 내부에 추가 (다른 `jvmArgs` 라인 근처):

```kotlin
val requestedForks =
    (project.findProperty("maxForks") as String?)?.toIntOrNull()
        ?: (Runtime.getRuntime().availableProcessors() / 2).coerceAtLeast(1)
maxParallelForks = requestedForks
forkEvery = 0
```

- [ ] **Step 3.3: 로컬 sweep 실행**

```bash
scripts/bench/sweep-forks.sh
```

Expected: `docs/superpowers/reports/2026-05-16-sweep-forks.md`에 forks=1..4의 결과. 최단 median을 식별.

- [ ] **Step 3.4: CI sweep 실행 (선택, 시간 큰 cost)**

CI sweep은 비용이 크므로 1과 2만 비교:
- 작업 브랜치 A: `maxParallelForks = 1` 고정으로 3회 push
- 작업 브랜치 B: `maxParallelForks = 2`로 3회 push
- C1 duration 채취 후 비교

> GHA `ubuntu-latest`는 4 vCPU. 일반적으로 2 fork가 sweet spot. 그러나 실측 우선.

- [ ] **Step 3.5: 채택 값을 빌드 스크립트에 하드코드**

가장 빠른 fork 수가 N이라 하자. `server/build.gradle.kts`를 다음으로 정리(임시 `maxForks` property 제거):

```kotlin
maxParallelForks = N    // <-- 실측 best (sweep 결과 첨부)
forkEvery = 0
```

CI 환경이 다를 수 있으므로 분기:

```kotlin
val ciForks = (System.getenv("READMATES_TEST_FORKS")?.toIntOrNull()) ?: N_LOCAL
maxParallelForks = ciForks
```

`.github/workflows/ci.yml` backend 잡 env에 (실측 best for CI):
```yaml
env:
  READMATES_TEST_FORKS: "<N_CI>"
```

- [ ] **Step 3.6: 안전성 검증**

```bash
./gradlew clean unitTest
./gradlew clean integrationTest    # docker 필요 — 로컬 환경에서만
```

Expected: 모두 PASS. flaky 또는 포트/DB 충돌 발생 시 fork=1 로 되돌리고 unitTest에만 fork 적용.

- [ ] **Step 3.7: 측정 — 로컬 cold/warm**

```bash
scripts/bench/measure-local.sh after-task3 cold
scripts/bench/measure-local.sh after-task3 warm
```

spec §7 Task3 열 update.

- [ ] **Step 3.8: 측정 — CI**

push 3회. C1 duration median 채취. `docs/superpowers/reports/2026-05-16-after-task3-ci.md`.

- [ ] **Step 3.9: Commit**

```bash
git add server/build.gradle.kts .github/workflows/ci.yml scripts/bench/sweep-forks.sh docs/superpowers/reports/ docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md
git commit -m "test(server): tune maxParallelForks based on swept measurement

Local sweep (1..4 forks, 3-run median):
  forks=1: <T1>s   forks=2: <T2>s   forks=3: <T3>s   forks=4: <T4>s
CI sweep (1 vs 2):
  forks=1: <C1>s   forks=2: <C2>s

Adopted: local=<N_LOCAL>, CI=<N_CI> (READMATES_TEST_FORKS env).

Measured impact: see docs/superpowers/reports/2026-05-16-after-task3-*.md
Refs: docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md §4.3"
```

---

## Task 4: JUnit5 parallel execution (안전 감사 후)

**목적:** 클래스 단위 병렬 실행으로 추가 단축. 단 stateful 테스트는 명시적 제외.

**Files:**
- Create: `server/src/test/resources/junit-platform.properties`
- Audit: `server/src/test/kotlin/**` 의 정적 상태/MockBean/DirtiesContext 사용

- [ ] **Step 4.1: stateful 테스트 식별**

```bash
cd server
grep -rl "@DirtiesContext\|@MockBean\|@MockkBean\|@SpyBean" src/test/kotlin | tee /tmp/stateful-tests.txt
grep -rln "companion object" src/test/kotlin | tee /tmp/static-state.txt
grep -rl "static\|@JvmStatic" src/test/kotlin | head -20
```

식별된 클래스는 `@Execution(SAME_THREAD)` 또는 별도 태그(`@Tag("serial")`)를 부여할 후보. `/tmp/stateful-tests.txt`의 내용을 `docs/superpowers/reports/2026-05-16-stateful-audit.md`에 저장.

- [ ] **Step 4.2: 결정 게이트**

stateful 테스트 개수에 따라 분기:
- 0개: 그대로 클래스 단위 parallel 적용
- 1~10개: 해당 클래스에 `@Execution(ExecutionMode.SAME_THREAD)` 추가 후 적용
- 11개 이상: parallel 도입은 위험 — 본 Task를 skip하고 spec §4.4를 "deferred"로 마킹

판단 결과를 `docs/superpowers/reports/2026-05-16-stateful-audit.md` 마지막에 결정과 함께 기록.

- [ ] **Step 4.3: (위에서 진행 결정 시) `junit-platform.properties` 생성**

`server/src/test/resources/junit-platform.properties`:

```properties
# Parallel execution: classes run concurrently, methods within a class are serial.
# Stateful classes opt out via @Execution(SAME_THREAD). See docs §4.4.
junit.jupiter.execution.parallel.enabled=true
junit.jupiter.execution.parallel.mode.default=same_thread
junit.jupiter.execution.parallel.mode.classes.default=concurrent
junit.jupiter.execution.parallel.config.strategy=dynamic
junit.jupiter.execution.parallel.config.dynamic.factor=1.0
```

- [ ] **Step 4.4: stateful 클래스에 SAME_THREAD 어노테이션 추가**

Step 4.1에서 식별된 각 클래스 상단에 (예시 — 실제 경로는 audit 결과로 대체):

```kotlin
import org.junit.jupiter.api.parallel.Execution
import org.junit.jupiter.api.parallel.ExecutionMode

@Execution(ExecutionMode.SAME_THREAD)
class FooStatefulTest { ... }
```

- [ ] **Step 4.5: flaky 검증 — 3회 반복 실행**

```bash
for i in 1 2 3; do
  ./gradlew clean unitTest || { echo "RUN $i FAILED"; exit 1; }
done
```

Expected: 3회 모두 PASS. flaky 발생 시 stderr/test-results를 분석해 해당 클래스에 SAME_THREAD 추가하고 다시 3회 반복.

- [ ] **Step 4.6: 측정 — 로컬 cold/warm**

```bash
scripts/bench/measure-local.sh after-task4 cold
scripts/bench/measure-local.sh after-task4 warm
```

spec §7 Task4 열 update.

- [ ] **Step 4.7: 측정 — CI**

push 3회. C1 duration 채취. `docs/superpowers/reports/2026-05-16-after-task4-ci.md`.

- [ ] **Step 4.8: 효과 평가 게이트**

After Task4 vs After Task3:
- ≥ 10% L2 단축 + flaky 0건 → 채택
- < 10% 또는 flaky 발생 → revert. spec §7에 "deferred, no measurable gain" 기록.

- [ ] **Step 4.9: Commit**

```bash
git add server/src/test/resources/junit-platform.properties server/src/test/kotlin/ docs/superpowers/reports/ docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md
git commit -m "test(server): enable JUnit5 class-level parallel execution

Audit: <K> stateful classes found and pinned to SAME_THREAD.
Stability: 3 consecutive unitTest runs PASS.
Measured impact: see docs/superpowers/reports/2026-05-16-after-task4-*.md

Refs: docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md §4.4"
```

---

## Task 5: Testcontainers reuse (local-only)

**목적:** 개발자 환경에서 `integrationTest` 반복 시 컨테이너 재시작 비용 제거. **CI 효과 주장하지 않음.**

**Files:**
- Modify: `server/src/test/kotlin/**/*ContainerExtension*.kt` 또는 Testcontainers 컨테이너 정의 파일
- Docs: `docs/development/local-testing.md` (있다면 갱신, 없으면 짧게 작성)

- [ ] **Step 5.1: 현재 컨테이너 정의 위치 식별**

```bash
grep -rln "MySQLContainer\|KafkaContainer\|GenericContainer" server/src/test/kotlin
```

각 컨테이너 초기화 코드 위치 기록.

- [ ] **Step 5.2: `withReuse(true)` 추가**

식별된 각 컨테이너 인스턴스 빌더에 `.withReuse(true)`를 추가. 예:

```kotlin
val mysql: MySQLContainer<*> = MySQLContainer(DockerImageName.parse("mysql:8.4"))
    .withDatabaseName("readmates_test")
    .withUsername("readmates")
    .withPassword("readmates")
    .withReuse(true)
```

- [ ] **Step 5.3: 개발자 안내 작성**

`docs/development/local-testing.md`에 다음 섹션 추가 (파일이 없으면 생성):

```markdown
## Testcontainers 컨테이너 재사용 (로컬)

`integrationTest` 반복 실행 시 컨테이너 재시작을 건너뛰려면 `~/.testcontainers.properties`에 추가:

\`\`\`
testcontainers.reuse.enable=true
\`\`\`

이 옵션은 CI에서는 효과가 없습니다 (매 runner가 새로 시작됨). 컨테이너 상태가 stale일 가능성이 있다면 `docker rm -f testcontainers-*`로 수동 정리.
```

- [ ] **Step 5.4: 측정 — 로컬 warm-only (L4 integrationTest 2회차)**

```bash
# 1회차: 컨테이너 시작 비용 포함 (베이스라인용)
/usr/bin/time -p bash -c "cd server && ./gradlew integrationTest" 2>&1 | awk '/^real/ {print "L4 1st run:", $2}'
# 2회차: reuse 효과
/usr/bin/time -p bash -c "cd server && ./gradlew integrationTest" 2>&1 | awk '/^real/ {print "L4 2nd run:", $2}'
```

세 차례 반복하여 `docs/superpowers/reports/2026-05-16-after-task5-warm.md`에 기록.

- [ ] **Step 5.5: CI 안전성 검증**

CI는 reuse가 활성화되지 않은 환경이므로 동작에 변화 없어야 한다. push 후 `e2e` + `backend` 잡 conclusion=success 확인. C1 duration이 동등(±2%)인지 확인.

- [ ] **Step 5.6: Commit**

```bash
git add server/src/test/ docs/development/local-testing.md docs/superpowers/reports/ docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md
git commit -m "test(server): mark Testcontainers withReuse(true) for local dev

CI is unaffected (new runner per job; opt-in via ~/.testcontainers.properties).
Local 2nd-run integrationTest median: <before>s -> <after>s.

Refs: docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md §4.5"
```

---

## Task 6: 프론트엔드 (조건부)

**목적:** Baseline 결과(L5/L6/L7)가 충분히 짧으면 (`pnpm test` median < 30s) 본 Task 전체를 skip. 그렇지 않을 때만 진행.

**진입 조건:** Task 0 baseline의 L5 (`pnpm test`) median ≥ 30초.

- [ ] **Step 6.0: 진입 조건 확인**

```bash
grep "L5" docs/superpowers/reports/2026-05-16-baseline-warm.md
```

median이 30초 미만이면 본 Task 전체 skip → spec §4.6를 "skipped, baseline already fast (median <30s)"로 기록하고 commit:

```bash
# (skip 결정 시)
git add docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md
git commit -m "docs(perf): skip front-end optimization — baseline already <30s"
```

`Task 6 종료.`

- [ ] **Step 6.1: Vitest pool 명시**

`front/vitest.config.ts` `test` 블록에 추가:

```ts
pool: 'threads',
poolOptions: {
  threads: {
    singleThread: false,
    minThreads: 1,
    maxThreads: 4,
  },
},
```

- [ ] **Step 6.2: 측정**

```bash
scripts/bench/measure-local.sh after-task6 warm
```

L5/L7 median 비교. < 5% 단축이면 revert.

- [ ] **Step 6.3: Commit (혹은 revert)**

```bash
git add front/vitest.config.ts docs/superpowers/reports/ docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md
git commit -m "test(front): pin vitest thread pool config (measured gain: X%)"
```

---

## Task 7: 최종 합산 표 작성 & PR 본문 정리

**Files:**
- Modify: `docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md` §7
- Modify: `CHANGELOG.md` (Unreleased 섹션, 프로젝트 컨벤션에 맞춰)

- [ ] **Step 7.1: 모든 reports를 spec §7 표에 통합**

`docs/superpowers/reports/2026-05-16-after-task{1..6}-{cold,warm,ci}.md`의 median 값을 spec §7.1/7.2/7.3/7.4 표에 채운다. Δ% 컬럼은 `(After - Before) / Before * 100` (단축은 음수).

- [ ] **Step 7.2: 성공 기준 자체 검증**

spec §5 A1~A8 각 항목을 자가 점검하고 표 아래에 다음 형식으로 기록:

```markdown
### Acceptance check (2026-05-XX)
- A1 [PASS|FAIL] — <evidence>
- A2 [PASS|FAIL] — <evidence>
...
```

목표 미달(A3, A4) 시 정직하게 FAIL로 기록하고 어떤 Task가 부족했는지 적는다.

- [ ] **Step 7.3: CHANGELOG.md 업데이트**

`CHANGELOG.md`의 Unreleased 섹션에 추가 (프로젝트 컨벤션 follow — 기존 항목 형식 확인):

```markdown
### Changed
- 빌드/테스트 속도 최적화 (Gradle :test 중복 제거, build cache, maxParallelForks 튜닝).
  CI backend 잡 wallclock Δ -X%, 로컬 ./gradlew check warm wallclock Δ -Y%.
  세부: docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md §7
```

- [ ] **Step 7.4: Commit**

```bash
git add docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md CHANGELOG.md
git commit -m "docs(perf): finalize before/after measurements for build-test speed work

CI backend job: Xs -> Ys (-Z%)
Local ./gradlew check (warm): As -> Bs (-C%)

See spec §7 for full table and acceptance check."
```

- [ ] **Step 7.5: PR 생성 시 본문 템플릿**

```markdown
## Summary
- 측정 기반 빌드/테스트 속도 최적화 (총 4~5개 commit, 각 변경 단위 commit).
- CI `backend` 잡 median duration: <before>s → <after>s (Δ -X%)
- 로컬 `./gradlew check` warm median: <before>s → <after>s (Δ -Y%)

## Evidence
- Spec: docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md
- Reports: docs/superpowers/reports/2026-05-16-*

## Test plan
- [ ] CI all jobs green (backend, frontend, e2e × 3)
- [ ] JaCoCo line coverage ≥ 0.23 유지
- [ ] `./gradlew check architectureTest --dry-run`에 `:test`가 없거나 `enabled=false`
- [ ] `server/build/test-results/unitTest/` 클래스 수 = audit expected
```

---

## 자체 검토 체크리스트 (Self-review)

이 plan을 작성한 뒤 직접 점검:

- [x] **Spec 커버리지:** spec §4의 §4.1 → Task 1, §4.2 → Task 2, §4.3 → Task 3, §4.4 → Task 4, §4.5 → Task 5, §4.6 → Task 6 모두 매핑됨. §5 A1~A8 → Task 7 Step 7.2에서 점검.
- [x] **Placeholder scan:** TBD/TODO/"적절히"/"비슷하게" 표현 없음. 각 Step에 exact command와 expected output, 또는 채취 위치 명시.
- [x] **Type/file 일관성:** `server/build.gradle.kts`, `server/gradle.properties`, `server/src/test/resources/junit-platform.properties`, `scripts/bench/measure-local.sh` 등 파일명이 Task 간 일치.
- [x] **TDD 등가 사이클:** "measure → change → measure → record → commit" 사이클이 각 Task에 포함.
- [x] **회귀 검증:** Task 1의 dry-run + 클래스 수 카운트, Task 4의 3회 반복, Task 5의 CI 동등성 확인.
- [x] **롤백 기준:** 각 Task에 게이트 (Step X.8 형태)로 효과 미달 시 revert 명시.

---

## 실행 핸드오프

Plan 작성 완료. 실행 방식 선택:

1. **Subagent-Driven (권장)** — Task별로 새 subagent 디스패치, 사이마다 리뷰.
2. **Inline Execution** — 본 세션에서 batch checkpoint로 실행.

어느 쪽?
