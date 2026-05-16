# ReadMates 빌드 & 테스트 속도 최적화 Spec

**작성일:** 2026-05-16
**구현 계획:** [`docs/superpowers/plans/2026-05-16-readmates-build-test-speed-implementation-plan.md`](../plans/2026-05-16-readmates-build-test-speed-implementation-plan.md)
**관련 워크플로:** `.github/workflows/ci.yml`, `server/build.gradle.kts`, `front/vite.config.ts`, `front/vitest.config.ts`, `front/playwright.config.ts`

---

## 1. 배경

현재 CI 파이프라인은 5개 잡(`scripts`, `public-release`, `frontend`, `backend`, `e2e` × 3 shard)으로 구성된다. 사용자 체감 병목은 `backend`(`./gradlew check` + `architectureTest`)와 `e2e` 잡이며, 로컬 개발에서도 `./gradlew check`는 누적 시간이 길다.

코드 정독(`server/build.gradle.kts`)과 `--dry-run` task graph 검증으로 다음 사실을 확인했다:

```text
$ ./gradlew check --dry-run
:detekt
:compileKotlin → :classes → :jar
:compileTestKotlin → :testClasses
:test                            # ← Gradle 기본 task. 필터 없음 → 모든 태그 실행
:unitTest                        # ← @Tag 미지정 + non-integration/container/architecture
:jacocoTestReport
:jacocoTestCoverageVerification
:ktlint*  (5 task)
:check

$ ./gradlew check architectureTest --dry-run
... (위와 동일) ...
:architectureTest                # ← @Tag("architecture")만
```

즉 한 번의 CI `backend` 잡에서 다음이 일어난다:

| 테스트 카테고리        | `:test`에서 실행 | `:unitTest`에서 실행 | `:architectureTest`에서 실행 | 합계 실행 횟수 |
|----------------------|----------------|-------------------|--------------------------|--------------|
| 단위 (tag 없음)        | ✅              | ✅                 | -                        | **2회**      |
| Integration/Container | ✅              | -                 | -                        | 1회          |
| Architecture          | ✅              | -                 | ✅                        | **2회**      |

JaCoCo는 `unitTest` 결과만 사용하므로 `:test`에서 단위·아키 테스트가 한 번 더 도는 것은 **순수 낭비**다. 또한 `server/gradle.properties`에는 `org.gradle.configuration-cache=true` 한 줄뿐이고, `parallel`/`caching`/`jvmargs`/JUnit5 parallel execution은 미설정이다. `Test` task의 `maxParallelForks`도 기본값(=1)을 사용한다.

프론트엔드는 이미 Vite 8 + rolldown, Vitest projects (node/jsdom 분리), Playwright `fullyParallel`, E2E 3-way sharding이 적용돼 있어 개선 폭이 상대적으로 작다.

## 2. 목표 / 비목표

### 목표
1. **CI `backend` 잡 wallclock 30% 이상 단축** (단일 CI 실행 기준, GitHub Actions UI duration 측정)
2. **CI `backend` 잡의 테스트 중복 0건** — task graph에서 단위/아키 테스트가 정확히 1회 실행
3. **로컬 `./gradlew check` warm-cache wallclock 25% 이상 단축**
4. **모든 변경에 대해 변경 전/후 측정값 수치를 spec과 plan에 기록** — 주관 기술이 아닌 데이터로 효과 증명

### 비목표 (Out of scope)
- Detekt/ktlint 자체 룰 셋 변경 (정적 분석은 캐시·incremental 만 활용)
- 테스트 자체의 비즈니스 로직 리팩터링 (느린 테스트는 식별만 하고 별도 후속으로 다룸)
- Cloudflare Pages Functions/BFF 런타임 최적화
- Docker 이미지 빌드(`Dockerfile.release`) 최적화 — 별도 영역
- Public-release 검사 잡 변경

## 3. 측정 방법론 (Measurement protocol)

> 모든 효과 주장은 아래 프로토콜로 채취한 숫자를 spec/plan 표에 기록한 뒤에만 한다.

### 3.1 환경 고정
- **로컬:** 측정 시 `software_version`, `system_profiler SPHardwareDataType | grep -E "Chip|Cores"`, `java -version`, `./gradlew --version` 기록.
- **CI:** GitHub Actions `ubuntu-latest` (현 시점 `ubuntu-24.04`, 4 vCPU, 16 GB). 측정용 워크플로 호출은 동일 시간대(서버 부하 변동을 줄이기 위해 1시간 이내) 내에서 N회 실행.

### 3.2 반복 횟수
- **N = 3회 이상**. 결과는 **median**을 채택하고 min/max도 표에 기록. 단일 측정값은 사용 금지.

### 3.3 Cold vs Warm
- **Cold (cache 없음)**: `./gradlew --stop` 실행 후 `rm -rf ~/.gradle/caches/build-cache-*` 및 `server/.gradle`, `server/build` 삭제 후 측정.
- **Warm (caches 따뜻함)**: 동일 명령을 2회 연속 실행, **2회차** 측정값 채택.
- 캐시 변경(Task 2)을 측정할 때는 **둘 다** 기록한다. CI는 cold에 가깝지만, `actions/setup-gradle`의 cache hit 여부가 양상에 영향을 준다 — actions log의 cache restore line도 함께 첨부.

### 3.4 측정 대상 명령
| ID  | 명령                                                                  | 환경        |
|-----|--------------------------------------------------------------------|------------|
| L1  | `cd server && ./gradlew check`                                       | 로컬        |
| L2  | `cd server && ./gradlew unitTest`                                    | 로컬        |
| L3  | `cd server && ./gradlew architectureTest`                            | 로컬        |
| L4  | `cd server && ./gradlew integrationTest`                             | 로컬 (docker 필요) |
| L5  | `pnpm --dir front test`                                              | 로컬        |
| L6  | `pnpm --dir front build`                                             | 로컬        |
| L7  | `pnpm --dir front test:coverage`                                     | 로컬        |
| C1  | GitHub Actions `backend` 잡 duration                                 | CI         |
| C2  | GitHub Actions `frontend` 잡 duration                                | CI         |
| C3  | GitHub Actions `e2e (1/3)` 잡 duration (대표 shard)                  | CI         |

### 3.5 시간 측정 방법
- 로컬: `/usr/bin/time -p <command>` (`real`을 wallclock으로 기록). Gradle은 `--profile`로 task별 분포도 함께 채취해 HTML 첨부.
- CI: GitHub Actions UI의 잡별 duration. `gh run view <run-id> --json jobs --jq '.jobs[] | {name, conclusion, startedAt, completedAt}'`로 기계적 채취.

### 3.6 결과 기록 위치
- 각 Task의 "측정 결과" 섹션 (plan 문서)
- 최종 합산 표는 spec §7

## 4. 제안 변경 (ROI 순)

### 4.1 [P0] CI 테스트 중복 제거
**문제:** `:test`가 필터 없이 모든 태그를 실행 → 단위/아키 테스트가 `:unitTest`/`:architectureTest`와 중복.
**해결:** `tasks.named<Test>("test")`를 비활성화하거나 `unitTest`와 동일하게 필터링한다. CI에서는 `./gradlew check`를 호출하더라도 `:test`가 의미 있는 새 테스트를 돌리지 않도록 한다. `check` task 의존성을 `unitTest + architectureTest + detekt + ktlint*`로 명시적으로 구성한다.
**예상 효과:** 단위·아키 테스트 1회만 실행 — 백엔드 잡에서 단위/아키 테스트 양만큼의 시간 절감.
**리스크:** 누락된 태그(태그 없는 테스트가 `unitTest`에 포함되지만 `architectureTest`에는 빠지는지 등) 식별 필요.

### 4.2 [P1] Gradle JVM/daemon/caching 플래그
**변경:** `server/gradle.properties`에 추가
```
org.gradle.parallel=false      # 단일 모듈이라 의미 없음, 명시적으로 false 두어 의도 명확화
org.gradle.caching=true
org.gradle.daemon=true
org.gradle.jvmargs=-Xmx4g -XX:+UseG1GC -Dfile.encoding=UTF-8
```
**예상 효과:** Warm 실행에서 컴파일/리포트 task가 캐시 hit하여 단축. CI에서는 `actions/setup-gradle`이 자체적으로 cache를 관리하므로 옵션이 켜져 있는 것이 전제.
**리스크:** `caching=true`만 켜는 것으로는 first build가 캐시 채우는 데 시간 소요. **첫 실행 후 두 번째 실행**부터 효과 측정해야 한다.

### 4.3 [P1] Test JVM forks 튜닝
**변경:** `Test.configureReadmatesTestRuntime`에 `maxParallelForks` 추가.
```kotlin
maxParallelForks = (Runtime.getRuntime().availableProcessors() / 2).coerceAtLeast(1)
forkEvery = 0
```
**예상 효과:** 단위 테스트 wallclock 단축. 단 GitHub-hosted runner는 4 vCPU 한계라 2 fork 이상에서 수확체감 — **로컬과 CI에서 각각 1/2/3/4 swept measurement 필수**.
**리스크:** 정적 상태 공유, 파일 락, 포트 충돌. `unitTest`(stateless)부터 적용, `integrationTest`는 별도 평가.

### 4.4 [P2] JUnit5 parallel execution
**변경:** `server/src/test/resources/junit-platform.properties` 신규 작성:
```
junit.jupiter.execution.parallel.enabled=true
junit.jupiter.execution.parallel.mode.default=same_thread
junit.jupiter.execution.parallel.mode.classes.default=concurrent
junit.jupiter.execution.parallel.config.strategy=dynamic
```
즉, 클래스 단위 병렬, 메서드 내부는 직렬. `@Execution(CONCURRENT)`로 opt-in.
**예상 효과:** `maxParallelForks`와 곱 효과로 추가 단축. **단, `MockBean`, `@DirtiesContext`, static 공유 상태 테스트는 안전 감사 후 적용.**
**리스크:** 큼. 단위 테스트가 정말 stateless인지 검증 task가 선행되어야 한다.

### 4.5 [P2] Testcontainers reuse (local-only)
**변경:** `~/.testcontainers.properties`에 `testcontainers.reuse.enable=true` (개발자 환경) + `integrationTest` 컨테이너에 `.withReuse(true)`.
**예상 효과:** 로컬에서 반복 실행 시 컨테이너 재시작 비용 제거. **CI는 매번 새 runner라 효과 없음 — 주장하지 않음.**
**리스크:** stale 상태 잔존. 테스트 격리 검증 필요.

### 4.6 [P3] 프론트엔드
- `vitest.config.ts`에 `pool: 'threads'` 명시 + `poolOptions.threads.singleThread: false`
- Playwright `workers` CI 기본값(현재 `1`)을 2로 검토
- 베이스라인 결과가 충분히 짧으면 (`pnpm test` < 30s) **이 항목은 보류**한다 — diminishing return 명시.

## 5. 성공 기준 (Acceptance criteria)

| ID  | 기준                                                                                    | 검증 방법                                                                       |
|-----|----------------------------------------------------------------------------------------|------------------------------------------------------------------------------|
| A1  | `./gradlew check --dry-run` 결과에 `:test`가 없거나, 동일 필터의 `:unitTest`만 활성        | dry-run 출력 첨부                                                              |
| A2  | 단위 테스트가 CI 단일 잡에서 정확히 1회 실행                                                  | `server/build/test-results/unitTest/TEST-*.xml` 카운트 = arch 제외 단위 테스트 클래스 수 |
| A3  | C1 (`backend` CI 잡 duration) median이 baseline 대비 ≥ 30% 단축                          | 베이스라인 3회 / 적용 후 3회 → 표                                              |
| A4  | L1 (`./gradlew check` warm) median이 baseline 대비 ≥ 25% 단축                            | 베이스라인 3회 / 적용 후 3회 → 표                                              |
| A5  | 모든 단위 테스트 PASS, JaCoCo 라인 커버리지 기준 (0.23) 유지                                | 기존 `jacocoTestCoverageVerification` 통과                                     |
| A6  | 모든 integration/architecture 테스트 PASS                                                | 기존 CI 통과                                                                  |
| A7  | E2E 결과 변경 없음 (회귀 없음)                                                              | C3 동등 또는 단축, e2e 잡 conclusion=success                                 |
| A8  | spec §7 합산 표에 cold/warm × 로컬/CI × 각 task별 before/after 숫자가 채워짐                | 표 인스펙션                                                                  |

A3/A4 미달 시: 어느 변경이 효과가 없었는지 데이터로 식별하고, plan에서 해당 Task의 효과를 무효 처리(commit revert)한다. **목표 달성보다 진실된 측정 기록이 우선이다.**

## 6. 리스크와 롤백

| 위험                                                                | 완화                                                                         | 롤백                                                                  |
|--------------------------------------------------------------------|----------------------------------------------------------------------------|----------------------------------------------------------------------|
| `:test` 제거로 어떤 태그도 안 붙은 테스트가 누락                              | dry-run에서 단위 테스트 클래스 카운트 검증. Plan Task 1.0에 카운트 검증 step.       | `:test` task의 enabled = true 복원                                    |
| JUnit5 parallel로 flaky 발생                                          | parallel은 별도 task에서 일정 기간 dual-run; flaky 발견 시 rollback              | `junit-platform.properties` 삭제                                      |
| `maxParallelForks` 증가로 메모리 부족 (특히 GHA 4 GB heap 한계)              | swept measurement로 최적값 선정. `org.gradle.jvmargs` heap을 작게 유지            | `maxParallelForks = 1` 복원                                          |
| Testcontainers reuse stale state                                    | 컨테이너 라이프사이클 가이드 docs 추가, CI는 reuse 미사용                          | `withReuse(false)` 또는 `~/.testcontainers.properties` 제거            |
| Configuration cache + 변경된 build script 충돌                          | `--no-configuration-cache`로 fallback 가능. 변경 시 `./gradlew --recompile-scripts` 안내. | properties에서 `configuration-cache=false` 환원                       |

## 7. 효과 합산 표 (구현 후 채움)

> 모든 시간은 `/usr/bin/time -p` real(초), N=3 median. min/max는 plan 각 Task 결과 섹션에 보관.
>
> **상태 (2026-05-16):** Task 1–5 코드 변경은 branch `readmates-build-test-speed-20260516-123042`에 적용되어 있습니다. 본 표의 Before/After 셀은 휴먼 측정 패스에서 `scripts/bench/measure-local.sh`로 채취해 채웁니다 — 자세한 절차는 [`docs/superpowers/reports/2026-05-16-handoff.md`](../reports/2026-05-16-handoff.md). 측정 데이터가 채워지기 전까지 §5 A3 / A4 게이트는 미검증 상태입니다.

### 7.1 로컬 (Cold)
| 측정 ID | Before | Task1 | Task2 | Task3 | Task4 | Task5 | Final | Δ% |
|--------|--------|-------|-------|-------|-------|-------|-------|----|
| L1     |        |       |       |       |       |       |       |    |
| L2     |        |       |       |       |       |       |       |    |
| L3     |        |       |       |       |       |       |       |    |

### 7.2 로컬 (Warm, 2회차)
| 측정 ID | Before | Task1 | Task2 | Task3 | Task4 | Task5 | Final | Δ% |
|--------|--------|-------|-------|-------|-------|-------|-------|----|
| L1     |        |       |       |       |       |       |       |    |
| L2     |        |       |       |       |       |       |       |    |
| L3     |        |       |       |       |       |       |       |    |

### 7.3 CI (GitHub Actions duration, sec)
| 잡 / 측정 ID | Before (3-run median) | After (3-run median) | Δ% | 비고 |
|------------|--------------------|--------------------|----|------|
| C1 backend  |                    |                    |    |      |
| C2 frontend |                    |                    |    |      |
| C3 e2e 1/3  |                    |                    |    |      |

### 7.4 프론트엔드 (변경 적용한 경우)
| 측정 ID | Before | After | Δ% |
|--------|--------|-------|----|
| L5     |        |       |    |
| L6     |        |       |    |
| L7     |        |       |    |

## 8. 비용/위험 요약

- **개발 시간:** 1-2일 (각 Task의 baseline + apply + remeasure 사이클)
- **CI 추가 시간:** baseline 채취를 위해 main 브랜치 push 없이 작업 브랜치에서 3회 push 필요. 풀리퀘스트는 1개로 묶지 말고 **변경 단위로 나누어** 효과 귀속을 분리한다.
- **롤백 비용:** 각 Task는 독립 commit. revert 1회로 원복 가능.

## 9. 참고
- Gradle Build Cache: https://docs.gradle.org/current/userguide/build_cache.html
- JUnit5 parallel execution: https://junit.org/junit5/docs/current/user-guide/#writing-tests-parallel-execution
- Testcontainers reuse: https://java.testcontainers.org/features/reuse/
- GitHub-hosted runner specs: https://docs.github.com/actions/using-github-hosted-runners/about-github-hosted-runners
- 기존 CI 워크플로: `.github/workflows/ci.yml`
- 기존 빌드 스크립트: `server/build.gradle.kts:78-260`
