# ReadMates 코드베이스 개선 구현 계획서

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 코드 기준으로 확인된 보안, 운영 안정성, 라우팅 타입, 로컬 개발 안전성 항목을 작은 PR 단위로 개선합니다.

**Architecture:** Task 1-4와 Task 7은 서버 변경이고, Task 5-6은 프론트엔드 변경이며, Task 8은 로컬 개발 설정/문서 변경입니다. Task 9는 대형 컴포넌트 리팩터링을 이 계획에서 직접 수행하지 않고 별도 계획서로 분리합니다. Task 1-2는 auth/security 경계에 영향을 주므로 먼저 처리하고, Task 5-6은 route-state helper와 테스트가 겹치므로 같은 PR 또는 순차 PR로 처리합니다.

**Tech Stack:** Kotlin + Spring Boot 3 + Spring Security 6, Spring Kafka 4, React 19 + TypeScript + Vitest, Docker Compose.

---

## 검토 반영 요약

| # | 우선순위 | 파일 | 조정 내용 |
|---|----------|------|-----------|
| 1 | HIGH | `SecurityConfig.kt`, `MemberProfileControllerTest.kt` | `permitAll()` 제거는 맞지만, 기존 인증 누락 테스트의 structured JSON 401 기대값을 Spring Security entrypoint의 빈 401 기준으로 조정해야 합니다. |
| 2 | HIGH | `OAuthReturnState.kt`, `application.yml`, test config | `application.yml`뿐 아니라 `@Value` 기본값과 `ifEmpty` fallback도 제거해야 합니다. 테스트용 secret 설정도 필요합니다. |
| 3 | MEDIUM | `NotificationDispatchService.kt`, `NotificationDeliveryProcessingService.kt` | retry delay 하드코딩은 Kafka consumer dispatch 경로와 worker processing 경로에 모두 있으므로 둘 다 같은 설정을 사용해야 합니다. |
| 4 | MEDIUM | `NotificationKafkaConfiguration.kt` | `setVerifyPartition(false)`만 제거해도 `TopicPartition(..., -1)`이면 검증이 건너뛰어집니다. 원본 partition을 DLT destination에 명시해야 합니다. |
| 5 | MEDIUM | `front/tests/unit/route-continuity.test.ts`, `front/tests/unit/auth-context.test.tsx` | app route 관련 테스트는 이미 있습니다. 새 빈 껍데기 테스트 파일을 만들지 말고 기존 unit suite를 확장합니다. |
| 6 | MEDIUM | `front/shared/routing/*`, host route/ui | feature UI가 `src/app`을 import하면 route-first 경계를 어깁니다. 공통 route-state 타입은 `shared/routing`으로 옮기거나 app에서 주입해야 합니다. |
| 7 | MEDIUM | `InvitationService.kt`, `HostInvitationControllerTest.kt` | DB schema의 email 길이 320자에 맞춰 `normalizeEmail()`에서 persistence 이전 길이 검증을 추가합니다. |
| 8 | LOW | `compose.yml`, `.env.example`, `docs/development/local-setup.md` | 로컬 MySQL credential은 운영 secret은 아니지만, Compose env variable로 분리해 local override를 쉽게 합니다. |
| 9 | MEDIUM | 대형 프론트 UI 파일 3개 | `host-dashboard.tsx`, `my-page.tsx`, `host-session-editor.tsx` 분리는 별도 계획서 3개로 다룹니다. |

## 공통 실행 규칙

- 서버 작업 전에는 `docs/agents/server.md`, 프론트 작업 전에는 `docs/agents/front.md`, 문서/설정 작업 전에는 `docs/agents/docs.md`를 다시 확인합니다.
- 실제 member data, secret, private domain, OCID, token-shaped example을 새로 추가하지 않습니다.
- auth/API/BFF/user-flow 변경은 서버 unit test만으로 끝내지 말고 `pnpm --dir front test:e2e` 실행 또는 스킵 사유를 남깁니다.
- 프론트 route/auth 변경은 `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`를 실행합니다.
- 서버 변경은 최종적으로 `./server/gradlew -p server clean test`를 실행합니다.

---

## 파일 변경 지도

**Task 1 - SecurityConfig 인증 강화**
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/MemberProfileControllerTest.kt`

**Task 2 - OAuth return-state secret fail-fast**
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/OAuthReturnState.kt`
- Modify: `server/src/main/resources/application.yml`
- Modify: `server/src/main/resources/application-dev.yml`
- Modify: `server/src/test/resources/application.yml`
- Test: `server/src/test/kotlin/com/readmates/auth/infrastructure/security/OAuthReturnStateTest.kt`

**Task 3 - 알림 email delivery retry policy 외부화**
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDispatchService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDeliveryProcessingService.kt`
- Modify: `server/src/main/resources/application.yml`
- Modify tests under `server/src/test/kotlin/com/readmates/notification/application/service/`

**Task 4 - Kafka DLT partition 검증 복원**
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/kafka/NotificationKafkaConfiguration.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/adapter/out/kafka/KafkaNotificationEventPublisherAdapterTest.kt`

**Task 5 - 기존 route/auth test 보강**
- Modify: `front/tests/unit/route-continuity.test.ts`
- Modify: `front/tests/unit/auth-context.test.tsx`

**Task 6 - router state 타입 경계 정리**
- Create: `front/shared/routing/readmates-route-state.ts`
- Modify: `front/src/app/route-continuity.ts`
- Modify: `front/features/host/route/host-dashboard-route.tsx`
- Modify: `front/features/host/route/host-session-editor-route.tsx`
- Modify: `front/features/host/ui/host-dashboard.tsx`
- Modify: `front/features/host/ui/host-session-editor.tsx`
- Modify: `front/features/host/ui/host-session-feedback-upload.tsx`

**Task 7 - invitation email 길이 검증**
- Modify: `server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/HostInvitationControllerTest.kt`

**Task 8 - local Compose credential env 분리**
- Modify: `compose.yml`
- Modify: `.env.example`
- Modify: `docs/development/local-setup.md`

**Task 9 - 대형 컴포넌트 분리 계획서 작성**
- Create: `docs/superpowers/plans/2026-05-05-readmates-host-dashboard-split-plan.md`
- Create: `docs/superpowers/plans/2026-05-05-readmates-my-page-split-plan.md`
- Create: `docs/superpowers/plans/2026-05-05-readmates-host-session-editor-split-plan.md`

---

## Task 1: SecurityConfig - 프로필 PATCH endpoint를 Spring Security 경계로 보호

**배경:** 현재 `SecurityConfig.kt`는 두 profile PATCH endpoint를 `permitAll()`로 먼저 매칭합니다. service layer가 null 인증을 막고 있어 실제 무단 수정은 막히지만, Spring Security authorization boundary를 우회합니다.

- [x] **Step 1: 기존 테스트 기대값 조정**

`MemberProfileControllerTest.kt`의 기존 테스트 두 개를 Spring Security entrypoint 기준으로 바꿉니다.

```kotlin
@Test
fun `own profile update requires Spring Security authentication`() {
    mockMvc.patch("/api/me/profile") {
        header("X-Readmates-Bff-Secret", "test-bff-secret")
        header("Origin", "http://localhost:3000")
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = """{"displayName":"NoSession"}"""
    }.andExpect {
        status { isUnauthorized() }
        content { string("") }
    }
}

@Test
fun `host profile update requires Spring Security authentication`() {
    val targetMembershipId = membershipIdForEmail(insertProfileMember("host.anonymous", "ACTIVE", shortName = "Blocked"))

    mockMvc.patch("/api/host/members/$targetMembershipId/profile") {
        header("X-Readmates-Bff-Secret", "test-bff-secret")
        header("Origin", "http://localhost:3000")
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = """{"displayName":"NoSession"}"""
    }.andExpect {
        status { isUnauthorized() }
        content { string("") }
    }

    assertEquals("Blocked", shortNameForMembership(targetMembershipId))
}
```

- [x] **Step 2: 실패 확인**

```bash
./server/gradlew -p server test --tests "com.readmates.auth.api.MemberProfileControllerTest"
```

Expected: 위 두 테스트가 현재 `permitAll()` 때문에 structured JSON 401을 받아 실패합니다.

- [x] **Step 3: `permitAll()` 두 줄을 `authenticated()`로 교체**

`SecurityConfig.kt`에서 아래 두 `permitAll()` matcher는 원 계획의 삭제 의도와 달리 repo architecture에 맞춰 `authenticated()`로 교체합니다. `/api/me/profile`은 authenticated `VIEWER`/`ACTIVE`/`SUSPENDED` 사용자가 `MemberProfileService`의 profile-specific authorization까지 도달해야 하고, `/api/host/members/{id}/profile`은 authenticated non-host가 service의 structured `HOST_ROLE_REQUIRED` 응답을 받을 수 있어야 합니다. CSRF ignore matcher는 기존 프론트/BFF 호출 방식 때문에 그대로 둡니다.

```kotlin
.requestMatchers(methodAndPath("PATCH", Regex("^/api/me/profile$"))).authenticated()
.requestMatchers(methodAndPath("PATCH", Regex("^/api/host/members/[^/]+/profile$"))).authenticated()
```

- [x] **Step 4: 검증**

```bash
./server/gradlew -p server test --tests "com.readmates.auth.api.MemberProfileControllerTest"
./server/gradlew -p server clean test
pnpm --dir front test:e2e
```

If `pnpm --dir front test:e2e` cannot run because the local browser or server fixture is unavailable, report that explicitly.

Actual: `MemberProfileControllerTest`, `clean test`, and `git diff --check` passed. `pnpm --dir front test:e2e` was attempted but blocked by the local `readmates_e2e` Flyway checksum state; a non-destructive retry with a fresh DB name was blocked because the local MySQL user cannot create that database.

- [x] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt \
        server/src/test/kotlin/com/readmates/auth/api/MemberProfileControllerTest.kt
git commit -m "fix: require Spring Security auth for profile PATCH endpoints"
```

---

## Task 2: OAuthReturnState - return-state secret 기본값 제거

**배경:** OAuth return state는 `returnTo`를 서명하는 보안 경계입니다. production에서 env가 빠져도 공개 dev fallback으로 시작되면 silent 취약점이 됩니다.

- [ ] **Step 1: failing unit test 추가**

`OAuthReturnStateTest.kt`를 추가합니다.

```kotlin
package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.port.out.TrustedReturnHostPort
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.Duration

class OAuthReturnStateTest {
    private val trustedReturnHostPort = object : TrustedReturnHostPort {
        override fun activeClubSlugForHost(host: String): String? = null
    }

    @Test
    fun `fails fast when return state secret is blank`() {
        assertThatThrownBy {
            OAuthReturnState(
                secret = "   ",
                appBaseUrl = "http://localhost:3000",
                ttl = Duration.ofMinutes(10),
                sessionCookieDomain = "",
                trustedReturnHostPort = trustedReturnHostPort,
            )
        }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("readmates.auth.return-state-secret")
    }
}
```

- [ ] **Step 2: config fallback 제거**

```yaml
readmates:
  auth:
    return-state-secret: ${READMATES_AUTH_RETURN_STATE_SECRET:}
```

`OAuthReturnState.kt`의 `@Value` fallback과 `ifEmpty` fallback도 제거합니다.

```kotlin
@Value("\${readmates.auth.return-state-secret}")
secret: String,
```

```kotlin
private val normalizedSecret = secret.trim().also {
    require(it.isNotEmpty()) {
        "readmates.auth.return-state-secret must be set via READMATES_AUTH_RETURN_STATE_SECRET"
    }
}
```

- [ ] **Step 3: dev/test profile에 public-safe test secret 추가**

`application-dev.yml`:

```yaml
readmates:
  auth:
    return-state-secret: "dev-return-state-secret-for-local-only"
```

`server/src/test/resources/application.yml`:

```yaml
readmates:
  bff-secret-required: false
  auth:
    return-state-secret: "test-return-state-secret-for-local-tests"
```

- [ ] **Step 4: OAuth 관련 테스트 property 정리**

기존 `GoogleOAuthLoginSessionTest`와 `InviteAwareOAuthTest`에 있는 explicit test property는 유지해도 되고, `server/src/test/resources/application.yml`의 공통 test secret으로 대체해도 됩니다. 한 가지 방식으로 통일합니다.

- [ ] **Step 5: 검증**

```bash
./server/gradlew -p server test --tests "com.readmates.auth.infrastructure.security.OAuthReturnStateTest"
./server/gradlew -p server test --tests "com.readmates.auth.infrastructure.security.InviteAwareOAuthTest"
./server/gradlew -p server test --tests "com.readmates.auth.api.GoogleOAuthLoginSessionTest"
./server/gradlew -p server clean test
```

- [ ] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/auth/infrastructure/security/OAuthReturnState.kt \
        server/src/main/resources/application.yml \
        server/src/main/resources/application-dev.yml \
        server/src/test/resources/application.yml \
        server/src/test/kotlin/com/readmates/auth/infrastructure/security/OAuthReturnStateTest.kt
git commit -m "fix: fail fast when OAuth return-state secret is missing"
```

---

## Task 3: Notification email delivery retry delay 외부화

**배경:** email delivery retry delay가 `NotificationDispatchService`와 `NotificationDeliveryProcessingService`에 각각 하드코딩되어 있습니다. Kafka consumer path와 worker path가 같은 운영 정책을 사용해야 합니다.

- [ ] **Step 1: application.yml에 설정 추가**

`readmates.notifications` 아래에 추가합니다.

```yaml
readmates:
  notifications:
    retry-delay-minutes: ${READMATES_NOTIFICATION_RETRY_DELAY_MINUTES:5,15,60,240}
```

- [ ] **Step 2: 두 service constructor에 같은 설정 주입**

`NotificationDispatchService`와 `NotificationDeliveryProcessingService` 모두 아래 parameter를 추가합니다.

```kotlin
@param:Value("\${readmates.notifications.retry-delay-minutes:5,15,60,240}")
private val retryDelayMinutesConfig: List<Long>,
```

그리고 기존 상수 참조를 아래처럼 바꿉니다.

```kotlin
private fun retryDelayMinutes(attemptCount: Int): Long {
    val delays = retryDelayMinutesConfig.ifEmpty { listOf(5L, 15L, 60L, 240L) }
    return delays[attemptCount.coerceIn(0, delays.lastIndex)]
}
```

- [ ] **Step 3: 테스트 생성자 호출 업데이트**

`NotificationDispatchServiceTest`, `NotificationDeliveryProcessingServiceTest`, `HostNotificationOperationsServiceTest`, `JdbcNotificationDeliveryAdapterTest`에서 직접 생성하는 service에 `retryDelayMinutesConfig = listOf(5L, 15L, 60L, 240L)`를 명시합니다. 가능하면 test helper factory를 만들어 반복을 줄입니다.

- [ ] **Step 4: custom delay 테스트 추가**

`NotificationDispatchServiceTest`와 `NotificationDeliveryProcessingServiceTest`에 각각 custom delay가 적용되는 테스트를 추가합니다.

```kotlin
val service = NotificationDispatchService(
    deliveryPort,
    mailPort,
    dispatchTestMetrics(),
    maxAttempts = 5,
    retryDelayMinutesConfig = listOf(2L, 4L, 8L),
)
```

Expected: `attemptCount = 1` 실패 시 `delayMinutes`가 `4L`입니다.

- [ ] **Step 5: 검증**

```bash
./server/gradlew -p server test --tests "com.readmates.notification.application.service.NotificationDispatchServiceTest"
./server/gradlew -p server test --tests "com.readmates.notification.application.service.NotificationDeliveryProcessingServiceTest"
./server/gradlew -p server test --tests "com.readmates.notification.*"
./server/gradlew -p server clean test
```

- [ ] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification/application/service/NotificationDispatchService.kt \
        server/src/main/kotlin/com/readmates/notification/application/service/NotificationDeliveryProcessingService.kt \
        server/src/main/resources/application.yml \
        server/src/test/kotlin/com/readmates/notification/application/service/NotificationDispatchServiceTest.kt \
        server/src/test/kotlin/com/readmates/notification/application/service/NotificationDeliveryProcessingServiceTest.kt
git commit -m "feat: configure notification email retry delays"
```

---

## Task 4: Kafka DLT partition 검증이 실제로 동작하도록 수정

**배경:** `setVerifyPartition(false)`를 제거하는 것만으로는 부족합니다. 현재 destination resolver가 `TopicPartition(dlqTopic, -1)`을 반환하므로 Spring Kafka는 partition 검증을 건너뜁니다.

- [ ] **Step 1: DLT destination을 원본 partition으로 변경**

```kotlin
DeadLetterPublishingRecoverer(kafkaOperations) { record, _ ->
    TopicPartition(properties.dlqTopic, record.partition())
}
```

그리고 아래 줄을 제거합니다.

```kotlin
it.setVerifyPartition(false)
```

- [ ] **Step 2: 기존 test 기대값 수정**

`KafkaNotificationEventPublisherAdapterTest`의 `dead letter recoverer publishes to configured notification dlq topic`는 partition이 `null`이 아니라 원본 record partition인 `2`임을 검증해야 합니다.

```kotlin
assertThat(captor.value.topic()).isEqualTo("custom.notification.dlq.v1")
assertThat(captor.value.partition()).isEqualTo(2)
assertThat(captor.value.key()).isEqualTo("club-key")
assertThat(captor.value.value()).isEqualTo(record.value())
```

- [ ] **Step 3: 검증**

```bash
./server/gradlew -p server test --tests "com.readmates.notification.adapter.out.kafka.KafkaNotificationEventPublisherAdapterTest"
./server/gradlew -p server test --tests "com.readmates.notification.kafka.*"
./server/gradlew -p server clean test
```

- [ ] **Step 4: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification/adapter/out/kafka/NotificationKafkaConfiguration.kt \
        server/src/test/kotlin/com/readmates/notification/adapter/out/kafka/KafkaNotificationEventPublisherAdapterTest.kt
git commit -m "fix: verify notification DLT partitions"
```

---

## Task 5: 기존 route-continuity/auth guard 테스트 보강

**배경:** `front/tests/unit/route-continuity.test.ts`와 `front/tests/unit/auth-context.test.tsx`가 이미 존재합니다. 새 빈 껍데기 test file을 만들지 말고 실제 누락 case를 기존 suite에 추가합니다.

- [ ] **Step 1: route-continuity test에 실제 state parsing case 추가**

`front/tests/unit/route-continuity.test.ts` import에 아래 함수들을 추가합니다.

```typescript
import {
  readReadmatesReturnTarget,
  readReadmatesWorkspaceState,
  readStoredReadmatesMobileWorkspace,
  rememberReadmatesMobileWorkspace,
} from "@/src/app/route-continuity";
```

추가할 test case:

```typescript
it("reads valid mobile workspace state from router state", () => {
  expect(readReadmatesWorkspaceState({ readmatesWorkspace: "host" })).toBe("host");
  expect(readReadmatesWorkspaceState({ readmatesWorkspace: "member" })).toBe("member");
  expect(readReadmatesWorkspaceState({ readmatesWorkspace: "other" })).toBeNull();
});

it("stores mobile workspace in session storage", () => {
  rememberReadmatesMobileWorkspace("host");
  expect(readStoredReadmatesMobileWorkspace()).toBe("host");
});

it("rejects external return targets", () => {
  const fallback = { href: "/app", label: "앱으로" };
  expect(
    readReadmatesReturnTarget(
      {
        readmatesReturnTo: "https://external.example/app",
        readmatesReturnLabel: "외부",
      },
      fallback,
    ),
  ).toEqual(fallback);
});
```

- [ ] **Step 2: auth guard test는 기존 `auth-context.test.tsx`에 추가**

`RequireAuth`, `RequireMemberApp`, `RequireHost`의 loading/anonymous/member/host case는 이미 있으므로, 추가 test는 현재 누락된 returnTo hash/search 보존 또는 club-scoped path 중 하나로 제한합니다.

```typescript
it("redirects anonymous guarded routes to login with search and hash returnTo", async () => {
  mockAuthFetch(anonymousAuth);

  renderGuard(
    <RequireAuth>
      <main>protected app</main>
    </RequireAuth>,
    "/guard?tab=notes#question-1",
  );

  expect(await screen.findByText(/returnTo=%2Fguard%3Ftab%3Dnotes%23question-1/)).toBeInTheDocument();
});
```

- [ ] **Step 3: 검증**

```bash
pnpm --dir front test front/tests/unit/route-continuity.test.ts front/tests/unit/auth-context.test.tsx
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
```

- [ ] **Step 4: Commit**

```bash
git add front/tests/unit/route-continuity.test.ts front/tests/unit/auth-context.test.tsx
git commit -m "test: extend route continuity and auth guard coverage"
```

---

## Task 6: router state 타입을 shared boundary로 정리

**배경:** host route/ui 파일이 route state 타입을 중복 정의하고 `state?: unknown`을 노출합니다. 하지만 feature가 `src/app/route-continuity`를 import하면 route-first dependency boundary를 어기므로 공통 타입은 `shared/routing` 아래에 둡니다.

- [ ] **Step 1: shared route-state type 파일 생성**

`front/shared/routing/readmates-route-state.ts`:

```typescript
export type ReadmatesReturnState = {
  readmatesReturnTo: string;
  readmatesReturnLabel: string;
  readmatesReturnState?: ReadmatesReturnState;
};

export type ReadmatesReturnTarget = {
  href: string;
  label: string;
  state?: ReadmatesReturnState;
};

export function readmatesReturnState(target: ReadmatesReturnTarget): ReadmatesReturnState {
  const state: ReadmatesReturnState = {
    readmatesReturnTo: target.href,
    readmatesReturnLabel: target.label,
  };

  if (target.state) {
    state.readmatesReturnState = target.state;
  }

  return state;
}
```

- [ ] **Step 2: app route-continuity가 shared type을 재사용하도록 수정**

`front/src/app/route-continuity.ts`에서 local `ReadmatesReturnState`, `ReadmatesReturnTarget`, `readmatesReturnState` 중복 정의를 제거하고 shared에서 import/export합니다.

```typescript
import {
  readmatesReturnState,
  type ReadmatesReturnState,
  type ReadmatesReturnTarget,
} from "@/shared/routing/readmates-route-state";

export { readmatesReturnState };
export type { ReadmatesReturnState, ReadmatesReturnTarget };
```

- [ ] **Step 3: host route/ui type 중복 제거**

다음 파일의 local `ReadmatesReturnState`, `ReadmatesReturnTarget` 정의를 shared import로 대체합니다.

```typescript
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
```

대상:
- `front/features/host/route/host-dashboard-route.tsx`
- `front/features/host/route/host-session-editor-route.tsx`
- `front/features/host/ui/host-dashboard.tsx`
- `front/features/host/ui/host-session-editor.tsx`
- `front/features/host/ui/host-session-feedback-upload.tsx`

- [ ] **Step 4: Link prop state 타입 좁히기**

Host UI의 link prop은 `state?: unknown` 대신 route state 타입을 받도록 바꿉니다.

```typescript
type HostDashboardLinkProps = {
  to: string;
  state?: ReadmatesReturnState;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  style?: CSSProperties;
};
```

`HostSessionEditorLinkProps`와 `FeedbackUploadLinkProps`에도 같은 원칙을 적용합니다.

- [ ] **Step 5: boundary test와 build 검증**

```bash
pnpm --dir front test front/tests/unit/frontend-boundaries.test.ts
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

- [ ] **Step 6: Commit**

```bash
git add front/shared/routing/readmates-route-state.ts \
        front/src/app/route-continuity.ts \
        front/features/host/route/host-dashboard-route.tsx \
        front/features/host/route/host-session-editor-route.tsx \
        front/features/host/ui/host-dashboard.tsx \
        front/features/host/ui/host-session-editor.tsx \
        front/features/host/ui/host-session-feedback-upload.tsx
git commit -m "refactor: share typed ReadMates route state"
```

---

## Task 7: InvitationService - email 길이 검증 추가

**배경:** `users.email`, `invitations.invited_email`, `notification_deliveries.recipient_email`는 DB schema에서 `varchar(320)`입니다. `InvitationService.normalizeEmail()`은 empty만 검증하므로 321자 이상 email이 persistence exception으로 떨어질 수 있습니다.

- [ ] **Step 1: failing controller test 추가**

`HostInvitationControllerTest.kt`에 추가합니다.

```kotlin
@Test
fun `host invitation rejects email longer than database email limit before persistence`() {
    val longEmail = "${"a".repeat(309)}@example.com"

    mockMvc.post("/api/host/invitations") {
        with(user("host@example.com"))
        contentType = MediaType.APPLICATION_JSON
        content = """{"email":"$longEmail","name":"긴 이메일"}"""
    }
        .andExpect {
            status { isBadRequest() }
            jsonPath("$.code") { value("INVALID_INVITATION_EMAIL") }
        }

    val count = jdbcTemplate.queryForObject(
        "select count(*) from invitations where invited_email = ?",
        Long::class.java,
        longEmail,
    ) ?: 0L
    assertEquals(0L, count)
}
```

- [ ] **Step 2: normalizeEmail 구현 수정**

`InvitationService.kt` 상단 근처에 상수를 추가합니다.

```kotlin
private const val MAX_EMAIL_LENGTH = 320
```

`normalizeEmail()`을 교체합니다.

```kotlin
private fun normalizeEmail(email: String): String {
    val normalized = email.trim().lowercase(Locale.ROOT)
    if (normalized.isEmpty()) {
        throw InvitationDomainException("INVALID_INVITATION_EMAIL", InvitationDomainError.BAD_REQUEST, "Email is required")
    }
    if (normalized.length > MAX_EMAIL_LENGTH) {
        throw InvitationDomainException(
            "INVALID_INVITATION_EMAIL",
            InvitationDomainError.BAD_REQUEST,
            "Email must be 320 characters or less",
        )
    }
    return normalized
}
```

- [ ] **Step 3: 검증**

```bash
./server/gradlew -p server test --tests "com.readmates.auth.api.HostInvitationControllerTest"
./server/gradlew -p server test --tests "com.readmates.auth.api.GoogleOAuthLoginSessionTest"
./server/gradlew -p server clean test
```

- [ ] **Step 4: Commit**

```bash
git add server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt \
        server/src/test/kotlin/com/readmates/auth/api/HostInvitationControllerTest.kt
git commit -m "fix: validate invitation email length before persistence"
```

---

## Task 8: local Compose MySQL credential을 env variable로 분리

**배경:** root `compose.yml`의 `readmates`/`readmates-root` 값은 로컬 개발용 public-safe sample이라 운영 secret 유출은 아닙니다. 그래도 `.env` override를 지원하면 로컬 환경 충돌을 줄이고 public repo safety policy와 일관성이 좋아집니다.

- [ ] **Step 1: compose.yml 환경변수화**

```yaml
services:
  mysql:
    image: mysql:8.4
    container_name: readmates-mysql
    environment:
      MYSQL_ROOT_PASSWORD: ${READMATES_LOCAL_MYSQL_ROOT_PASSWORD:-readmates-root}
      MYSQL_DATABASE: ${READMATES_LOCAL_MYSQL_DATABASE:-readmates}
      MYSQL_USER: ${READMATES_LOCAL_MYSQL_USERNAME:-readmates}
      MYSQL_PASSWORD: ${READMATES_LOCAL_MYSQL_PASSWORD:-readmates}
    ports:
      - "${READMATES_LOCAL_MYSQL_PORT:-3306}:3306"
    volumes:
      - readmates-mysql-data:/var/lib/mysql
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -u$${MYSQL_USER} -p$${MYSQL_PASSWORD} --silent"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s
```

- [ ] **Step 2: .env.example에 local Compose section 추가**

```dotenv
# Local Docker Compose MySQL defaults. Copy the variables you need into .env.
READMATES_LOCAL_MYSQL_ROOT_PASSWORD=readmates-root
READMATES_LOCAL_MYSQL_DATABASE=readmates
READMATES_LOCAL_MYSQL_USERNAME=readmates
READMATES_LOCAL_MYSQL_PASSWORD=readmates
READMATES_LOCAL_MYSQL_PORT=3306
```

- [ ] **Step 3: local setup 문서 업데이트**

`docs/development/local-setup.md`의 MySQL 준비 섹션에 `.env` override를 설명합니다. 예시는 local public-safe sample만 사용하고 실제 개인 비밀번호를 문서에 남기지 않습니다.

```text
Root `.env`는 Git에서 무시됩니다. 기본값을 바꾸려면 `.env.example`의 Local Docker Compose MySQL section 중 필요한 변수만 `.env`에 복사해 수정합니다.
```

- [ ] **Step 4: 검증**

```bash
docker compose config --quiet
git diff --check -- compose.yml .env.example docs/development/local-setup.md
```

- [ ] **Step 5: Commit**

```bash
git add compose.yml .env.example docs/development/local-setup.md
git commit -m "chore: make local compose mysql credentials configurable"
```

---

## Task 9: 대형 컴포넌트 분리 계획서 작성

**배경:** 현재 line count는 `host-dashboard.tsx` 1,826줄, `my-page.tsx` 1,369줄, `host-session-editor.tsx` 1,348줄입니다. 세 파일을 한 PR에서 분리하면 regression surface가 크므로 각각 별도 계획서와 characterization test를 먼저 둡니다.

- [ ] **Step 1: HostDashboard split plan 작성**

계획서 이름:

```text
docs/superpowers/plans/2026-05-05-readmates-host-dashboard-split-plan.md
```

초기 분리 후보:
- `features/host/ui/dashboard/upcoming-session-row.tsx`
- `features/host/ui/dashboard/mobile-host-dashboard.tsx`
- `features/host/ui/dashboard/host-notification-ledger.tsx`
- `features/host/ui/dashboard/invite-pipeline-section.tsx`
- `features/host/ui/dashboard/quick-action.tsx`

검증:

```bash
pnpm --dir front test front/tests/unit/host-dashboard*.test.tsx
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

- [ ] **Step 2: MyPage split plan 작성**

계획서 이름:

```text
docs/superpowers/plans/2026-05-05-readmates-my-page-split-plan.md
```

초기 분리 후보:
- `features/archive/ui/my-page/my-desktop.tsx`
- `features/archive/ui/my-page/my-mobile.tsx`
- `features/archive/ui/my-page/profile-name-editor.tsx`
- `features/archive/ui/my-page/preferences-section.tsx`
- `features/archive/ui/my-page/feedback-reports.tsx`
- `features/archive/ui/my-page/danger-zone.tsx`

검증:

```bash
pnpm --dir front test front/tests/unit/my-page.test.tsx
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

- [ ] **Step 3: HostSessionEditor split plan 작성**

계획서 이름:

```text
docs/superpowers/plans/2026-05-05-readmates-host-session-editor-split-plan.md
```

초기 분리 후보:
- `features/host/ui/session-editor/mobile-editor-tabs.tsx`
- `features/host/ui/session-editor/basic-session-panel.tsx`
- `features/host/ui/session-editor/publication-panel.tsx`
- `features/host/ui/session-editor/attendance-panel.tsx`
- `features/host/ui/session-editor/document-state-panel.tsx`
- `features/host/ui/session-editor/session-editor-links.tsx`

검증:

```bash
pnpm --dir front test front/tests/unit/host-session-editor*.test.tsx
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

- [ ] **Step 4: 세 계획서 자체 검증**

```bash
git diff --check -- docs/superpowers/plans/2026-05-05-readmates-host-dashboard-split-plan.md \
  docs/superpowers/plans/2026-05-05-readmates-my-page-split-plan.md \
  docs/superpowers/plans/2026-05-05-readmates-host-session-editor-split-plan.md
```

---

## 완료 기준

| Task | 완료 기준 |
|------|-----------|
| Task 1 | profile PATCH endpoint의 무세션 요청이 Spring Security에서 빈 401로 차단됩니다. `MemberProfileControllerTest`, `clean test`, E2E 실행 또는 스킵 사유가 남습니다. |
| Task 2 | return-state secret이 비어 있으면 startup/component 생성이 실패하고, dev/test profile은 public-safe local secret으로 통과합니다. |
| Task 3 | Kafka dispatch path와 worker processing path가 같은 `readmates.notifications.retry-delay-minutes` 설정을 사용합니다. |
| Task 4 | DLT producer record가 원본 partition을 사용하고 `setVerifyPartition(false)`가 없습니다. |
| Task 5 | 기존 route/auth unit suite가 실제 route-state parsing, storage, returnTo case를 검증합니다. 빈 껍데기 test가 없습니다. |
| Task 6 | feature code가 `src/app` route-state helper를 import하지 않고 shared type 또는 route 주입을 사용합니다. `frontend-boundaries.test.ts`가 통과합니다. |
| Task 7 | 321자 이상 invitation email이 DB 접근 전 `INVALID_INVITATION_EMAIL`로 거부됩니다. |
| Task 8 | 로컬 MySQL credential과 port가 `.env` override로 조정 가능하고, public-safe sample만 문서에 남습니다. |
| Task 9 | 대형 컴포넌트 3개는 각각 별도 계획서로 쪼개져 characterization test와 검증 명령을 포함합니다. |

## 최종 검증 묶음

작업을 나눠서 landing하더라도 마지막 통합 확인에서는 아래를 실행합니다.

```bash
./server/gradlew -p server clean test
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
git diff --check
```

`pnpm --dir front test:e2e`처럼 환경 의존성이 큰 검증이 실패하거나 실행 불가하면, 실패 원인과 미검증 user flow를 PR 설명과 최종 보고에 명시합니다.
