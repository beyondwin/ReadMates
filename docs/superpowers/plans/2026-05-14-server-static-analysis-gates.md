# Server Static Analysis & Coverage Gates Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** detekt (Kotlin static analysis) + ktlint (style) + JaCoCo (coverage) 를 도입해 PR 단위 정적 게이트를 추가한다. 임계값은 현재 baseline으로 시작해 회귀만 차단.

**Architecture:** Gradle 플러그인 3개 추가. 각 task는 `check` 라이프사이클에 연결. CI 의 server 잡에서 `check` 단일 호출로 실행.

**Tech Stack:** detekt 1.23+, ktlint Gradle plugin (Pinterest), JaCoCo (Gradle built-in), Kotlin 2.2, Spring Boot 4.

---

## 현재 상태

- `server/build.gradle.kts` 에 정적분석 / 커버리지 플러그인 없음 (Trivy CVE 제약은 잘 설정됨, line 25-41).
- 테스트는 unitTest / integrationTest / architectureTest 분리 (build.gradle.kts:111-141).

---

### Task 1: ktlint Gradle plugin 추가

**Files:**
- Modify: `server/build.gradle.kts`

- [ ] **Step 1: plugins 블록에 추가**

`server/build.gradle.kts` 의 `plugins { }` 안에 추가:

```kotlin
id("org.jlleitschuh.gradle.ktlint") version "12.1.1"
```

- [ ] **Step 2: 설정 블록 추가 (파일 하단)**

```kotlin
ktlint {
    version.set("1.3.1")
    android.set(false)
    ignoreFailures.set(false)
    filter {
        exclude("**/generated/**")
    }
    reporters {
        reporter(org.jlleitschuh.gradle.ktlint.reporter.ReporterType.PLAIN)
        reporter(org.jlleitschuh.gradle.ktlint.reporter.ReporterType.CHECKSTYLE)
    }
}
```

- [ ] **Step 3: 첫 실행 — 위반 측정**

```bash
cd server && ./gradlew ktlintCheck --continue
```

Expected: 위반 라인 출력 또는 0개. 위반이 있으면 다음 step.

- [ ] **Step 4: 자동 포맷 (있는 경우)**

```bash
cd server && ./gradlew ktlintFormat
```

Expected: 자동 수정 가능한 위반은 reformat. 남은 위반은 수동 수정 또는 baseline.

- [ ] **Step 5: 위반이 너무 많다면 baseline 생성**

```bash
cd server && ./gradlew ktlintGenerateBaseline
```

Expected: `server/config/ktlint/baseline.xml` 생성. 본 베이스라인은 PR에 포함 — 신규 위반만 차단.

- [ ] **Step 6: 재실행**

```bash
cd server && ./gradlew ktlintCheck
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 7: Commit**

```bash
git add server/build.gradle.kts server/config/ktlint/baseline.xml server/src
git commit -m "build(server): adopt ktlint with baseline for incremental rollout"
```

---

### Task 2: detekt plugin 추가

**Files:**
- Modify: `server/build.gradle.kts`
- Create: `server/config/detekt/detekt.yml`

- [ ] **Step 1: plugins 추가**

```kotlin
id("io.gitlab.arturbosch.detekt") version "1.23.7"
```

- [ ] **Step 2: 설정 추가**

```kotlin
detekt {
    toolVersion = "1.23.7"
    config.setFrom(files("$rootDir/config/detekt/detekt.yml"))
    buildUponDefaultConfig = true
    autoCorrect = false
    parallel = true
    source.setFrom(files("src/main/kotlin", "src/test/kotlin"))
    baseline = file("$rootDir/config/detekt/baseline.xml")
}

tasks.named("check") {
    dependsOn("detekt")
}
```

- [ ] **Step 3: 설정 파일 생성**

```bash
cd server && ./gradlew detektGenerateConfig
```

Expected: `server/config/detekt/detekt.yml` 생성.

- [ ] **Step 4: 첫 분석 + baseline 생성**

```bash
cd server && ./gradlew detektBaseline
```

Expected: `server/config/detekt/baseline.xml` 생성. 기존 위반 무시.

- [ ] **Step 5: 정상 check 실행**

```bash
cd server && ./gradlew detekt
```

Expected: BUILD SUCCESSFUL. 신규 위반만 fail.

- [ ] **Step 6: Commit**

```bash
git add server/build.gradle.kts server/config/detekt/
git commit -m "build(server): adopt detekt with baseline gate"
```

---

### Task 3: JaCoCo coverage 게이트

**Files:**
- Modify: `server/build.gradle.kts`

- [ ] **Step 1: plugin 추가**

```kotlin
id("jacoco")
```

설정 블록 추가:

```kotlin
jacoco {
    toolVersion = "0.8.12"
}

val unitTest = tasks.named<Test>("unitTest")

tasks.named<JacocoReport>("jacocoTestReport") {
    dependsOn(unitTest)
    executionData.setFrom(fileTree(layout.buildDirectory).include("/jacoco/unitTest.exec"))
    sourceSets(sourceSets["main"])
    reports {
        xml.required.set(true)
        html.required.set(true)
        csv.required.set(false)
    }
    classDirectories.setFrom(
        files(classDirectories.files.map {
            fileTree(it) {
                exclude(
                    "**/*Application*",
                    "**/dto/**",
                    "**/config/**",
                )
            }
        })
    )
}

tasks.named<JacocoCoverageVerification>("jacocoTestCoverageVerification") {
    dependsOn(tasks.named("jacocoTestReport"))
    violationRules {
        rule {
            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                // baseline은 Task 4에서 실측치로 조정. 임시 0.
                minimum = "0.00".toBigDecimal()
            }
        }
    }
}

tasks.named("check") {
    dependsOn("jacocoTestCoverageVerification")
}
```

또한 `Test.configureReadmatesTestRuntime()` 에 jacoco extension은 plugin 적용으로 자동 결합되므로 추가 변경 불필요.

- [ ] **Step 2: 측정**

```bash
cd server && ./gradlew clean unitTest jacocoTestReport
```

Expected: `server/build/reports/jacoco/test/html/index.html` 생성. LINE 커버리지 % 표시.

- [ ] **Step 3: 측정치 기록**

```bash
grep -A 2 "Total" server/build/reports/jacoco/test/jacocoTestReport.csv 2>/dev/null \
  || cat server/build/reports/jacoco/test/jacocoTestReport.xml | head -20
```

Expected: 전체 LINE 커버리지 출력.

- [ ] **Step 4: baseline -2%p 임계값 적용**

`jacocoTestCoverageVerification.violationRules.rule.limit.minimum` 을 측정치(소수) -0.02 로 갱신.

예: 측정 0.62 → `minimum = "0.60".toBigDecimal()`.

- [ ] **Step 5: 검증**

```bash
cd server && ./gradlew check
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: Commit**

```bash
git add server/build.gradle.kts
git commit -m "build(server): gate PR on JaCoCo line coverage (baseline -2pp)"
```

---

### Task 4: CI 워크플로 server 잡 보강

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: 기존 server 잡 식별**

```bash
grep -n "server\|gradle" .github/workflows/ci.yml | head -30
```

Expected: 기존 server 빌드 step 위치.

- [ ] **Step 2: check task 단일 실행으로 통일**

기존 server 잡의 테스트 단계를 다음으로 교체:

```yaml
      - name: Server quality gates (ktlint + detekt + tests + JaCoCo)
        working-directory: server
        run: ./gradlew check
```

`check` 가 ktlint, detekt, unitTest → jacocoTestReport → jacocoTestCoverageVerification 까지 한 번에 수행.

ArchUnit/integration test는 별도 라인 그대로 유지:

```yaml
      - name: Architecture tests
        working-directory: server
        run: ./gradlew architectureTest
```

- [ ] **Step 3: report artifact 업로드 추가**

```yaml
      - name: Upload server reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: server-reports
          path: |
            server/build/reports/detekt/
            server/build/reports/jacoco/
            server/build/reports/ktlint/
          retention-days: 14
```

> action SHA pin 은 기존 워크플로 패턴 따름.

- [ ] **Step 4: yaml lint**

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
```

Expected: 파싱 성공.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(server): run check + upload quality reports"
```

---

## Self-Review 체크리스트

- [x] Spec coverage: ktlint(1), detekt(2), JaCoCo(3), CI(4)
- [x] Placeholder: Task 3 Step 4 의 `minimum` 값은 측정치 기반 — 실측 후 갱신 명시
- [x] Type consistency: 모든 Gradle task / extension 명 일관

## Rollback

각 Task 독립 commit. 회귀 시 마지막 Task부터 revert.

## Out of Scope

- 모듈별(예: notification, auth) coverage gate 차등화 — baseline 안착 후 후속.
- Mutation testing (Pitest) — 본 PR 범위 외.
- detekt 사용자 규칙 작성 — baseline 무시 위주, 신규 룰 작성은 후속.
