# ReadMates front/server 빌드 최적화 상세 구현 문서

작성일: 2026-05-14
상태: 구현 대기
연결 플랜: `docs/superpowers/plans/2026-05-14-readmates-build-optimization-implementation-plan.md`
대상 표면: `front/` Vite bundle, `server/` Gradle/Spring Boot build, server Docker image build

## 1. 배경

최근 점검에서 ReadMates의 순수 빌드 시간은 이미 짧았다. `pnpm --dir front build`는 로컬 기준 1초 미만에 끝났고, 서버 `bootJar -x test`도 증분 빌드에서는 1초 안팎으로 끝난다. 따라서 이 작업은 "느린 빌드를 빠르게 만드는 긴급 대응"이 아니라 다음 세 가지를 작게 개선하는 작업이다.

- 서버 Gradle 반복 실행에서 configuration phase 비용을 줄인다.
- 서버 배포 이미지가 fat jar 한 레이어에 묶이는 구조를 Spring Boot layered jar 구조와 맞춘다.
- 프런트 초기 route bundle에 public/member/admin 화면 코드가 한 번에 섞이는 부분을 route 단위 lazy import로 줄인다.

현재 별도 이슈로 `pnpm --dir front exec tsc --noEmit`은 여러 타입 오류를 보고한다. 이 문서는 타입체크 정리까지 같은 작업에 섞지 않는다. 타입체크 gate 도입은 가치가 크지만, 현재 WIP 변경과 충돌할 수 있고 빌드 최적화보다 훨씬 넓은 안정성 작업이다.

## 2. 목표

- `server/gradle.properties`로 Gradle configuration cache를 기본 활성화한다.
- `bootJar` 산출물이 배포 source of truth임을 명확히 하고 plain jar 생성을 끈다.
- `server/Dockerfile`과 `server/Dockerfile.release`가 Spring Boot layered jar를 사용해 dependency/application layer를 분리한다.
- 프런트 route 정의에서 public, member, admin route의 정적 page import를 줄이고, route lazy import로 초기 `index` chunk를 낮춘다.
- 최적화 전후 bundle size와 build behavior를 명령 출력으로 기록한다.
- 기존 public repo safety 원칙을 유지한다. 실제 도메인, secret, token-shaped 예시, 개인 로컬 경로는 추가하지 않는다.

## 3. 비목표

- 프런트 타입 오류 전체 수정과 CI typecheck gate 추가.
- React Router 구조 재설계.
- 서버 dependency pruning, Spring starter 교체, Redis/Kafka 기능 제거.
- Docker base image 교체 또는 distroless 전환.
- GitHub Actions 워크플로 전체 재설계.
- 운영 배포 실행 또는 실제 GHCR publish.

## 4. 현재 사실

### 4.1 Front

- `front/package.json`의 build script는 `vite build`만 실행한다.
- `front/vite.config.ts`는 `node_modules`를 `vendor` chunk로 묶고 `chunkSizeWarningLimit`를 350KB로 둔다.
- `front/src/app/router.tsx`는 일부 무거운 member/feedback/archive/host route를 이미 lazy import한다.
- 같은 파일에서 public page, app home, notes, my page, member notifications, platform admin route는 정적 import된다.
- 최근 산출물의 큰 chunk는 `vendor`, `index`, `host`, CSS다. 숫자는 작업 시작 시 다시 측정한다.
- production bundle에서 `zod` 런타임 validator는 `import.meta.env.DEV` guard로 제거되고, 최근 산출물 검색에서도 `Zod` 문자열은 발견되지 않았다.

### 4.2 Server

- `server/build.gradle.kts`는 Kotlin 2.2, Spring Boot 4.0, Gradle wrapper 9.1을 사용한다.
- `server/gradle.properties`는 아직 없다.
- `bootJar`는 `BOOT-INF/layers.idx`를 포함하는 layered executable jar를 만든다.
- 현재 Dockerfile들은 layered jar metadata를 사용하지 않고 jar 파일 전체를 `/app/readmates-server.jar`로 복사한 뒤 `java -jar`로 실행한다.
- `server/Dockerfile.release`는 GitHub Actions `Deploy Server Image` workflow가 이미 테스트를 통과한 jar를 image에 넣기 위해 사용한다.
- `server/Dockerfile`은 로컬 재현용 multi-stage image build로 유지된다.

## 5. 작업 순서 결정

1. 서버 Gradle configuration cache를 먼저 적용한다.
   - 독립적이고 영향 범위가 작다.
   - 실패하면 Gradle 옵션만 되돌리면 된다.
2. plain jar 비활성화를 적용한다.
   - 배포 산출물이 `bootJar` 하나로 정리된다.
   - Dockerfile이 exact boot jar name을 복사하도록 이미 맞춰져 있어 확인이 쉽다.
3. Docker layered image를 적용한다.
   - Spring Boot jar에는 이미 `layers.idx`가 있으므로 build.gradle 변경보다 Dockerfile 변경이 핵심이다.
   - `server/Dockerfile`과 `server/Dockerfile.release` runtime instruction을 계속 맞춘다.
4. 프런트 route lazy split을 적용한다.
   - 초기 bundle 변경은 UI/route regression 가능성이 있어 서버 build config보다 뒤에 둔다.
   - public/admin/member route를 먼저 나누고, host route 세분화는 bundle 측정 결과가 필요할 때 별도 후속으로 둔다.

## 6. 서버 Gradle 설계

### 6.1 `server/gradle.properties`

새 파일을 만든다.

```properties
org.gradle.configuration-cache=true
```

이번 작업에서는 `org.gradle.caching=true`를 넣지 않는다. Testcontainers와 DB/Kafka 통합 테스트가 있는 프로젝트에서 test task output cache 정책은 별도 검토가 필요하다. configuration cache는 Gradle configuration phase를 줄이는 목적이고, test 실행 자체를 건너뛰는 목적이 아니다.

### 6.2 Plain jar 비활성화

`server/build.gradle.kts`에 boot jar만 배포 산출물로 남기기 위한 설정을 추가한다.

```kotlin
tasks.named<org.gradle.jvm.tasks.Jar>("jar") {
    enabled = false
}
```

위 설정은 `tasks.withType<Test>` 블록보다 앞에 둔다. `bootJar`는 Spring Boot plugin의 executable jar task라서 계속 생성된다.

### 6.3 Gradle 검증

필수 명령:

```bash
./server/gradlew -p server clean bootJar -x test
./server/gradlew -p server bootJar -x test
./server/gradlew -p server test --dry-run
```

기대:

- 첫 번째 명령은 `BUILD SUCCESSFUL`.
- 두 번째 명령은 configuration cache reuse 메시지를 보여야 한다.
- `server/build/libs/readmates-server-0.0.1-SNAPSHOT.jar`가 존재한다.
- `server/build/libs/readmates-server-0.0.1-SNAPSHOT-plain.jar`는 존재하지 않는다.

전체 테스트는 최종 검증에서 실행한다.

```bash
./server/gradlew -p server clean test
```

## 7. Docker layered image 설계

### 7.1 Release Dockerfile

`server/Dockerfile.release`는 CI에서 만든 jar를 layer extraction stage로 넘긴다.

```dockerfile
FROM eclipse-temurin:21-jre-jammy AS layers

WORKDIR /layers
COPY build/libs/readmates-server-0.0.1-SNAPSHOT.jar readmates-server.jar
RUN java -Djarmode=layertools -jar readmates-server.jar extract

FROM eclipse-temurin:21-jre-jammy

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system readmates \
    && useradd --system --gid readmates --home-dir /app --shell /usr/sbin/nologin readmates

WORKDIR /app
COPY --from=layers /layers/dependencies/ ./
COPY --from=layers /layers/spring-boot-loader/ ./
COPY --from=layers /layers/snapshot-dependencies/ ./
COPY --from=layers /layers/application/ ./
RUN chown -R readmates:readmates /app

USER readmates
EXPOSE 8080 8081

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "org.springframework.boot.loader.launch.JarLauncher"]
```

### 7.2 Local Dockerfile

`server/Dockerfile`는 기존 builder stage를 유지하고, builder stage의 boot jar를 같은 layer extraction flow로 넘긴다.

```dockerfile
FROM eclipse-temurin:21-jdk-jammy AS builder

WORKDIR /build
COPY gradlew gradlew.bat settings.gradle.kts build.gradle.kts ./
COPY gradle ./gradle
COPY src ./src
RUN ./gradlew bootJar --no-daemon

FROM eclipse-temurin:21-jre-jammy AS layers

WORKDIR /layers
COPY --from=builder /build/build/libs/readmates-server-0.0.1-SNAPSHOT.jar readmates-server.jar
RUN java -Djarmode=layertools -jar readmates-server.jar extract

FROM eclipse-temurin:21-jre-jammy

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system readmates \
    && useradd --system --gid readmates --home-dir /app --shell /usr/sbin/nologin readmates

WORKDIR /app
COPY --from=layers /layers/dependencies/ ./
COPY --from=layers /layers/spring-boot-loader/ ./
COPY --from=layers /layers/snapshot-dependencies/ ./
COPY --from=layers /layers/application/ ./
RUN chown -R readmates:readmates /app

USER readmates
EXPOSE 8080 8081

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "org.springframework.boot.loader.launch.JarLauncher"]
```

### 7.3 Docker 검증

필수 명령:

```bash
./server/gradlew -p server clean bootJar -x test
docker build -f server/Dockerfile.release -t readmates-server:layered-release server
docker run --rm --entrypoint sh readmates-server:layered-release -c 'test -f org/springframework/boot/loader/launch/JarLauncher.class && test -d BOOT-INF/classes && test -d BOOT-INF/lib'
docker build -f server/Dockerfile -t readmates-server:layered-local server
```

이미지 smoke는 로컬 MySQL/Redis/Kafka가 필요한 full server startup 대신 entrypoint layout 검증까지만 필수로 둔다. 배포 compose health check는 별도 release 검증에서 확인한다.

## 8. 프런트 route lazy split 설계

### 8.1 원칙

- `front/src/app/router.tsx`의 route-first 소유권을 유지한다.
- UI 컴포넌트가 API나 router state를 직접 끌어오는 기존 금지선을 넓히지 않는다.
- route lazy import는 page component와 loader/action module을 같은 route object에서 함께 반환한다.
- route별 fallback과 error element 문구는 기존과 동일하게 유지한다.
- public route split은 public URL, club slug path fallback, login/invite/reset path를 변경하지 않는다.

### 8.2 Public route 예시

기존 정적 import를 제거하고 route object에서 lazy로 가져온다.

```tsx
{
  path: "/",
  errorElement: <PublicRouteError />,
  hydrateFallbackElement: <ReadmatesRouteLoading label="공개 홈을 불러오는 중" variant="public" />,
  lazy: async () => {
    const [{ default: PublicHomePage }, { publicClubLoader }] = await Promise.all([
      import("@/src/pages/public-home"),
      import("@/features/public/route/public-route-data"),
    ]);
    return { Component: PublicHomePage, loader: publicClubLoader };
  },
}
```

`/about`, `/records`, `/sessions/:sessionId`, `/clubs/:clubSlug/**`도 같은 방식으로 바꾼다.

### 8.3 Auth-only public route 예시

loader가 없는 route는 component만 lazy로 반환한다.

```tsx
{
  path: "/login",
  lazy: async () => {
    const { default: LoginPage } = await import("@/src/pages/login");
    return { Component: LoginPage };
  },
}
```

`/invite/:token`, `/clubs/:clubSlug/invite/:token`, `/reset-password/:token`도 같은 패턴을 사용한다.

### 8.4 Member route 예시

member home은 helper를 유지하되 정적 import를 없앤다.

```tsx
function memberHomeRoute(): RouteObject {
  return {
    index: true,
    errorElement: <ArchiveRouteError />,
    hydrateFallbackElement: <ReadmatesRouteLoading label="멤버 홈을 불러오는 중" variant="member" />,
    lazy: async () => {
      const [{ default: AppHomePage }, { memberHomeLoader }] = await Promise.all([
        import("@/src/pages/app-home"),
        import("@/features/member-home/route/member-home-data"),
      ]);
      return { Component: AppHomePage, loader: memberHomeLoader };
    },
  };
}
```

current session은 specific route error를 유지하기 위해 lazy result에서 `ErrorBoundary`를 반환한다.

```tsx
{
  path: "session/current",
  hydrateFallbackElement: <ReadmatesRouteLoading label="세션을 불러오는 중" variant="member" />,
  lazy: async () => {
    const {
      CurrentSessionRoute,
      CurrentSessionRouteError,
      currentSessionAction,
      currentSessionLoader,
    } = await import("@/features/current-session");

    function CurrentSessionRouteElement() {
      return <CurrentSessionRoute internalLinkComponent={currentSessionInternalLink} />;
    }

    return {
      Component: CurrentSessionRouteElement,
      ErrorBoundary: CurrentSessionRouteError,
      action: currentSessionAction,
      loader: currentSessionLoader,
    };
  },
}
```

`notes`, `me`, `notifications`, top-level pending approval, club selection도 같은 원칙으로 정적 page import를 줄인다.

### 8.5 Platform admin route 예시

admin page는 guard wrapper component를 lazy result 내부에서 만든다.

```tsx
{
  path: "/admin",
  errorElement: <RouteErrorBoundary variant="auth" />,
  hydrateFallbackElement: <ReadmatesRouteLoading label="플랫폼 관리를 불러오는 중" variant="member" />,
  lazy: async () => {
    const [{ PlatformAdminRoute }, { platformAdminLoader }] = await Promise.all([
      import("@/features/platform-admin/route/platform-admin-route"),
      import("@/features/platform-admin/route/platform-admin-data"),
    ]);

    function PlatformAdminRouteElement() {
      return (
        <RequirePlatformAdmin>
          <PlatformAdminRoute />
        </RequirePlatformAdmin>
      );
    }

    return { Component: PlatformAdminRouteElement, loader: platformAdminLoader };
  },
}
```

### 8.6 Host route 세분화는 후속 후보

현재 host route는 lazy이지만 `@/features/host` barrel과 `front/src/app/host-route-elements.tsx`가 host route component를 한 번에 import한다. 지금 host chunk는 큰 병목은 아니므로 첫 구현 범위에서는 다음만 한다.

- `router.tsx`의 lazy loader import를 `@/features/host` barrel에서 exact data module import로 바꾼다.
- `host-route-elements.tsx`의 import도 `@/features/host/route/*` exact import로 바꿔 barrel coupling을 줄인다.

host dashboard/members/notifications/session editor를 별도 route element module로 쪼개는 작업은 before/after bundle 측정에서 host chunk가 계속 커질 때 별도 PR로 처리한다.

## 9. 프런트 검증

필수 명령:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

bundle 비교:

```bash
find front/dist/assets -maxdepth 1 -type f -name '*.js' -print0 | xargs -0 du -h | sort -h
find front/dist/assets -maxdepth 1 -type f -name '*.css' -print0 | xargs -0 du -h | sort -h
```

기대:

- route 동작 테스트가 통과한다.
- Vite build가 통과한다.
- `index` JS chunk gzip 크기가 감소하거나 동일해야 한다. 동일한 경우에는 어떤 route import가 남아 있는지 기록한다.
- 단일 JS chunk가 `chunkSizeWarningLimit` 350KB를 넘지 않는다.

route lazy split은 route behavior 변경 가능성이 있으므로 아래 targeted tests를 우선 확인한다.

```bash
pnpm --dir front test -- tests/unit/spa-router.test.tsx tests/unit/public-navigation-auth.test.tsx tests/unit/route-guards.test.tsx tests/unit/frontend-boundaries.test.ts
```

## 10. 최종 수용 기준

- 서버:
  - `./server/gradlew -p server clean bootJar -x test` 통과.
  - `./server/gradlew -p server bootJar -x test`에서 configuration cache 재사용 확인.
  - `./server/gradlew -p server clean test` 통과.
  - release/local Dockerfile build가 모두 통과.
- 프런트:
  - `pnpm --dir front lint` 통과.
  - `pnpm --dir front test` 통과.
  - `pnpm --dir front build` 통과.
  - before/after chunk size를 PR 설명이나 변경 문서에 남긴다.
- 문서:
  - 최적화가 배포 runbook 내용을 바꿨다면 관련 deploy doc을 함께 수정한다.
  - 변경 문서에 private data, real secret, token-shaped value가 없다.

## 11. 잔여 리스크

- Gradle configuration cache는 일부 task/plugin과 충돌할 수 있다. `bootJar`, `test --dry-run`, 전체 `clean test`가 모두 통과해야 기본값으로 유지한다.
- Docker layered entrypoint는 `java -jar`가 아니라 `JarLauncher`를 직접 호출한다. layout 검증과 image build를 반드시 통과시킨다.
- route lazy split은 route error boundary와 hydrate fallback semantics를 바꿀 수 있다. router 단위 테스트와 public/member guard 테스트를 함께 돌린다.
- front `typecheck` 실패는 이 작업이 새로 만든 문제가 아니다. 다만 lazy split 중 새 타입 오류를 만들지 않도록 가능하면 touched file 중심으로 TypeScript 오류를 확인한다.
