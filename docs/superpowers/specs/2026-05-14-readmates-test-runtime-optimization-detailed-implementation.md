# ReadMates 테스트 실행 속도 최적화 상세 구현 문서

작성일: 2026-05-14
상태: READY FOR IMPLEMENTATION
연결 플랜: `docs/superpowers/plans/2026-05-14-readmates-test-runtime-optimization-implementation-plan.md`
대상 표면: `server/` Gradle/JUnit/Spring Boot tests, `front/` Vitest/Playwright tests, contributor-facing test docs

## 1. 배경

ReadMates의 테스트 표면은 세 갈래다.

- 프런트 unit/lint/build: Vite, Vitest, Testing Library, ESLint.
- 서버 unit/integration tests: Kotlin, Spring Boot, JUnit, Testcontainers MySQL/Redis/Kafka, ArchUnit.
- Playwright E2E: Vite dev server, Spring Boot API, MySQL service, dev seed 기반 browser flow.

최근 점검에서 프런트 unit/build는 이미 빠른 편이었다.

- `pnpm --dir front test -- --reporter=verbose`: 57 files, 750 tests, 약 7초.
- `pnpm --dir front lint`: 약 5초.
- `pnpm --dir front build`: 1초 미만.

반대로 서버 테스트는 총 실행 시간보다 실행 환경 안정성이 먼저 문제였다. 로컬 Gradle daemon이 JDK 25로 뜬 상태에서는 `./server/gradlew -p server clean test`가 `NoClassDefFoundError`와 Gradle test output index 오류로 실패했다. 같은 작업을 JDK 21로 고정하면 `clean test --fail-fast`가 통과했고, 약 72초가 걸렸다. CI와 문서도 JDK 21을 기준으로 한다.

즉 이 작업의 1순위는 단순 병렬화가 아니라, 개발자와 CI가 같은 JVM/test 분류 기준으로 재현 가능한 빠른 루프를 갖게 하는 것이다.

## 2. 목표

- 서버 테스트 JVM을 JDK 21로 명시해 로컬 JDK mismatch로 인한 false failure를 없앤다.
- 전체 `test` task는 유지하되, 빠른 개발 루프용 `unitTest`, `integrationTest`, `architectureTest` task를 추가한다.
- Spring Boot integration test의 annotation/properties/DynamicPropertySource 패턴을 통합해 context cache reuse를 높인다.
- E2E는 shared seed DB 때문에 무작정 worker 수를 올리지 않는다. 먼저 cleanup/setup SQL 호출 수와 fixture 충돌을 줄인다.
- Vitest는 순수 Node test와 jsdom React test를 project로 분리해 jsdom 고정비를 줄일 수 있게 한다.
- 현재 검증 명령과 release readiness 기준은 유지한다. 빠른 task는 full check를 대체하지 않는다.

## 3. 비목표

- 커버리지 축소.
- Docker, deployment, public release script 최적화.
- 전체 서버 모듈을 Gradle multi-module로 분리.
- E2E를 즉시 다중 worker로 전환.
- Playwright cross-browser matrix 확대.
- 프런트 타입 오류 전체 정리나 typecheck gate 도입.

## 4. 현재 사실

### 4.1 Front unit

- `front/vitest.config.ts`는 모든 unit test를 `jsdom` environment에서 실행한다.
- 테스트 파일은 `front/tests/**/*.test.{ts,tsx}` 패턴에 들어간다.
- 느린 편인 파일은 대부분 React/jsdom 컴포넌트 테스트다.
  - `tests/unit/host-session-editor.test.tsx`: 약 5초.
  - `tests/unit/current-session.test.tsx`: 약 3초.
  - `tests/unit/my-page.test.tsx`: 약 3초.
- 순수 `.test.ts` 모델/contract/boundary tests도 현재 jsdom 환경을 같이 부담한다.

### 4.2 Server tests

- `server/build.gradle.kts`는 Java toolchain 21을 선언한다.
- CI는 JDK 21을 설치한 뒤 `./server/gradlew -p server clean test`를 실행한다.
- 로컬 current JVM이 JDK 25일 때 전체 서버 테스트가 실패했다.
- JDK 21로 고정한 `clean test --fail-fast`는 통과했다.
- 성공한 JDK 21 run 기준:
  - XML test files: 127.
  - Tests: 805.
  - XML상 테스트 class time 합: 약 24초.
  - Wall time: 약 72초.
- 느린 class:
  - `com.readmates.architecture.ServerArchitectureBoundaryTest`: 약 4.65초.
  - `com.readmates.session.api.HostSessionControllerDbTest`: 약 1.73초.
  - `com.readmates.archive.api.ArchiveAndNotesDbTest`: 약 1.34초.
  - `com.readmates.session.api.HostDashboardControllerTest`: 약 1.22초.
  - `com.readmates.auth.api.MemberProfileControllerTest`: 약 1.08초.
- `@SpringBootTest`가 60개 이상이고, 테스트 종료 로그에서 Hikari pool이 다수 생성/종료된다. Spring context cache가 더 잘 재사용되면 wall time을 줄일 여지가 있다.

### 4.3 Playwright E2E

- `front/playwright.config.ts`는 `fullyParallel: true`이지만 `workers: 1`이다.
- CI는 이미 `--shard=1/3`, `2/3`, `3/3`로 E2E job을 나눠 실행한다.
- E2E helper `runMysql()`은 호출마다 `mysql` CLI subprocess를 실행한다.
- 여러 spec의 `beforeEach`는 cleanup, seed reset, fixture creation을 여러 helper 호출로 나눠 실행한다.
- 같은 seeded host/member/session을 여러 spec이 공유하고 일부 helper는 generated session 전체를 지운다. 이 상태에서 Playwright workers를 올리면 테스트 간 DB state 충돌 가능성이 높다.

## 5. 핵심 결정

### 5.1 JDK 21 고정은 Gradle Test runtime에 직접 건다

개발자 로컬 도구가 jenv, asdf, SDKMAN 중 무엇인지 알 수 없다. 따라서 `.java-version`만 추가하는 방식은 충분하지 않다. `server/build.gradle.kts`의 `Test` task가 Java 21 launcher를 사용하게 설정한다.

Gradle toolchain 문서 기준으로 `Test` task는 `javaLauncher`를 받을 수 있다. 구현은 아래 형태를 사용한다.

```kotlin
val serverTestJavaLauncher = javaToolchains.launcherFor {
    languageVersion.set(JavaLanguageVersion.of(21))
}

tasks.withType<Test>().configureEach {
    javaLauncher.set(serverTestJavaLauncher)
}
```

이 설정은 Gradle daemon JVM 자체를 바꾸지는 않는다. 하지만 test JVM을 JDK 21로 고정해 CI와 로컬 test runtime을 맞춘다.

### 5.2 Fast lanes는 full check를 대체하지 않는다

새 task는 개발 중 빠른 피드백을 위한 것이다.

- `unitTest`: Spring Boot/Testcontainers 없는 순수 unit, model, security helper, adapter unit tests.
- `integrationTest`: Spring Boot, JDBC, Testcontainers MySQL/Redis/Kafka tests.
- `architectureTest`: ArchUnit boundary tests.
- 기존 `test`: 모든 테스트를 계속 실행한다.
- 기존 `clean test`: release readiness와 CI 기준으로 유지한다.

### 5.3 Integration test 표준 annotation을 만든다

지금은 여러 test class가 같은 Spring Boot properties를 각자 선언한다. 이 방식은 drift가 쉽고, Spring context cache key도 흩어질 수 있다.

새 support file에서 공통 annotation과 base class를 둔다.

```kotlin
package com.readmates.support

import org.junit.jupiter.api.Tag
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource

@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.RUNTIME)
@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.auth.session-cookie-secure=false",
    ],
)
@Tag("integration")
annotation class ReadmatesDbIntegrationTest

abstract class ReadmatesMySqlIntegrationTestSupport {
    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
```

Redis/Kafka가 필요한 test는 별도 annotation 또는 base support를 둔다. Redis/Kafka까지 하나의 annotation에 섞지 않는다. 그래야 MySQL-only tests가 불필요한 container를 띄우지 않는다.

### 5.4 E2E worker 증가는 state isolation 이후에만 한다

현재 shared DB/seed 구조에서 `workers: 2`를 바로 적용하는 것은 위험하다. 먼저 아래를 한다.

- cleanup/setup SQL을 test 목적별 batch helper로 묶어 subprocess 수를 줄인다.
- generated row cleanup이 다른 spec의 row를 지우지 않도록 marker/prefix를 둔다.
- status mutation이 필요한 seeded account tests는 serial describe로 명시한다.

그 다음 별도 측정에서 worker 2를 검토한다.

### 5.5 Vitest는 projects를 사용한다

Vitest 3.2.4는 `test.projects`로 같은 config 안에서 node/jsdom project를 나눌 수 있다. Vitest 4에서는 `environmentMatchGlobs`가 제거되므로, 새 설정은 projects 기반으로 둔다.

## 6. 서버 구현 설계

### 6.1 `server/build.gradle.kts`

공통 test runtime helper를 만든다.

```kotlin
val serverTestJavaLauncher = javaToolchains.launcherFor {
    languageVersion.set(JavaLanguageVersion.of(21))
}

fun Test.configureReadmatesTestRuntime() {
    useJUnitPlatform()
    javaLauncher.set(serverTestJavaLauncher)
    jvmArgs("-Xshare:off")
    systemProperty(
        "readmates.frontend.fixtures.dir",
        rootProject.file("../front/tests/unit/__fixtures__").absolutePath,
    )
    systemProperty(
        "readmates.frontend.zod.fixtures.dir",
        rootProject.file("../front/tests/unit/__fixtures__/zod-schemas").absolutePath,
    )

    if (System.getenv("DOCKER_HOST").isNullOrBlank() && colimaDockerSocket.exists()) {
        environment("DOCKER_HOST", "unix://${colimaDockerSocket.absolutePath}")
        environment("TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE", "/var/run/docker.sock")
    }
}

tasks.withType<Test>().configureEach {
    configureReadmatesTestRuntime()
}
```

그 다음 fast lane tasks를 추가한다.

```kotlin
tasks.register<Test>("unitTest") {
    description = "Runs ReadMates unit tests without Spring/Testcontainers integration tags."
    group = "verification"
    configureReadmatesTestRuntime()
    useJUnitPlatform {
        excludeTags("integration", "architecture", "container")
    }
}

tasks.register<Test>("integrationTest") {
    description = "Runs ReadMates Spring Boot and Testcontainers integration tests."
    group = "verification"
    configureReadmatesTestRuntime()
    shouldRunAfter("unitTest")
    useJUnitPlatform {
        includeTags("integration", "container")
    }
}

tasks.register<Test>("architectureTest") {
    description = "Runs ReadMates ArchUnit architecture boundary tests."
    group = "verification"
    configureReadmatesTestRuntime()
    shouldRunAfter("unitTest")
    useJUnitPlatform {
        includeTags("architecture")
    }
}
```

기존 `test` task에는 tag filter를 걸지 않는다. full suite compatibility를 유지한다.

### 6.2 `ServerArchitectureBoundaryTest`

Architecture test class에 tag를 추가한다.

```kotlin
import org.junit.jupiter.api.Tag

@Tag("architecture")
class ServerArchitectureBoundaryTest {
    // existing tests
}
```

### 6.3 Spring Boot integration tests

MySQL 기반 tests는 아래 형태로 바꾼다.

```kotlin
@ReadmatesDbIntegrationTest
class HostDashboardControllerTest : ReadmatesMySqlIntegrationTestSupport() {
    // existing tests
}
```

기존 class-local `@DynamicPropertySource`가 오직 `MySqlTestContainer.registerDatasourceProperties(registry)`만 호출한다면 제거한다. 추가 property가 있는 경우에는 base class를 유지하면서 class-local `@DynamicPropertySource`를 그대로 남긴다.

Redis integration tests는 아래 형태를 사용한다.

```kotlin
@ReadmatesRedisIntegrationTest
class RedisAuthSessionCacheAdapterTest : ReadmatesRedisIntegrationTestSupport() {
    // existing tests
}
```

Kafka integration tests는 아래 형태를 사용한다.

```kotlin
@ReadmatesKafkaIntegrationTest
class NotificationKafkaPipelineIntegrationTest : ReadmatesKafkaIntegrationTestSupport() {
    // existing tests
}
```

Redis/Kafka support는 필요 container만 등록한다. MySQL과 Kafka를 모두 쓰는 test는 combined support class를 명시적으로 둔다.

## 7. E2E 구현 설계

### 7.1 Cleanup batching

`front/tests/e2e/readmates-e2e-db.ts`에 목적별 reset helper를 추가한다.

```ts
type E2eResetOptions = {
  googleLoginEmails?: string[];
  invitedEmails?: string[];
  cleanupGeneratedSessions?: boolean;
  cleanupManualNotifications?: boolean;
};

export function resetE2eState(options: E2eResetOptions) {
  const statements: string[] = [];

  if (options.cleanupManualNotifications) {
    statements.push(manualNotificationCleanupSql());
  }

  if (options.cleanupGeneratedSessions) {
    statements.push(generatedSessionsCleanupSql());
  }

  if (options.invitedEmails?.length) {
    statements.push(invitedMembersCleanupSql(options.invitedEmails));
  }

  if (options.googleLoginEmails?.length) {
    statements.push(seedGoogleLoginsSql(options.googleLoginEmails));
  }

  runMysql(statements.join("\n"));
}
```

기존 `cleanupGeneratedSessions`, `cleanupManualNotificationArtifacts`, `resetSeedGoogleLogins`는 내부 SQL builder를 공유하게 바꾸고 public API는 유지한다. 이렇게 하면 기존 spec을 한 번에 다 바꾸지 않아도 된다.

### 7.2 Worker 증가 보류 조건

`front/playwright.config.ts`의 `workers: 1`은 즉시 바꾸지 않는다. 아래 체크가 통과한 뒤 별도 task로 올린다.

```bash
pnpm --dir front exec playwright test --repeat-each=2
pnpm --dir front exec playwright test --shard=1/3
pnpm --dir front exec playwright test --shard=2/3
pnpm --dir front exec playwright test --shard=3/3
```

`workers: 2` 실험은 아래처럼 일회성 env로 먼저 돌린다.

```bash
PLAYWRIGHT_WORKERS=2 pnpm --dir front exec playwright test --repeat-each=2
```

실험이 안정화되면 config를 이 형태로 바꾼다.

```ts
const workers = Number(process.env.PLAYWRIGHT_WORKERS ?? 1);

export default defineConfig({
  fullyParallel: true,
  workers,
  // existing config
});
```

기본값은 계속 1이다. 이 값은 state isolation이 완성될 때까지 안전장치다.

## 8. Vitest 구현 설계

### 8.1 Config split

`front/vitest.config.ts`는 root alias를 유지하고 `projects`를 사용한다.

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

const frontRoot = path.resolve(__dirname);

export default defineConfig({
  root: frontRoot,
  cacheDir: path.resolve(frontRoot, "node_modules/.vite"),
  resolve: {
    alias: {
      "@": frontRoot,
    },
  },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: [
            "tests/unit/**/*.test.ts",
          ],
          exclude: [
            "tests/unit/**/*.test.tsx",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: [
            "tests/unit/**/*.test.tsx",
            "tests/unit/cloudflare-*.test.ts",
            "tests/unit/proxy-bff-secret.test.ts",
          ],
          setupFiles: ["./tests/setup.ts"],
        },
      },
    ],
  },
});
```

Cloudflare function tests may need Web APIs such as `Request`, `Response`, `Headers`, and `URL`. Run them under node first only if Node 24 provides all required globals. If a test fails due missing DOM/Web APIs, keep that file in the jsdom project.

### 8.2 Verification

```bash
pnpm --dir front test -- --reporter=verbose
pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
pnpm --dir front exec vitest run tests/unit/host-session-editor.test.tsx
```

Expected:

- All tests pass.
- Report shows `node` and `jsdom` projects.
- Total wall time does not regress by more than 10 percent.

## 9. Rollout 순서

1. JDK 21 test launcher 고정.
2. Server test tag fast lanes 추가.
3. Server integration annotation/base support 통합.
4. E2E cleanup batching.
5. Vitest node/jsdom project split.
6. Worker 2 experiment only after E2E isolation evidence.

## 10. 검증 매트릭스

| 변경 | 빠른 검증 | 최종 검증 |
| --- | --- | --- |
| JDK 21 launcher | `./server/gradlew -p server test --tests com.readmates.auth.domain.MembershipStatusTest --info` | `./server/gradlew -p server clean test` |
| Gradle fast lanes | `./server/gradlew -p server unitTest integrationTest architectureTest --dry-run` | `./server/gradlew -p server unitTest integrationTest architectureTest` |
| Integration annotation | 대표 DB test 2개 targeted run | `./server/gradlew -p server clean test` |
| E2E cleanup batching | `pnpm --dir front test:e2e -- manual-notifications` | `pnpm --dir front test:e2e` |
| Vitest projects | `pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts` | `pnpm --dir front test` |

## 11. 리스크와 완화

- JUnit tag 누락: `unitTest`에 integration test가 섞일 수 있다. 첫 작업에서는 full `test`를 유지하고, `integrationTest` count를 문서에 기록한다.
- Spring context cache 변경으로 hidden order dependency가 드러날 수 있다. 대표 DB tests를 먼저 바꾸고 full suite를 돌린다.
- E2E cleanup batching이 SQL 순서를 바꾸면 foreign key cleanup이 실패할 수 있다. 기존 helper SQL 순서를 유지하고, SQL builder만 공유한다.
- Vitest project split이 Web API availability 차이를 드러낼 수 있다. Cloudflare/BFF tests는 실패 시 jsdom project에 둔다.
- 로컬 Docker/Testcontainers 환경 차이는 계속 남는다. JDK 21 고정은 JVM mismatch만 해결한다.

## 12. 완료 기준

- JDK 21 launcher 설정이 들어가고 JDK 25 current shell에서도 서버 targeted test가 JDK 21 test runtime으로 실행된다.
- `unitTest`, `integrationTest`, `architectureTest`, 기존 `test`가 모두 실행 가능하다.
- Spring Boot integration test annotation drift가 줄어든다.
- E2E cleanup helper 호출 수가 줄고 기존 E2E가 통과한다.
- 프런트 unit suite가 node/jsdom projects로 나뉘거나, 측정 결과 이득이 작으면 보류 이유가 문서화된다.
- 최종 보고에는 실제 wall time 변화와 실패/스킵한 검증이 포함된다.
