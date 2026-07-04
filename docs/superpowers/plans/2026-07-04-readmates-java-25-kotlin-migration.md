# ReadMates Java 25 Kotlin Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the ReadMates backend build, test, CI, Docker runtime, and active docs from Java 21 to Java 25 LTS with Kotlin targeting Java 25 bytecode.

**Architecture:** This is a server tooling/runtime migration, not a product behavior change. The Spring Boot API, clean architecture package boundaries, BFF trust model, MySQL/Flyway schema, Cloudflare Pages Functions, and frontend routes remain unchanged. The work changes only Gradle/Kotlin toolchain settings, Java setup in CI, server container base images, and docs/release-readiness evidence.

**Tech Stack:** Kotlin/JVM, Spring Boot 4.0.6, Gradle 9.1.0 wrapper, Temurin Java 25, GitHub Actions, Docker, Trivy, MySQL/Testcontainers, pnpm 10.33.0 for E2E/public-release checks.

## Global Constraints

- Use Kotlin `2.4.0` as the first stable Kotlin version for Java 25 JVM target support.
- Keep Gradle wrapper `9.1.0` unless a command proves Java 25 execution fails specifically because of Gradle.
- Keep Spring Boot `4.0.6` unless a command proves Java 25 execution fails specifically because of Spring Boot.
- Keep detekt plugin `1.23.7`; do not adopt detekt 2.0 alpha in this implementation.
- Backend Java compile toolchain, Kotlin JVM target, test launcher, Gradle daemon toolchain, CI setup-java, and server Docker images must use Java 25.
- Do not add Flyway migrations or edit `server/src/main/resources/db/mysql/migration/**`.
- Do not change API response contracts, OAuth scope, auth cookie format, BFF secret handling, trusted header policy, frontend routes, or Cloudflare Pages Functions behavior.
- If detekt fails because detekt `1.23.7` cannot analyze Kotlin 2.4/Java 25, stop the implementation and report the blocker instead of weakening `check` or introducing alpha tooling.
- Public repo safety: do not add private domains, real member data, deployment state, local absolute paths, OCIDs, secrets, or token-shaped values.

---

## File Structure

- Modify `server/build.gradle.kts`: Kotlin plugin version, Java toolchain, Kotlin compile target, test Java launcher, detekt JVM target if accepted by detekt.
- Modify `server/gradle/gradle-daemon-jvm.properties`: Gradle daemon toolchain version.
- Modify `.github/workflows/ci.yml`: backend, backend-integration, and E2E `actions/setup-java` version.
- Modify `.github/workflows/deploy-server.yml`: deploy-server `actions/setup-java` version.
- Modify `server/Dockerfile`: local build-from-source Docker image Java version.
- Modify `server/Dockerfile.release`: release Docker runtime image Java version.
- Modify `README.md`: local backend prerequisite.
- Modify `docs/development/local-setup.md`: local backend JDK/toolchain language.
- Modify `docs/development/test-guide.md`: CI/backend test Java version and detekt note.
- Modify `docs/deploy/oci-backend.md`: legacy host VM runtime note.
- Modify `docs/development/release-readiness-review.md`: final public-safe closeout note after verification.

## Task 1: Gradle And Kotlin Java 25 Toolchain

**Files:**
- Modify: `server/build.gradle.kts:2-23`
- Modify: `server/build.gradle.kts:129-132`
- Modify: `server/build.gradle.kts:255-260`
- Modify: `server/gradle/gradle-daemon-jvm.properties:1`

**Interfaces:**
- Consumes: current Gradle wrapper `server/gradlew`, current single-module server build.
- Produces: Java 25 compile/test/static-analysis configuration that later CI and Docker tasks rely on.

- [ ] **Step 1: Confirm the starting server toolchain**

Run:

```bash
./server/gradlew -p server -version
```

Expected before editing: output includes `Gradle 9.1.0`; current local launcher may be Java 25, but `server/gradle/gradle-daemon-jvm.properties` still pins `toolchainVersion=21`.

- [ ] **Step 2: Update Kotlin plugin and Java toolchain**

Edit `server/build.gradle.kts` so the top plugin block and Java toolchain read exactly:

```kotlin
plugins {
    kotlin("jvm") version "2.4.0"
    kotlin("plugin.spring") version "2.4.0"
    id("org.springframework.boot") version "4.0.6"
    id("io.spring.dependency-management") version "1.1.7"
    id("org.flywaydb.flyway") version "11.7.2"
    id("org.jlleitschuh.gradle.ktlint") version "12.1.1"
    id("io.gitlab.arturbosch.detekt") version "1.23.7"
    id("jacoco")
}
```

```kotlin
java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(25))
    }
}
```

- [ ] **Step 3: Add explicit Kotlin JVM target**

Add this block immediately after the `java { ... }` block in `server/build.gradle.kts`:

```kotlin
tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_25)
    }
}
```

This keeps Kotlin bytecode target explicit instead of relying only on the Java toolchain.

- [ ] **Step 4: Update backend test launcher**

Edit `server/build.gradle.kts` so `serverTestJavaLauncher` uses Java 25:

```kotlin
val serverTestJavaLauncher =
    javaToolchains.launcherFor {
        languageVersion.set(JavaLanguageVersion.of(25))
    }
```

- [ ] **Step 5: Update detekt JVM target without changing detekt version**

Edit the two detekt task blocks in `server/build.gradle.kts` to:

```kotlin
tasks.withType<io.gitlab.arturbosch.detekt.Detekt>().configureEach {
    jvmTarget = "25"
}

tasks.withType<io.gitlab.arturbosch.detekt.DetektCreateBaselineTask>().configureEach {
    jvmTarget = "25"
}
```

Keep this existing detekt classpath pin unchanged:

```kotlin
configurations.matching { it.name == "detekt" }.all {
    resolutionStrategy.eachDependency {
        if (requested.group == "org.jetbrains.kotlin") {
            useVersion("2.0.10")
        }
    }
}
```

- [ ] **Step 6: Update Gradle daemon toolchain pin**

Replace the entire contents of `server/gradle/gradle-daemon-jvm.properties` with:

```properties
toolchainVersion=25
```

- [ ] **Step 7: Run the focused compile gate**

Run:

```bash
./server/gradlew -p server clean compileKotlin compileTestKotlin
```

Expected: `BUILD SUCCESSFUL`.

If this fails with Kotlin target support errors, verify `server/build.gradle.kts` uses Kotlin `2.4.0` in both Kotlin plugin lines and that the JVM target block uses `JvmTarget.JVM_25`. Do not lower the Kotlin JVM target.

- [ ] **Step 8: Run the backend quality gate**

Run:

```bash
./server/gradlew -p server check
```

Expected: `BUILD SUCCESSFUL`.

If the only failure is detekt rejecting `jvmTarget = "25"` with an invalid-target message, change only the two detekt `jvmTarget` values back to `"21"`, add a note to the release-readiness entry in Task 4 saying `detekt 1.23.7 kept jvmTarget 21 while Gradle/Kotlin compile/test targets are Java 25`, and rerun the same command. If detekt fails with Kotlin analysis errors or internal compiler errors, stop and report that the detekt modernization follow-up is blocking the migration.

- [ ] **Step 9: Inspect Kotlin runtime dependency resolution**

Run:

```bash
./server/gradlew -p server dependencyInsight --dependency kotlin-stdlib --configuration runtimeClasspath
```

Expected: output selects Kotlin `2.4.0` artifacts for runtime Kotlin stdlib dependencies.

- [ ] **Step 10: Commit Gradle toolchain changes**

Run:

```bash
git add server/build.gradle.kts server/gradle/gradle-daemon-jvm.properties
git commit -m "build(server): target java 25 kotlin runtime"
```

## Task 2: CI And Server Docker Java 25 Runtime

**Files:**
- Modify: `.github/workflows/ci.yml:234-238`
- Modify: `.github/workflows/ci.yml:288-292`
- Modify: `.github/workflows/ci.yml:372-376`
- Modify: `.github/workflows/deploy-server.yml:49-53`
- Modify: `server/Dockerfile:1-17`
- Modify: `server/Dockerfile.release:1-7`

**Interfaces:**
- Consumes: Task 1 Java 25 Gradle toolchain.
- Produces: CI and Docker runtime Java 25 alignment for final verification and deploy-server image publication.

- [ ] **Step 1: Update backend Java setup in CI**

In `.github/workflows/ci.yml`, replace all three backend-relevant Java setup values:

```yaml
          java-version: 21
```

with:

```yaml
          java-version: 25
```

The three locations are the `backend`, `backend-integration`, and `e2e` jobs.

- [ ] **Step 2: Update deploy-server Java setup**

In `.github/workflows/deploy-server.yml`, replace:

```yaml
          java-version: 21
```

with:

```yaml
          java-version: 25
```

- [ ] **Step 3: Update the local server Dockerfile**

In `server/Dockerfile`, replace the three `FROM` lines with:

```dockerfile
FROM eclipse-temurin:25-jdk-jammy AS builder
```

```dockerfile
FROM eclipse-temurin:25-jre-jammy AS layers
```

```dockerfile
FROM eclipse-temurin:25-jre-jammy
```

- [ ] **Step 4: Update the release server Dockerfile**

In `server/Dockerfile.release`, replace the two `FROM` lines with:

```dockerfile
FROM eclipse-temurin:25-jre-jammy AS layers
```

```dockerfile
FROM eclipse-temurin:25-jre-jammy
```

- [ ] **Step 5: Confirm no Java 21 build/runtime pins remain in implementation files**

Run:

```bash
rg -n "java-version: 21|eclipse-temurin:21|JavaLanguageVersion\\.of\\(21\\)|jvmTarget = \"21\"|toolchainVersion=21|kotlin\\(\"jvm\"\\) version \"2\\.2\\.0\"|kotlin\\(\"plugin\\.spring\"\\) version \"2\\.2\\.0\"" .github server README.md docs/development docs/deploy -S --glob '!docs/superpowers/**' --glob '!docs/reports/**'
```

Expected after Task 2 and before docs edits: matches should be limited to README/docs text that Task 3 will update. There should be no matches in `.github/**`, `server/build.gradle.kts`, `server/gradle/gradle-daemon-jvm.properties`, `server/Dockerfile`, or `server/Dockerfile.release`.

- [ ] **Step 6: Build the release Docker image**

Run:

```bash
./server/gradlew -p server bootJar
docker build -f server/Dockerfile.release server -t readmates-server:java25-local
```

Expected: both commands exit 0.

If Docker fails because `eclipse-temurin:25-jre-jammy` is unavailable, change all Java 25 Docker image tags in both Dockerfiles from `25-*-jammy` to the default Ubuntu tags `eclipse-temurin:25-jdk` and `eclipse-temurin:25-jre`, then rerun the Docker build. If that fallback is used, Task 4 release-readiness text must state that the final image uses default Ubuntu Temurin tags instead of `jammy`.

- [ ] **Step 7: Verify the built image runtime**

Run:

```bash
docker run --rm --entrypoint java readmates-server:java25-local -version
```

Expected: output includes `25`.

- [ ] **Step 8: Commit CI and Docker changes**

Run:

```bash
git add .github/workflows/ci.yml .github/workflows/deploy-server.yml server/Dockerfile server/Dockerfile.release
git commit -m "ci(server): run backend on java 25"
```

## Task 3: Active Backend Docs

**Files:**
- Modify: `README.md:191-196`
- Modify: `docs/development/local-setup.md:9-16`
- Modify: `docs/development/test-guide.md:5`
- Modify: `docs/development/test-guide.md:244-285`
- Modify: `docs/deploy/oci-backend.md:108-114`

**Interfaces:**
- Consumes: Task 1 and Task 2 actual toolchain and Docker behavior.
- Produces: Active docs that accurately describe Java 25 backend requirements before final release-readiness evidence is recorded in Task 4.

- [ ] **Step 1: Update README prerequisite**

In `README.md`, replace:

```markdown
- `JDK 21`
```

with:

```markdown
- `JDK 25 LTS`
```

- [ ] **Step 2: Update local setup prerequisite**

In `docs/development/local-setup.md`, replace:

```markdown
- `JDK 21`
```

with:

```markdown
- `JDK 25 LTS`
```

Replace the sentence:

```markdown
프론트엔드와 디자인 시스템은 루트 `package.json` / `pnpm-workspace.yaml` 기준의 `pnpm@10.33.0` workspace를 사용합니다. CI는 Node.js 24로 frontend lint/test/build와 design-system check를 실행합니다. 백엔드는 Gradle wrapper와 Java toolchain으로 `JDK 21`을 사용합니다.
```

with:

```markdown
프론트엔드와 디자인 시스템은 루트 `package.json` / `pnpm-workspace.yaml` 기준의 `pnpm@10.33.0` workspace를 사용합니다. CI는 Node.js 24로 frontend lint/test/build와 design-system check를 실행합니다. 백엔드는 Gradle wrapper와 Java 25 toolchain으로 `JDK 25 LTS`를 사용합니다.
```

- [ ] **Step 3: Update test guide CI summary**

In `docs/development/test-guide.md`, replace the line that starts with `GitHub Actions CI는 frontend job에서` with:

```markdown
GitHub Actions CI는 frontend job에서 Node.js 24와 `pnpm@10.33.0`을 사용해 lint, coverage 포함 unit test, build, Zod fixture freshness check를 실행하고, design-system job에서 `pnpm design:check`를 실행합니다. Backend job은 JDK 25 LTS로 `./gradlew check`를 실행하며, `check` 안에서 unit test, architectureTest, ktlint, detekt, JaCoCo가 함께 돕니다. Testcontainers 기반 integration suite는 별도 `backend-integration` job의 `./gradlew integrationTest`로 병렬 실행합니다. E2E job은 MySQL service를 띄운 뒤 Playwright suite를 3개 shard로 나눠 실행합니다.
```

- [ ] **Step 4: Update backend test runtime paragraph**

In `docs/development/test-guide.md`, replace:

```markdown
Backend tests are expected to run on JDK 21. `server/build.gradle.kts` pins the Gradle `Test` JVM to the Java 21 toolchain so local shells using a newer current JVM do not change test runtime behavior. If Gradle cannot find a JDK 21 toolchain locally, install one or set `JAVA_HOME` to a JDK 21 installation before running backend tests.
```

with:

```markdown
Backend tests are expected to run on JDK 25 LTS. `server/build.gradle.kts` pins the Gradle `Test` JVM to the Java 25 toolchain so local shells using a different current JVM do not change test runtime behavior. If Gradle cannot find a JDK 25 toolchain locally, install Temurin 25 or set `JAVA_HOME` to a JDK 25 installation before running backend tests.
```

- [ ] **Step 5: Update detekt test-guide note**

If Task 1 kept detekt `jvmTarget = "25"`, replace the detekt bullet in `docs/development/test-guide.md` with:

```markdown
- **detekt baseline gate**: detekt 1.23.7 + `server/config/detekt/detekt.yml`. 기존 위반은 `server/config/detekt/baseline.xml`로 grandfather. Backend Gradle daemon, compile/test toolchains, and detekt JVM target are aligned on Java 25; detekt classpath remains pinned to Kotlin 2.0.10 to keep the current stable detekt line isolated from the Kotlin compiler used by the application build.
```

If Task 1 had to revert only detekt `jvmTarget` to `"21"` because detekt rejected target `25`, use this exact replacement instead:

```markdown
- **detekt baseline gate**: detekt 1.23.7 + `server/config/detekt/detekt.yml`. 기존 위반은 `server/config/detekt/baseline.xml`로 grandfather. Backend Gradle daemon and compile/test toolchains use Java 25, while detekt keeps JVM target 21 because the current stable detekt line rejects target 25; detekt classpath remains pinned to Kotlin 2.0.10. Moving detekt itself to a Java 25-native line is tracked as a separate modernization task.
```

- [ ] **Step 6: Update OCI legacy host note**

In `docs/deploy/oci-backend.md`, replace:

```markdown
이 스크립트는 Ubuntu 패키지를 업데이트하고, Java 21 runtime과 Caddy를 설치하며, `readmates` 사용자와 `/opt/readmates`, `/etc/readmates` 디렉터리를 만듭니다. 신규 compose VM에서는 [compose-stack.md](compose-stack.md)의 Docker bootstrap을 우선합니다.
```

with:

```markdown
이 스크립트는 Ubuntu 패키지를 업데이트하고, Java 25 runtime과 Caddy를 설치하며, `readmates` 사용자와 `/opt/readmates`, `/etc/readmates` 디렉터리를 만듭니다. 신규 compose VM에서는 Java runtime을 server image가 소유하므로 [compose-stack.md](compose-stack.md)의 Docker bootstrap을 우선합니다.
```

- [ ] **Step 7: Run docs safety checks**

Run:

```bash
git diff --check -- README.md docs/development/local-setup.md docs/development/test-guide.md docs/deploy/oci-backend.md
rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" README.md docs/development/local-setup.md docs/development/test-guide.md docs/deploy/oci-backend.md
```

Expected: first command exits 0. Second command exits 1 with no matches.

- [ ] **Step 8: Commit docs changes**

Run:

```bash
git add README.md docs/development/local-setup.md docs/development/test-guide.md docs/deploy/oci-backend.md
git commit -m "docs: record java 25 backend runtime"
```

## Task 4: Full Verification And Final Closeout

**Files:**
- Verify: `server/build.gradle.kts`
- Verify: `server/gradle/gradle-daemon-jvm.properties`
- Verify: `.github/workflows/ci.yml`
- Verify: `.github/workflows/deploy-server.yml`
- Verify: `server/Dockerfile`
- Verify: `server/Dockerfile.release`
- Verify: `README.md`
- Verify: `docs/development/local-setup.md`
- Verify: `docs/development/test-guide.md`
- Verify: `docs/deploy/oci-backend.md`
- Modify: `docs/development/release-readiness-review.md`

**Interfaces:**
- Consumes: Tasks 1-3 complete.
- Produces: proof that the migration is locally releasable and a release-readiness entry that matches the commands actually run.

- [ ] **Step 1: Verify no old Java 21 pins remain outside historical docs**

Run:

```bash
rg -n "JDK 21|Java 21|java-version: 21|eclipse-temurin:21|JavaLanguageVersion\\.of\\(21\\)|jvmTarget = \"21\"|toolchainVersion=21|Kotlin 2\\.2\\.0|kotlin\\(\"jvm\"\\) version \"2\\.2\\.0\"|kotlin\\(\"plugin\\.spring\"\\) version \"2\\.2\\.0\"" README.md docs/development docs/deploy .github server -S --glob '!docs/superpowers/**' --glob '!docs/reports/**'
```

Expected: no output if detekt also uses target 25. If detekt target was intentionally reverted to 21, the only allowed matches are the detekt note in `docs/development/test-guide.md`, the release-readiness static-analysis residual bullet, and the two `jvmTarget = "21"` lines in `server/build.gradle.kts`.

- [ ] **Step 2: Run backend quality and integration verification**

Run:

```bash
./server/gradlew -p server clean check
./server/gradlew -p server integrationTest
./server/gradlew -p server bootJar
```

Expected: each command exits 0 with `BUILD SUCCESSFUL`.

- [ ] **Step 3: Verify Kotlin dependency and Gradle runtime**

Run:

```bash
./server/gradlew -p server -version
./server/gradlew -p server dependencyInsight --dependency kotlin-stdlib --configuration runtimeClasspath
```

Expected: `-version` shows Gradle `9.1.0` running with Java 25-compatible daemon/toolchain behavior. `dependencyInsight` selects Kotlin `2.4.0` runtime artifacts.

- [ ] **Step 4: Verify release image runtime and scan**

Run:

```bash
docker build -f server/Dockerfile.release server -t readmates-server:java25-local
docker run --rm --entrypoint java readmates-server:java25-local -version
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.70.0 image --severity HIGH,CRITICAL --ignore-unfixed --scanners vuln readmates-server:java25-local
```

Expected: Docker build exits 0, Java version output includes `25`, and Trivy exits 0 with no fixed HIGH/CRITICAL findings.

- [ ] **Step 5: Run E2E because CI Java setup changed**

Run:

```bash
pnpm --dir front test:e2e
```

Expected: Playwright suite exits 0.

- [ ] **Step 6: Run public release checks**

Run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: both commands exit 0 and the public release scanner reports no leaks.

- [ ] **Step 7: Add release-readiness entry that matches the passed commands**

Add this section near the top of `docs/development/release-readiness-review.md`, directly below the introduction paragraph and above the `2026-07-02 CT Docker Corepack path` section. If every listed command has passed, use this exact text:

```markdown
## 2026-07-04 Java 25 Kotlin backend migration

- Scope: backend JVM/toolchain migration only. The server Gradle toolchain, Kotlin JVM target, backend test launcher, Gradle daemon toolchain, backend CI Java setup, deploy-server Java setup, and server Docker images now use Java 25 LTS. No DB migration, API contract, auth/BFF behavior, Cloudflare Pages Functions behavior, frontend route behavior, OAuth scope, or product feature behavior changed.
- Kotlin/tooling: Kotlin Gradle plugins moved to `2.4.0` so Kotlin can target Java 25 bytecode. Gradle wrapper stays on `9.1.0` because it already supports Java 25. detekt remains on the stable current `1.23.7` line; detekt 2.0 alpha was not introduced.
- Docker image: server images use `eclipse-temurin:25-jdk-jammy` and `eclipse-temurin:25-jre-jammy`.
- Local verification: `./server/gradlew -p server clean compileKotlin compileTestKotlin`, `./server/gradlew -p server check`, `./server/gradlew -p server dependencyInsight --dependency kotlin-stdlib --configuration runtimeClasspath`, `./server/gradlew -p server integrationTest`, `./server/gradlew -p server bootJar`, `docker build -f server/Dockerfile.release server -t readmates-server:java25-local`, `docker run --rm --entrypoint java readmates-server:java25-local -version`, `pnpm --dir front test:e2e`, `git diff --check -- server/build.gradle.kts server/gradle/gradle-daemon-jvm.properties .github/workflows/ci.yml .github/workflows/deploy-server.yml server/Dockerfile server/Dockerfile.release README.md docs/development/local-setup.md docs/development/test-guide.md docs/deploy/oci-backend.md docs/development/release-readiness-review.md`, `./scripts/build-public-release-candidate.sh`, and `./scripts/public-release-check.sh .tmp/public-release-candidate` passed.
- Residual risk: remote GitHub Actions, tag-triggered deploy-server image publication, GHCR promotion, OCI compose promotion, and production smoke remain release-operation evidence after push/tag. No known local Java 25 migration blocker remains after backend, integration, Docker image, E2E, docs, and public-release checks pass.
```

If Task 1 had to keep detekt `jvmTarget = "21"`, add this extra bullet after the Kotlin/tooling bullet:

```markdown
- Static-analysis residual: detekt `1.23.7` kept JVM target 21 while application compile/test/runtime targets moved to Java 25 because the stable detekt line rejected target 25. detekt modernization remains a separate follow-up and no detekt alpha dependency was added in this migration.
```

If Task 2 used the default Temurin tags instead of `jammy`, replace the Docker image bullet with:

```markdown
- Docker image: server images use `eclipse-temurin:25-jdk` and `eclipse-temurin:25-jre` because the `25-*-jammy` tags were unavailable in local Docker verification.
```

- [ ] **Step 8: Run final diff and safety checks**

Run:

```bash
git diff --check -- server/build.gradle.kts server/gradle/gradle-daemon-jvm.properties .github/workflows/ci.yml .github/workflows/deploy-server.yml server/Dockerfile server/Dockerfile.release README.md docs/development/local-setup.md docs/development/test-guide.md docs/deploy/oci-backend.md docs/development/release-readiness-review.md
rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" README.md docs/development/local-setup.md docs/development/test-guide.md docs/deploy/oci-backend.md docs/development/release-readiness-review.md
git status --short
```

Expected: diff check exits 0. The safety scan exits 1 with no matches. `git status --short` shows only `docs/development/release-readiness-review.md` if all earlier task commits were made.

- [ ] **Step 9: If release-readiness text differs from actual command results, correct it**

If any command in this task was skipped or failed and accepted for a documented reason, edit `docs/development/release-readiness-review.md` before the final commit so it reports the exact command and reason. Do not leave a passing claim for a skipped or failed command.

- [ ] **Step 10: Commit final release-readiness evidence**

Run:

```bash
git add docs/development/release-readiness-review.md
git commit -m "docs: align java 25 release readiness evidence"
```

## Plan Self-Review

- Spec coverage: Tasks 1-4 cover Gradle/Kotlin, test launcher, Gradle daemon toolchain, CI setup, Docker images, docs, release-readiness, verification, rollback-safe constraints, and detekt alpha separation.
- Placeholder scan: no placeholder markers remain in executable steps.
- Type/config consistency: every Java version pin in implementation files moves to `25`; Kotlin plugin version is consistently `2.4.0`; detekt remains `1.23.7`; Docker first-choice tags are consistently `eclipse-temurin:25-*-jammy`.
- Scope check: this is one implementation plan for server JVM/tooling migration. detekt modernization remains deliberately separate.
