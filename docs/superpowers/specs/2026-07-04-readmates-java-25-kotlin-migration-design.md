# ReadMates Java 25 Kotlin Migration Design

작성일: 2026-07-04
상태: APPROVED DESIGN SPEC
대상 표면: server Gradle toolchain, Kotlin JVM target, backend CI, server Docker images, backend test/runtime docs

## 1. 배경

ReadMates backend는 Kotlin/Spring Boot 단일 Gradle module로 운영된다. 현재 서버 빌드와 실행 기준은 Java 21이다.

- `server/build.gradle.kts`는 Kotlin plugin `2.2.0`, Spring Boot `4.0.6`, Gradle wrapper `9.1.0`, Java toolchain `21`, test Java launcher `21`, detekt JVM target `21`을 사용한다.
- `server/gradle/gradle-daemon-jvm.properties`는 Gradle daemon toolchain을 `21`로 고정한다.
- GitHub Actions backend, backend-integration, E2E, deploy-server jobs는 `actions/setup-java` `java-version: 21`을 사용한다.
- `server/Dockerfile`과 `server/Dockerfile.release`는 `eclipse-temurin:21-*-jammy` 이미지를 사용한다.
- README, local setup, test guide, OCI backend docs는 backend JDK 기준을 `JDK 21`로 설명한다.

사용자는 Java 25 LTS와 그에 맞는 Kotlin 버전으로 프로젝트를 완전 전환하되, 사이드이펙트를 최소화하기를 원한다. 완전 전환의 의미는 로컬 빌드 설정만 바꾸는 것이 아니라 compile target, test runtime, CI, release Docker image, active docs가 같은 Java 25 기준을 공유하는 것이다.

현재 로컬 셸은 Java 25로 Gradle을 실행할 수 있지만, repo source of truth는 아직 Java 21이다. 이번 설계는 그 불일치를 제거한다.

## 2. 외부 호환성 근거

이번 설계는 2026-07-04 기준 공식 문서 확인을 전제로 한다.

- Kotlin은 `2.3.0`부터 Java 25 bytecode 생성을 지원한다. Kotlin `2.4.0`은 Java 26 지원까지 포함한 stable release다.
- Gradle `9.1.0`은 Java 25 toolchain과 Gradle daemon 실행을 지원한다.
- Spring Boot 4.x 문서는 Java 17 이상과 Java 26까지의 호환 범위를 설명한다. 현재 repo의 Spring Boot `4.0.6`은 Java 25 전환 후보로 볼 수 있다.
- Adoptium은 `eclipse-temurin:25-jdk`/`25-jre` 계열 container image를 제공한다.
- detekt `1.23.7`은 Kotlin `2.0.10`/JDK 21 호환 쪽에 가까우며, Kotlin 2.4/JDK 25 정렬은 detekt 2.0 alpha 계열에서 공식적으로 다뤄진다.

이 근거 때문에 Java 25/Kotlin target 전환은 진행하되, detekt major/alpha 전환은 본 범위에 섞지 않는다.

## 3. 목표

성공 기준:

- Backend compile target, Kotlin JVM target, Gradle Java toolchain, test Java launcher가 Java 25로 정렬된다.
- Backend CI, backend integration CI, E2E job의 Java setup, deploy-server jar build가 Java 25를 사용한다.
- Server local Dockerfile과 release Dockerfile이 Java 25 Temurin runtime/build image를 사용한다.
- README, local setup, test guide, OCI backend docs가 Java 25 LTS 기준으로 갱신된다.
- Spring Boot API, auth/BFF boundary, persistence schema, Flyway migration, frontend routes, Cloudflare Pages Functions behavior는 변경하지 않는다.
- detekt는 stable 현재 경로를 우선 유지한다. Java 25 전환 중 detekt만 막히면 alpha 도입으로 즉시 확대하지 않고 별도 후속 작업으로 분리한다.
- 검증 결과는 release-readiness 문서에 public-safe하게 남긴다.

## 4. Non-goals

- DB schema나 Flyway migration을 추가하지 않는다.
- API response contract, OAuth scope, auth cookie format, BFF secret format, trusted header policy를 바꾸지 않는다.
- Spring Boot major/minor upgrade를 이번 목표로 삼지 않는다. 보안 패치나 Java 25 호환에 필요한 최소 patch만 허용한다.
- Gradle wrapper upgrade를 기본 목표로 삼지 않는다. Gradle `9.1.0`은 Java 25 지원 최소선을 만족하므로, 실제 검증에서 문제가 있을 때만 올린다.
- detekt 2.0 alpha 도입, detekt rule/baseline 재작성, ktlint major migration은 이번 Java 25 전환과 분리한다.
- 가상 스레드, GC tuning, preview feature 사용, JVM option 최적화는 이번 범위가 아니다.
- Frontend package-manager, Playwright CT, design-system tooling은 Java 25 전환 범위가 아니다.

## 5. 검토한 접근

### 접근 A: Java 25 완전 전환, detekt는 stable 현재 경로 유지 - 추천

Kotlin을 Java 25 bytecode target 지원 stable 버전으로 올리고, backend toolchain/CI/Docker/docs를 Java 25로 정렬한다. detekt는 현재 `1.23.7`을 유지하고, 필요한 경우 기존처럼 classpath pin이나 daemon/toolchain pin만 최소 조정한다.

장점은 Java 25 전환을 실제 운영 단위까지 완성하면서 alpha 정적분석 도구 도입을 피한다는 점이다. 단점은 detekt가 Kotlin 2.4/Java 25 분석에서 실패할 수 있고, 그 경우 전환 implementation을 멈추거나 별도 detekt 현대화 작업이 필요하다는 점이다.

### 접근 B: Java/Kotlin/detekt 전체 최신화

Java 25, Kotlin 2.4, detekt 2.0 alpha, 관련 Gradle plugin 변경을 한 PR에서 처리한다.

장점은 툴체인 정합성이 가장 명확하다는 점이다. 단점은 alpha detekt가 lint 결과, rule behavior, baseline, Gradle DSL을 흔들 수 있어 Java 25 전환 자체보다 사이드이펙트가 커진다는 점이다.

### 접근 C: Runtime 먼저, Kotlin target 나중

CI/Docker/runtime을 Java 25로 올리되 Kotlin bytecode target은 당분간 21로 유지한다.

장점은 실행 런타임 차이와 compile target 차이를 분리할 수 있다는 점이다. 단점은 사용자가 요청한 "완전 전환"에 미달하고, 문서와 운영 기준이 중간 상태를 설명해야 한다는 점이다.

선택은 **접근 A**다.

## 6. 선택한 설계

선택한 설계는 **Java 25 LTS 완전 전환 + detekt alpha 분리**다.

원칙:

- Java 25는 backend compile, test, CI, Docker image, docs 전반의 단일 기준이다.
- Kotlin은 Java 25 JVM target을 안정적으로 지원하는 stable version으로 올린다. 2026-07-04 기준 우선 후보는 `2.4.0`이다.
- detekt는 Java 25 전환의 종속 변경으로만 다룬다. detekt 자체 현대화는 별도 spec/plan이 필요한 후속 작업이다.
- Gradle wrapper `9.1.0`은 유지한다. Java 25 지원을 이미 만족하므로 wrapper upgrade는 검증 실패 시 fallback이다.
- 모든 변경은 server/build/runtime/tooling 표면에 한정한다. product behavior 변경은 금지한다.

## 7. Architecture Impact

변경 전:

```text
server/build.gradle.kts
  Kotlin 2.2.0
  Java toolchain 21
  Test launcher 21
  detekt jvmTarget 21

GitHub Actions
  backend/backend-integration/e2e/deploy-server setup-java 21

Docker
  eclipse-temurin:21-jdk-jammy
  eclipse-temurin:21-jre-jammy

Docs
  Backend JDK 21
```

변경 후:

```text
server/build.gradle.kts
  Kotlin stable with Java 25 target support
  Java toolchain 25
  Test launcher 25
  Kotlin JVM target 25
  detekt jvmTarget 25 if compatible

GitHub Actions
  backend/backend-integration/e2e/deploy-server setup-java 25

Docker
  eclipse-temurin:25-jdk-jammy as the first-choice image
  eclipse-temurin:25-jre-jammy as the first-choice image

Docs
  Backend JDK 25 LTS
```

The Spring Boot application architecture, clean architecture package boundaries, BFF trust boundary, Redis optionality, MySQL/Flyway persistence model, Kafka notification outbox flow, and public API visibility model remain unchanged.

## 8. File-Level Scope

Expected implementation files:

- `server/build.gradle.kts`
  - Kotlin plugin version.
  - Java toolchain `25`.
  - test launcher `25`.
  - Kotlin/JVM target configuration, if not already explicit.
  - detekt JVM target `25` when compatible.
  - detekt classpath pin only if necessary for current detekt stability.
- `server/gradle/gradle-daemon-jvm.properties`
  - daemon toolchain version `25`.
- `.github/workflows/ci.yml`
  - backend setup-java `25`.
  - backend-integration setup-java `25`.
  - E2E setup-java `25`.
- `.github/workflows/deploy-server.yml`
  - deploy server setup-java `25`.
- `server/Dockerfile`
  - local build-from-source image to Java 25.
- `server/Dockerfile.release`
  - release runtime image to Java 25.
- `README.md`
  - local backend prerequisite to JDK 25 LTS.
- `docs/development/local-setup.md`
  - local backend toolchain to JDK 25 LTS.
- `docs/development/test-guide.md`
  - backend tests expected to run on Java 25, not Java 21.
  - detekt residual note updated to match actual implementation.
- `docs/deploy/oci-backend.md`
  - legacy host runtime note to Java 25 or clearly mark compose image path as canonical.
- `docs/development/release-readiness-review.md`
  - closeout entry for Java 25 migration verification and residuals.

Files not expected to change:

- `server/src/main/kotlin/**` unless a Java/Kotlin compile break requires a narrowly scoped source fix.
- `server/src/main/resources/db/mysql/migration/**`.
- `front/functions/**`, `front/src/**`, `front/features/**`.
- Product docs unrelated to backend build/runtime prerequisites.

## 9. Docker Image Strategy

Primary image choice:

```text
eclipse-temurin:25-jdk-jammy
eclipse-temurin:25-jre-jammy
```

This keeps the base OS family closest to the current Java 21 images and minimizes package/security behavior drift.

Fallback order:

1. If `25-*-jammy` tags are unavailable or fail to build, use Adoptium's recommended default Ubuntu tag:
   - `eclipse-temurin:25-jdk`
   - `eclipse-temurin:25-jre`
2. If scanner or package behavior requires an explicit newer Ubuntu base, use:
   - `eclipse-temurin:25-jdk-noble`
   - `eclipse-temurin:25-jre-noble`

The selected image tags must be proven by a local Docker build before closeout. If the fallback changes OS family, release-readiness notes must state that the change is a base-image shift, not only a Java feature-version shift.

## 10. Static Analysis Strategy

`detekt 1.23.7` remains the first implementation choice.

The implementation should try the smallest compatible path in this order:

1. Keep detekt plugin `1.23.7` and existing detekt config/baseline.
2. Move detekt JVM target to `25` if the plugin accepts it.
3. Preserve or adjust the existing detekt Kotlin classpath pin only as needed for task stability.
4. If detekt fails due to unsupported Kotlin/Java analysis rather than project code, stop and report the blocker instead of adopting detekt 2.0 alpha inside the Java 25 migration.

detekt 2.0 alpha is allowed only in a later, explicitly approved "detekt modernization" task.

## 11. Execution Flow

Implementation should proceed in this order:

1. Update Gradle/Kotlin toolchain declarations.
2. Run focused Gradle compile/check commands to identify Kotlin or detekt compatibility failures.
3. Update CI setup-java declarations.
4. Update Dockerfiles and build the release image locally.
5. Update active docs to match the actual implementation.
6. Run the full verification matrix.
7. Record public-safe closeout notes in release-readiness docs.

This order prevents docs and CI declarations from being updated before the local Gradle toolchain proves viable.

## 12. Error Handling

Failure categories:

- **Kotlin plugin resolution failure**: selected Kotlin version is unavailable or incompatible with Gradle/Spring plugin configuration. Pick the latest stable Kotlin version that supports Java 25 target and re-run compile/check.
- **Java 25 toolchain unavailable**: local or CI environment cannot provision Java 25. In local development, install Temurin 25 or configure Gradle toolchain provisioning. In CI, `actions/setup-java` should provide Temurin 25.
- **Kotlin JVM target failure**: Kotlin compiler rejects target 25. This indicates the selected Kotlin version is too old or plugin configuration is incomplete.
- **detekt failure**: first determine whether failure is project code, rule config, JVM target, or Kotlin compiler analysis. Do not hide detekt failure by removing `check` dependencies.
- **Docker tag failure**: apply the documented fallback order and record the final selected base image.
- **Trivy/security failure**: treat fixed HIGH/CRITICAL findings as release blockers, consistent with existing release image policy.

## 13. Verification Plan

Minimum backend verification:

```bash
./server/gradlew -p server clean check
./server/gradlew -p server integrationTest
./server/gradlew -p server bootJar
```

Dependency/runtime inspection:

```bash
./server/gradlew -p server -version
./server/gradlew -p server dependencyInsight --dependency kotlin-stdlib --configuration runtimeClasspath
```

Docker verification:

```bash
docker build -f server/Dockerfile.release server -t readmates-server:java25-local
docker run --rm readmates-server:java25-local java -version
```

Security scan when Docker is available:

```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.70.0 image \
  --severity HIGH,CRITICAL \
  --ignore-unfixed \
  --scanners vuln \
  readmates-server:java25-local
```

Cross-surface verification caused by CI/E2E Java setup changes:

```bash
pnpm --dir front test:e2e
```

Docs/public-safety verification:

```bash
git diff --check -- server/build.gradle.kts server/gradle/gradle-daemon-jvm.properties .github/workflows/ci.yml .github/workflows/deploy-server.yml server/Dockerfile server/Dockerfile.release README.md docs/development/local-setup.md docs/development/test-guide.md docs/deploy/oci-backend.md docs/development/release-readiness-review.md
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

If a command cannot run because Docker, Java 25, or another local dependency is unavailable, final closeout must report it as skipped with the exact reason. It must not be described as passing.

## 14. Acceptance Criteria

- `server/build.gradle.kts` uses Java 25 toolchain and Kotlin JVM target compatible with Java 25.
- Backend test tasks run with Java 25 rather than Java 21.
- Gradle daemon toolchain pin is Java 25.
- CI backend, backend integration, E2E, and deploy-server jobs use Java 25.
- Local and release server Docker images use Java 25 Temurin images and build successfully.
- Backend docs name JDK 25 LTS as the required backend JDK.
- `./server/gradlew -p server clean check`, `integrationTest`, and `bootJar` pass.
- Release Docker image build passes and records Java 25 runtime.
- Public release candidate checks pass.
- No DB migration, API contract, auth/BFF, frontend route, or product behavior change is introduced.
- detekt remains stable-current unless a separately approved follow-up changes it.

## 15. Rollback Plan

This migration is rollback-friendly because it does not change database schema or product data.

Local/code rollback:

- Revert the Java/Kotlin/CI/Docker/docs migration commit.
- Re-run the Java 21 verification matrix that existed before the migration.

Operational rollback:

- If a Java 25 image has been deployed and runtime problems appear, promote the previous Java 21 server image tag in OCI compose.
- No database rollback is required.
- Since API and BFF contracts do not change, Cloudflare Pages and frontend assets do not need rollback solely because of this migration.

## 16. Remaining Risks

- detekt `1.23.7` may not analyze Kotlin 2.4/Java 25 cleanly. The planned response is to stop or split a detekt modernization task, not to merge alpha tooling into this migration casually.
- Java 25 Docker base image scanning may reveal new HIGH/CRITICAL findings or package behavior changes. Existing release image scanner policy should treat those as blockers.
- Legacy host VM package installation may not provide Java 25 through the same apt path used for Java 21. The compose image path is canonical; legacy host instructions should not overpromise automated Java 25 host-package setup unless verified.
- Java 25 runtime could expose timing or library edge cases in Testcontainers, Kafka, Redis, MySQL driver, LLM SDKs, or Spring Security. Full backend/integration/E2E verification is required before claiming the migration is complete.

## 17. Spec Self-review

- Placeholder scan: no placeholder markers remain.
- Internal consistency: the design keeps product/API/DB/auth/frontend behavior out of scope and focuses on server JVM toolchain, CI, Docker, and docs.
- Scope check: this is one implementation plan. detekt alpha modernization is explicitly split out.
- Ambiguity check: Java 25 "complete" means build, test, CI, Docker runtime, and active docs all move together.
