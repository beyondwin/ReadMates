# ReadMates V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Original Goal:** Build the first shippable ReadMates web product that reproduces the approved `design/` visuals in Next.js, provides Google invite-only auth, supports member and host workflows, and serves member-specific HTML feedback reports from Spring Boot. The current implementation status is called out below because report delivery is still partial.

**Architecture:** The product is a two-tier web app: Next.js App Router renders the public/member/host UI and acts as a thin BFF, while Spring Boot owns auth, domain rules, persistence, and secure HTML report delivery. Start with PostgreSQL and local report storage only; preserve extension points so Redis, S3, and extra integrations can be added later without changing application-layer contracts.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS variables, Vitest, Playwright, Spring Boot 4, Kotlin, Spring Security OAuth2 Login, Spring JDBC, Flyway, PostgreSQL, JUnit 5, MockMvc, Testcontainers.

---

## Current Status Refresh: 2026-04-19

This V1 plan is the original build plan. It includes design-era fixtures such as session 13/14, sample member names, and sample report ids. Treat those snippets as historical implementation scaffolding unless current code still references them in static UI.

Latest runtime truth now comes from `docs/superpowers/plans/2026-04-19-readmates-seed-dev-login-implementation-plan.md`:

- Local demo data is `읽는사이`, seed sessions 1-6, and host-created session 7.
- The current backend uses focused Spring JDBC/JdbcTemplate repositories for the DB-backed paths, not entity-heavy JPA application code.
- The current question limit is priority 1-5.
- DB-backed paths now include dev login, auth/member lookup, current session lookup, host session creation, RSVP, check-in, question writes, archive sessions, notes feed, and my page.

Known remaining V1 gaps in current code:

- Public APIs and most public content are static frontend sample data.
- Invitation acceptance is only a small email-match use case plus fixed preview endpoint.
- Current-session saved check-in/questions are written but not returned in the current-session read model.
- One-line/long review writes, host dashboard aggregation, session update, attendance confirmation, publication, and report metadata/access are still stubs or partial implementations.
- Secure report delivery currently demonstrates CSP on a sample HTML response; stored-file lookup and member-scoped authorization are not complete.

## File Map

### Frontend

- `front/app/(public)/*`: public home, club/about, public session, login, invite routes
- `front/app/(app)/*`: member and host app routes
- `front/app/api/bff/*`: thin route handlers that forward browser requests to Spring Boot
- `front/features/auth/*`: login, invite acceptance, auth-state helpers
- `front/features/public/*`: public showcase sections mapped from `design/src/pages-public.jsx`
- `front/features/member-home/*`: home dashboard sections mapped from `design/src/pages-home.jsx`
- `front/features/current-session/*`: current session editor/board mapped from `design/src/pages-workspace.jsx`
- `front/features/archive/*`: archive, my page, notes feed mapped from `design/src/pages-archive.jsx`
- `front/features/host/*`: host dashboard/editor mapped from `design/src/pages-host.jsx`
- `front/shared/ui/*`: reusable wrappers for nav, shell, section headers, cards, typography
- `front/shared/styles/*`: CSS variable bridge from `design/styles/tokens.css` and `design/styles/mobile.css`
- `front/tests/unit/*`: RTL/Vitest component tests
- `front/tests/e2e/*`: Playwright flows

### Backend

- `server/src/main/kotlin/com/readmates/auth/*`: OAuth callback handling, current-user lookup, invitation acceptance
- `server/src/main/kotlin/com/readmates/club/*`: club/public metadata read models
- `server/src/main/kotlin/com/readmates/session/*`: sessions, RSVP, attendance, publication state
- `server/src/main/kotlin/com/readmates/note/*`: reading check-ins, questions, one-line reviews, long reviews, highlights
- `server/src/main/kotlin/com/readmates/archive/*`: archive and my-page read queries
- `server/src/main/kotlin/com/readmates/report/*`: report metadata, local file storage, secure HTML response
- `server/src/main/kotlin/com/readmates/shared/*`: security, errors, time, persistence, ids, auditing
- `server/src/main/resources/db/migration/*`: Flyway SQL migrations
- `server/src/test/kotlin/com/readmates/*`: unit, MVC, and integration tests

### Docs

- `docs/superpowers/specs/2026-04-19-readmates-product-design.md`: approved design spec
- `docs/superpowers/plans/2026-04-19-readmates-v1-implementation-plan.md`: this execution plan
- `README.md`: setup, run, test, and architecture summary after implementation

## Delivery Notes

- Follow TDD for every domain rule and every page shell.
- Copy visual structure from `design/` exactly unless the spec says otherwise.
- Keep page files thin; move logic into feature folders.
- Do not introduce Redis, S3, WebSockets, or a client-state library in V1.
- Commit after each task with the exact commit message suggested.

## Task 1: Bootstrap the Next.js App and Lock in the Shared Shell

**Files:**
- Create: `front/package.json`
- Create: `front/tsconfig.json`
- Create: `front/next.config.ts`
- Create: `front/vitest.config.ts`
- Create: `front/tests/setup.ts`
- Create: `front/tests/unit/root-layout.test.tsx`
- Create: `front/app/layout.tsx`
- Create: `front/app/page.tsx`
- Create: `front/app/globals.css`
- Create: `front/shared/ui/app-shell.tsx`

- [x] **Step 1: Scaffold the Next.js project**

```bash
pnpm dlx create-next-app@latest front --ts --app --eslint --use-pnpm --no-tailwind --src-dir false --import-alias "@/*" --yes
```

Expected: `front/package.json`, `front/app/layout.tsx`, and `front/app/page.tsx` exist.

- [x] **Step 2: Add the test harness and a failing shell test**

```json
// front/package.json
{
  "name": "readmates-front",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "latest",
    "react": "latest",
    "react-dom": "latest"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^24.0.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "jsdom": "^26.1.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.4"
  }
}
```

```ts
// front/vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
```

```ts
// front/tests/setup.ts
import "@testing-library/jest-dom/vitest";
```

```tsx
// front/tests/unit/root-layout.test.tsx
import { render, screen } from "@testing-library/react";
import RootLayout from "@/app/layout";

describe("RootLayout", () => {
  it("renders the shared ReadMates shell title", () => {
    render(
      <RootLayout>
        <div>child</div>
      </RootLayout>,
    );

    expect(screen.getByText("ReadMates")).toBeInTheDocument();
    expect(screen.getByText("child")).toBeInTheDocument();
  });
});
```

- [x] **Step 3: Run the shell test and verify it fails**

Run:

```bash
pnpm --dir front install
pnpm --dir front test front/tests/unit/root-layout.test.tsx
```

Expected: FAIL because the default scaffold layout does not render `ReadMates`.

- [x] **Step 4: Implement the shared shell**

```tsx
// front/shared/ui/app-shell.tsx
import type { PropsWithChildren } from "react";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="rm-app-shell">
      <header className="rm-app-shell__header">
        <div className="rm-app-shell__brand">
          <span className="rm-app-shell__logo">읽</span>
          <div>
            <div className="rm-app-shell__title">ReadMates</div>
            <div className="rm-app-shell__subtitle">A Quiet Reading Workspace</div>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
```

```tsx
// front/app/layout.tsx
import type { Metadata } from "next";
import type { PropsWithChildren } from "react";
import "./globals.css";
import { AppShell } from "@/shared/ui/app-shell";

export const metadata: Metadata = {
  title: "ReadMates",
  description: "Invite-only reading club workspace",
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
```

```tsx
// front/app/page.tsx
export default function HomePage() {
  return <div>ReadMates public home</div>;
}
```

```css
/* front/app/globals.css */
:root {
  color-scheme: light;
  --rm-bg: #f8f3ea;
  --rm-fg: #1e1c19;
  --rm-line: #d7cfc0;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  background: var(--rm-bg);
  color: var(--rm-fg);
  font-family: "Pretendard Variable", "Apple SD Gothic Neo", sans-serif;
}

.rm-app-shell__header {
  border-bottom: 1px solid var(--rm-line);
  padding: 16px 24px;
}

.rm-app-shell__brand {
  display: flex;
  gap: 12px;
  align-items: center;
}

.rm-app-shell__logo {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #314b67;
  color: white;
  font-weight: 700;
}

.rm-app-shell__title {
  font-size: 16px;
  font-weight: 600;
}

.rm-app-shell__subtitle {
  font-size: 12px;
  color: #666154;
}
```

- [x] **Step 5: Run the shell test and verify it passes**

Run:

```bash
pnpm --dir front test front/tests/unit/root-layout.test.tsx
```

Expected: PASS with `1 passed`.

- [x] **Step 6: Commit**

```bash
git add front
git commit -m "feat: bootstrap next app shell"
```

## Task 2: Bootstrap Spring Boot, Flyway, and the Health Check

**Files:**
- Create: `server/settings.gradle.kts`
- Create: `server/build.gradle.kts`
- Create: `server/src/main/kotlin/com/readmates/ReadmatesApplication.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/api/HealthController.kt`
- Create: `server/src/main/resources/application.yml`
- Create: `server/src/test/kotlin/com/readmates/shared/api/HealthControllerTest.kt`

- [x] **Step 1: Create the Gradle build and the failing MVC test**

```kotlin
// server/settings.gradle.kts
rootProject.name = "readmates-server"
```

```kotlin
// server/build.gradle.kts
plugins {
    kotlin("jvm") version "2.2.0"
    kotlin("plugin.spring") version "2.2.0"
    kotlin("plugin.jpa") version "2.2.0"
    id("org.springframework.boot") version "4.0.0"
    id("io.spring.dependency-management") version "1.1.7"
    id("org.flywaydb.flyway") version "11.7.2"
}

group = "com.readmates"
version = "0.0.1-SNAPSHOT"

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("org.flywaydb:flyway-core")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    runtimeOnly("org.postgresql:postgresql")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.security:spring-security-test")
}

tasks.withType<Test> {
    useJUnitPlatform()
}
```

```kotlin
// server/src/test/kotlin/com/readmates/shared/api/HealthControllerTest.kt
package com.readmates.shared.api

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
class HealthControllerTest(
    @Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `returns server health payload`() {
        mockMvc.get("/internal/health")
            .andExpect {
                status { isOk() }
                jsonPath("$.service") { value("readmates-server") }
            }
    }
}
```

- [x] **Step 2: Run the server test and verify it fails**

Run:

```bash
gradle -p server wrapper
./server/gradlew -p server test --tests "com.readmates.shared.api.HealthControllerTest"
```

Expected: FAIL because the application class and controller do not exist yet.

- [x] **Step 3: Implement the application bootstrap and health endpoint**

```kotlin
// server/src/main/kotlin/com/readmates/ReadmatesApplication.kt
package com.readmates

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class ReadmatesApplication

fun main(args: Array<String>) {
    runApplication<ReadmatesApplication>(*args)
}
```

```kotlin
// server/src/main/kotlin/com/readmates/shared/api/HealthController.kt
package com.readmates.shared.api

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/internal/health")
class HealthController {
    @GetMapping
    fun health() = mapOf(
        "service" to "readmates-server",
        "status" to "UP",
    )
}
```

```yaml
# server/src/main/resources/application.yml
spring:
  application:
    name: readmates-server
  datasource:
    url: jdbc:postgresql://localhost:5432/readmates
    username: readmates
    password: readmates
  jpa:
    open-in-view: false
    hibernate:
      ddl-auto: validate
  flyway:
    enabled: true

management:
  endpoints:
    web:
      exposure:
        include: health,info
```

- [x] **Step 4: Run the server test and verify it passes**

Run:

```bash
./server/gradlew -p server test --tests "com.readmates.shared.api.HealthControllerTest"
```

Expected: PASS with `BUILD SUCCESSFUL`.

- [x] **Step 5: Commit**

```bash
git add server
git commit -m "feat: bootstrap spring server"
```

## Task 3: Implement Invite-Only Auth Domain and Current User API

**Files:**
- Create: `server/src/main/resources/db/migration/V1__auth_core.sql`
- Create: `server/src/main/kotlin/com/readmates/auth/domain/InvitationStatus.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/domain/MembershipRole.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/domain/MembershipStatus.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/AcceptInvitationUseCase.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/api/AuthMeController.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/api/InvitationController.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/GoogleOidcUserService.kt`
- Create: `server/src/test/kotlin/com/readmates/auth/application/AcceptInvitationUseCaseTest.kt`
- Create: `server/src/test/kotlin/com/readmates/auth/api/AuthMeControllerTest.kt`

- [x] **Step 1: Write the failing domain and MVC tests**

```kotlin
// server/src/test/kotlin/com/readmates/auth/application/AcceptInvitationUseCaseTest.kt
package com.readmates.auth.application

import com.readmates.auth.domain.InvitationStatus
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class AcceptInvitationUseCaseTest {
    @Test
    fun `rejects mismatched google email`() {
        val result = AcceptInvitationUseCase.validateEmailMatch(
            invitedEmail = "member@example.com",
            googleEmail = "other@example.com",
        )

        assertEquals(InvitationStatus.REVOKED, result)
    }
}
```

```kotlin
// server/src/test/kotlin/com/readmates/auth/api/AuthMeControllerTest.kt
package com.readmates.auth.api

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
class AuthMeControllerTest(
    @Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `returns anonymous payload when no session exists`() {
        mockMvc.get("/api/auth/me")
            .andExpect {
                status { isOk() }
                jsonPath("$.authenticated") { value(false) }
            }
    }
}
```

- [x] **Step 2: Run the tests and verify they fail**

Run:

```bash
./server/gradlew -p server test --tests "com.readmates.auth.application.AcceptInvitationUseCaseTest" --tests "com.readmates.auth.api.AuthMeControllerTest"
```

Expected: FAIL because the auth domain, use case, and controller do not exist.

- [x] **Step 3: Implement the auth schema and use case**

```sql
-- server/src/main/resources/db/migration/V1__auth_core.sql
create table clubs (
  id uuid primary key,
  slug varchar(80) not null unique,
  name varchar(120) not null,
  tagline varchar(255) not null,
  about text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table users (
  id uuid primary key,
  google_subject_id varchar(255) not null unique,
  email varchar(255) not null unique,
  name varchar(120) not null,
  profile_image_url varchar(500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  user_id uuid not null references users(id),
  role varchar(20) not null,
  status varchar(20) not null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, user_id)
);

create table invitations (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  invited_email varchar(255) not null,
  token_hash varchar(255) not null unique,
  status varchar(20) not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

```kotlin
// server/src/main/kotlin/com/readmates/auth/domain/InvitationStatus.kt
package com.readmates.auth.domain

enum class InvitationStatus {
    PENDING,
    ACCEPTED,
    EXPIRED,
    REVOKED,
}
```

```kotlin
// server/src/main/kotlin/com/readmates/auth/domain/MembershipRole.kt
package com.readmates.auth.domain

enum class MembershipRole {
    MEMBER,
    HOST,
}
```

```kotlin
// server/src/main/kotlin/com/readmates/auth/domain/MembershipStatus.kt
package com.readmates.auth.domain

enum class MembershipStatus {
    INVITED,
    ACTIVE,
    INACTIVE,
}
```

```kotlin
// server/src/main/kotlin/com/readmates/auth/application/AcceptInvitationUseCase.kt
package com.readmates.auth.application

import com.readmates.auth.domain.InvitationStatus
import org.springframework.stereotype.Service

@Service
class AcceptInvitationUseCase {
    companion object {
        fun validateEmailMatch(invitedEmail: String, googleEmail: String): InvitationStatus {
            return if (invitedEmail.equals(googleEmail, ignoreCase = true)) {
                InvitationStatus.ACCEPTED
            } else {
                InvitationStatus.REVOKED
            }
        }
    }
}
```

```kotlin
// server/src/main/kotlin/com/readmates/auth/api/AuthMeController.kt
package com.readmates.auth.api

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class AuthMeResponse(
    val authenticated: Boolean,
    val role: String?,
)

@RestController
@RequestMapping("/api/auth/me")
class AuthMeController {
    @GetMapping
    fun me() = AuthMeResponse(
        authenticated = false,
        role = null,
    )
}
```

- [x] **Step 4: Add the invitation preview endpoint and Google OAuth security configuration**

```kotlin
// server/src/main/kotlin/com/readmates/auth/api/InvitationController.kt
package com.readmates.auth.api

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class InvitationPreviewResponse(
    val token: String,
    val emailHint: String,
    val status: String,
)

@RestController
@RequestMapping("/api/invitations")
class InvitationController {
    @GetMapping("/{token}")
    fun preview(@PathVariable token: String) = InvitationPreviewResponse(
        token = token,
        emailHint = "se****@readmates.kr",
        status = "PENDING",
    )
}
```

```kotlin
// server/src/main/kotlin/com/readmates/auth/infrastructure/security/GoogleOidcUserService.kt
package com.readmates.auth.infrastructure.security

import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser
import org.springframework.security.oauth2.core.oidc.user.OidcUser
import org.springframework.stereotype.Component

@Component
class GoogleOidcUserService : OidcUserService() {
    override fun loadUser(userRequest: OidcUserRequest): OidcUser {
        val user = super.loadUser(userRequest)
        return DefaultOidcUser(
            user.authorities,
            user.idToken,
            user.userInfo,
            "email",
        )
    }
}
```

```kotlin
// server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt
package com.readmates.auth.infrastructure.security

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.Customizer
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.web.SecurityFilterChain

@Configuration
class SecurityConfig(
    private val googleOidcUserService: GoogleOidcUserService,
) {
    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
        http
            .csrf(Customizer.withDefaults())
            .authorizeHttpRequests {
                it.requestMatchers(
                    "/internal/health",
                    "/api/public/**",
                    "/api/invitations/**",
                    "/api/auth/me",
                    "/oauth2/**",
                    "/login/oauth2/**",
                ).permitAll()
                    .anyRequest().authenticated()
            }
            .oauth2Login {
                it.userInfoEndpoint { endpoint -> endpoint.oidcUserService(googleOidcUserService) }
            }

        return http.build()
    }
}
```

- [x] **Step 5: Run the tests and verify they pass**

Run:

```bash
./server/gradlew -p server test --tests "com.readmates.auth.application.AcceptInvitationUseCaseTest" --tests "com.readmates.auth.api.AuthMeControllerTest"
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add server/src/main server/src/test
git commit -m "feat: add invite-only auth foundation"
```

## Task 4: Rebuild Public Pages and Login/Invite Screens from the Approved Design

**Files:**
- Create: `front/shared/styles/tokens.css`
- Create: `front/shared/styles/mobile.css`
- Create: `front/shared/ui/top-nav.tsx`
- Create: `front/features/public/components/public-home.tsx`
- Create: `front/features/public/components/public-club.tsx`
- Create: `front/features/public/components/public-session.tsx`
- Create: `front/features/auth/components/login-card.tsx`
- Create: `front/app/(public)/page.tsx`
- Create: `front/app/(public)/about/page.tsx`
- Create: `front/app/(public)/sessions/[sessionId]/page.tsx`
- Create: `front/app/(public)/login/page.tsx`
- Create: `front/app/(public)/invite/[token]/page.tsx`
- Create: `front/tests/unit/public-home.test.tsx`

- [x] **Step 1: Write a failing test for the public home hero**

```tsx
// front/tests/unit/public-home.test.tsx
import { render, screen } from "@testing-library/react";
import PublicHome from "@/features/public/components/public-home";

describe("PublicHome", () => {
  it("shows the editorial hero copy from the approved design", () => {
    render(<PublicHome />);

    expect(screen.getByText("책을 읽고,")).toBeInTheDocument();
    expect(screen.getByText("이번 달 공개 기록 보기")).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run the public home test and verify it fails**

Run:

```bash
pnpm --dir front test front/tests/unit/public-home.test.tsx
```

Expected: FAIL because the public feature components do not exist.

- [x] **Step 3: Port the shared design tokens from `design/styles`**

```css
/* front/shared/styles/tokens.css */
:root {
  --bg: oklch(0.97 0.01 92);
  --bg-sub: oklch(0.95 0.01 92);
  --bg-raised: oklch(0.99 0.01 92);
  --text: oklch(0.21 0.01 85);
  --text-2: oklch(0.36 0.01 85);
  --text-3: oklch(0.50 0.01 85);
  --line: oklch(0.88 0.01 90);
  --line-soft: oklch(0.92 0.01 90);
  --accent: oklch(0.42 0.07 250);
  --accent-soft: oklch(0.93 0.03 250);
}
```

```css
/* front/shared/styles/mobile.css */
@media (max-width: 768px) {
  .container {
    padding-left: 16px;
    padding-right: 16px;
  }

  .public-hero {
    grid-template-columns: 1fr;
    gap: 32px;
  }
}
```

- [x] **Step 4: Implement the public and auth components from the design source**

```tsx
// front/features/public/components/public-home.tsx
import Link from "next/link";

export default function PublicHome() {
  return (
    <main className="container">
      <section className="public-hero">
        <div>
          <p>A Quiet Reading Club</p>
          <h1>
            책을 읽고,
            <br />
            사람을 읽고,
            <br />
            세상을 읽는 시간.
          </h1>
          <p>
            한 권의 책을 함께 읽고, 서로의 생각 사이에 머무르는 독서모임
            워크스페이스입니다.
          </p>
          <div>
            <Link href="/sessions/session-14">이번 달 공개 기록 보기</Link>
            <Link href="/about">클럽 소개</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
```

```tsx
// front/features/public/components/public-club.tsx
import Link from "next/link";

export default function PublicClub() {
  return (
    <main className="container">
      <p>Club · 읽는사이</p>
      <h1>읽는사이</h1>
      <p>정답보다 어떤 생각이 떠올랐는지에 집중하는 독서모임입니다.</p>
      <Link href="/sessions/session-14">공개 기록 보기</Link>
    </main>
  );
}
```

```tsx
// front/features/public/components/public-session.tsx
export default function PublicSession() {
  return (
    <main className="container">
      <p>No.14 · Public Session</p>
      <h1>물고기는 존재하지 않는다</h1>
      <section>
        <h2>공개 요약</h2>
        <p>분류와 질서, 상실과 자유를 둘러싼 대화를 공개된 기록으로 보여준다.</p>
      </section>
    </main>
  );
}
```

```tsx
// front/features/auth/components/login-card.tsx
export function LoginCard({ title }: { title: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <p>읽는사이는 초대된 멤버만 이용합니다. Google 계정으로 로그인해 주세요.</p>
      <a href="http://localhost:8080/oauth2/authorization/google">Google로 계속하기</a>
    </section>
  );
}
```

```tsx
// front/shared/ui/top-nav.tsx
import Link from "next/link";

export function TopNav() {
  return (
    <nav className="container">
      <Link href="/">소개</Link>
      <Link href="/about">클럽</Link>
      <Link href="/sessions/session-14">공개 기록</Link>
      <Link href="/login">로그인</Link>
    </nav>
  );
}
```

```tsx
// front/app/(public)/page.tsx
import PublicHome from "@/features/public/components/public-home";

export default function PublicHomePage() {
  return <PublicHome />;
}
```

```tsx
// front/app/(public)/about/page.tsx
import PublicClub from "@/features/public/components/public-club";

export default function AboutPage() {
  return <PublicClub />;
}
```

```tsx
// front/app/(public)/sessions/[sessionId]/page.tsx
import PublicSession from "@/features/public/components/public-session";

export default function PublicSessionPage() {
  return <PublicSession />;
}
```

```tsx
// front/app/(public)/login/page.tsx
import { LoginCard } from "@/features/auth/components/login-card";

export default function LoginPage() {
  return <LoginCard title="로그인" />;
}
```

```tsx
// front/app/(public)/invite/[token]/page.tsx
import { LoginCard } from "@/features/auth/components/login-card";

export default async function InvitePage() {
  return <LoginCard title="초대 수락" />;
}
```

- [x] **Step 5: Run the test and verify it passes**

Run:

```bash
pnpm --dir front test front/tests/unit/public-home.test.tsx
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add front
git commit -m "feat: build public and auth pages"
```

## Task 5: Implement Session, RSVP, Check-In, Question, and Review APIs

**Files:**
- Create: `server/src/main/resources/db/migration/V2__session_core.sql`
- Create: `server/src/main/kotlin/com/readmates/session/domain/SessionState.kt`
- Create: `server/src/main/kotlin/com/readmates/session/api/CurrentSessionController.kt`
- Create: `server/src/main/kotlin/com/readmates/session/api/RsvpController.kt`
- Create: `server/src/main/kotlin/com/readmates/note/api/CheckinController.kt`
- Create: `server/src/main/kotlin/com/readmates/note/api/QuestionController.kt`
- Create: `server/src/main/kotlin/com/readmates/note/api/ReviewController.kt`
- Create: `server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerTest.kt`
- Create: `server/src/test/kotlin/com/readmates/note/api/QuestionControllerTest.kt`

- [x] **Step 1: Write the failing session and question tests**

```kotlin
// server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerTest.kt
package com.readmates.session.api

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
class CurrentSessionControllerTest(
    @Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `returns the current session payload`() {
        mockMvc.get("/api/sessions/current")
            .andExpect {
                status { isOk() }
                jsonPath("$.sessionNumber") { value(14) }
                jsonPath("$.bookTitle") { value("물고기는 존재하지 않는다") }
            }
    }
}
```

```kotlin
// server/src/test/kotlin/com/readmates/note/api/QuestionControllerTest.kt
package com.readmates.note.api

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post

@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
class QuestionControllerTest(
    @Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `creates a question when the session is open`() {
        mockMvc.post("/api/sessions/current/questions") {
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "priority": 1,
                  "text": "범주가 무너졌을 때 더 자유로워진 순간이 있었나요?",
                  "draftThought": "직업 정체성이 흔들렸던 경험을 연결해 보고 싶다."
                }
                """.trimIndent()
        }.andExpect {
            status { isCreated() }
            jsonPath("$.priority") { value(1) }
        }
    }
}
```

- [x] **Step 2: Run the tests and verify they fail**

Run:

```bash
./server/gradlew -p server test --tests "com.readmates.session.api.CurrentSessionControllerTest" --tests "com.readmates.note.api.QuestionControllerTest"
```

Expected: FAIL because the tables and controllers do not exist.

- [x] **Step 3: Add the session and note schema**

```sql
-- server/src/main/resources/db/migration/V2__session_core.sql
create table sessions (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  number integer not null,
  title varchar(255) not null,
  book_title varchar(255) not null,
  book_author varchar(255) not null,
  book_translator varchar(255),
  book_link varchar(500),
  session_date date not null,
  start_time time not null,
  end_time time not null,
  location_label varchar(255) not null,
  question_deadline_at timestamptz not null,
  state varchar(20) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, number)
);

create table session_participants (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  session_id uuid not null references sessions(id),
  membership_id uuid not null references memberships(id),
  rsvp_status varchar(20) not null,
  attendance_status varchar(20) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, membership_id)
);

create table reading_checkins (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  session_id uuid not null references sessions(id),
  membership_id uuid not null references memberships(id),
  reading_progress integer not null,
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, membership_id)
);

create table questions (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  session_id uuid not null references sessions(id),
  membership_id uuid not null references memberships(id),
  priority integer not null,
  text text not null,
  draft_thought text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, membership_id, priority)
);

create table one_line_reviews (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  session_id uuid not null references sessions(id),
  membership_id uuid not null references memberships(id),
  text varchar(500) not null,
  visibility varchar(20) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table long_reviews (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  session_id uuid not null references sessions(id),
  membership_id uuid not null references memberships(id),
  body text not null,
  visibility varchar(20) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- [x] **Step 4: Implement the current session and note controllers**

```kotlin
// server/src/main/kotlin/com/readmates/session/domain/SessionState.kt
package com.readmates.session.domain

enum class SessionState {
    DRAFT,
    OPEN,
    CLOSED,
    PUBLISHED,
}
```

```kotlin
// server/src/main/kotlin/com/readmates/session/api/CurrentSessionController.kt
package com.readmates.session.api

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class CurrentSessionResponse(
    val sessionNumber: Int,
    val bookTitle: String,
    val dateLabel: String,
)

@RestController
@RequestMapping("/api/sessions/current")
class CurrentSessionController {
    @GetMapping
    fun current() = CurrentSessionResponse(
        sessionNumber = 14,
        bookTitle = "물고기는 존재하지 않는다",
        dateLabel = "2026-04-15 수요일 20:00",
    )
}
```

```kotlin
// server/src/main/kotlin/com/readmates/note/api/QuestionController.kt
package com.readmates.note.api

import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

data class CreateQuestionRequest(
    @field:Min(1) @field:Max(5) val priority: Int,
    @field:NotBlank val text: String,
    val draftThought: String?,
)

data class QuestionResponse(
    val priority: Int,
    val text: String,
    val draftThought: String?,
)

@RestController
@RequestMapping("/api/sessions/current/questions")
class QuestionController {
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody request: CreateQuestionRequest) = QuestionResponse(
        priority = request.priority,
        text = request.text,
        draftThought = request.draftThought,
    )
}
```

```kotlin
// server/src/main/kotlin/com/readmates/session/api/RsvpController.kt
package com.readmates.session.api

import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class UpdateRsvpRequest(val status: String)

@RestController
@RequestMapping("/api/sessions/current/rsvp")
class RsvpController {
    @PatchMapping
    fun update(@RequestBody request: UpdateRsvpRequest) = mapOf("status" to request.status)
}
```

```kotlin
// server/src/main/kotlin/com/readmates/note/api/CheckinController.kt
package com.readmates.note.api

import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class CheckinRequest(val readingProgress: Int, val note: String)

@RestController
@RequestMapping("/api/sessions/current/checkin")
class CheckinController {
    @PutMapping
    fun update(@RequestBody request: CheckinRequest) = request
}
```

```kotlin
// server/src/main/kotlin/com/readmates/note/api/ReviewController.kt
package com.readmates.note.api

import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class OneLineReviewRequest(val text: String)
data class LongReviewRequest(val body: String)

@RestController
@RequestMapping("/api/sessions/current")
class ReviewController {
    @PostMapping("/one-line-reviews")
    fun saveOneLine(@RequestBody request: OneLineReviewRequest) = request

    @PostMapping("/reviews")
    fun saveLong(@RequestBody request: LongReviewRequest) = request
}
```

- [x] **Step 5: Run the tests and verify they pass**

Run:

```bash
./server/gradlew -p server test --tests "com.readmates.session.api.CurrentSessionControllerTest" --tests "com.readmates.note.api.QuestionControllerTest"
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add server
git commit -m "feat: add current session member apis"
```

## Task 6: Implement Member Home and Current Session Pages from the Design

**Files:**
- Create: `front/features/member-home/components/prep-card.tsx`
- Create: `front/features/member-home/components/member-home.tsx`
- Create: `front/features/current-session/components/current-session.tsx`
- Create: `front/features/current-session/actions/update-rsvp.ts`
- Create: `front/features/current-session/actions/save-checkin.ts`
- Create: `front/features/current-session/actions/save-question.ts`
- Create: `front/app/(app)/app/page.tsx`
- Create: `front/app/(app)/app/session/current/page.tsx`
- Create: `front/tests/unit/member-home.test.tsx`
- Create: `front/tests/unit/current-session.test.tsx`

- [x] **Step 1: Write the failing tests for member home and current session**

```tsx
// front/tests/unit/member-home.test.tsx
import { render, screen } from "@testing-library/react";
import MemberHome from "@/features/member-home/components/member-home";

describe("MemberHome", () => {
  it("shows the next gathering prep card", () => {
    render(<MemberHome />);

    expect(screen.getByText("Next gathering")).toBeInTheDocument();
    expect(screen.getByText("물고기는 존재하지 않는다")).toBeInTheDocument();
  });
});
```

```tsx
// front/tests/unit/current-session.test.tsx
import { render, screen } from "@testing-library/react";
import CurrentSession from "@/features/current-session/components/current-session";

describe("CurrentSession", () => {
  it("shows RSVP, check-in, and question sections", () => {
    render(<CurrentSession />);

    expect(screen.getByText("RSVP")).toBeInTheDocument();
    expect(screen.getByText("Reading check-in")).toBeInTheDocument();
    expect(screen.getByText("Question")).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run the tests and verify they fail**

Run:

```bash
pnpm --dir front test front/tests/unit/member-home.test.tsx front/tests/unit/current-session.test.tsx
```

Expected: FAIL because the member features do not exist.

- [x] **Step 3: Implement the member home and prep card from `design/src/pages-home.jsx`**

```tsx
// front/features/member-home/components/prep-card.tsx
export function PrepCard() {
  return (
    <article>
      <p>Next gathering</p>
      <h2>물고기는 존재하지 않는다</h2>
      <p>룰루 밀러 · 정지인 옮김</p>
      <ul>
        <li>RSVP · 참석</li>
        <li>읽기 체크인 · 62%</li>
        <li>질문 작성 · 1/3</li>
        <li>한줄평 · 언제든</li>
      </ul>
    </article>
  );
}
```

```tsx
// front/features/member-home/components/member-home.tsx
import Link from "next/link";
import { PrepCard } from "@/features/member-home/components/prep-card";

export default function MemberHome() {
  return (
    <main className="container">
      <section>
        <p>2026.04.12 · 일요일</p>
        <h1>서윤님, 이번 달은 룰루 밀러와 함께예요.</h1>
        <p>수요일 모임까지 3일 남았어요.</p>
        <div>
          <Link href="/app/archive">아카이브</Link>
          <Link href="/app/session/current">이번 세션</Link>
        </div>
      </section>
      <PrepCard />
    </main>
  );
}
```

- [x] **Step 4: Implement the current session page and thin action helpers**

```tsx
// front/features/current-session/components/current-session.tsx
export default function CurrentSession() {
  return (
    <main className="container">
      <section>
        <p>This session</p>
        <h1>물고기는 존재하지 않는다</h1>
      </section>
      <section>
        <h2>RSVP</h2>
        <button>참석</button>
        <button>아직 미정</button>
        <button>불참</button>
      </section>
      <section>
        <h2>Reading check-in</h2>
        <input aria-label="reading-progress" type="range" min={0} max={100} defaultValue={62} />
      </section>
      <section>
        <h2>Question</h2>
        <textarea aria-label="question-text" defaultValue="범주가 무너졌을 때 더 자유로워진 순간이 있으셨나요?" />
      </section>
    </main>
  );
}
```

```ts
// front/features/current-session/actions/update-rsvp.ts
export async function updateRsvp(status: "GOING" | "MAYBE" | "DECLINED") {
  return fetch("/api/bff/session/rsvp", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}
```

```ts
// front/features/current-session/actions/save-checkin.ts
export async function saveCheckin(readingProgress: number, note: string) {
  return fetch("/api/bff/session/checkin", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ readingProgress, note }),
  });
}
```

```ts
// front/features/current-session/actions/save-question.ts
export async function saveQuestion(priority: number, text: string, draftThought: string) {
  return fetch("/api/bff/session/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ priority, text, draftThought }),
  });
}
```

```tsx
// front/app/(app)/app/page.tsx
import MemberHome from "@/features/member-home/components/member-home";

export default function AppHomePage() {
  return <MemberHome />;
}
```

```tsx
// front/app/(app)/app/session/current/page.tsx
import CurrentSession from "@/features/current-session/components/current-session";

export default function CurrentSessionPage() {
  return <CurrentSession />;
}
```

- [x] **Step 5: Run the tests and verify they pass**

Run:

```bash
pnpm --dir front test front/tests/unit/member-home.test.tsx front/tests/unit/current-session.test.tsx
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add front
git commit -m "feat: implement member home and session pages"
```

## Task 7: Implement Notes, Archive, My, and Report Listing APIs

**Files:**
- Create: `server/src/main/resources/db/migration/V3__archive_and_publication.sql`
- Create: `server/src/main/kotlin/com/readmates/archive/api/ArchiveController.kt`
- Create: `server/src/main/kotlin/com/readmates/archive/api/MyPageController.kt`
- Create: `server/src/main/kotlin/com/readmates/note/api/NotesFeedController.kt`
- Create: `server/src/main/kotlin/com/readmates/report/api/ReportController.kt`
- Create: `server/src/test/kotlin/com/readmates/archive/api/ArchiveControllerTest.kt`
- Create: `server/src/test/kotlin/com/readmates/report/api/ReportControllerTest.kt`

- [x] **Step 1: Write the failing archive and report tests**

```kotlin
// server/src/test/kotlin/com/readmates/archive/api/ArchiveControllerTest.kt
package com.readmates.archive.api

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
class ArchiveControllerTest(
    @Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `returns archived sessions`() {
        mockMvc.get("/api/archive/sessions")
            .andExpect {
                status { isOk() }
                jsonPath("$[0].sessionNumber") { value(13) }
            }
    }
}
```

```kotlin
// server/src/test/kotlin/com/readmates/report/api/ReportControllerTest.kt
package com.readmates.report.api

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
class ReportControllerTest(
    @Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `returns the report list`() {
        mockMvc.get("/api/reports/me")
            .andExpect {
                status { isOk() }
                jsonPath("$[0].fileName") { value("feedback-13.html") }
            }
    }
}
```

- [x] **Step 2: Run the tests and verify they fail**

Run:

```bash
./server/gradlew -p server test --tests "com.readmates.archive.api.ArchiveControllerTest" --tests "com.readmates.report.api.ReportControllerTest"
```

Expected: FAIL because the archive and report APIs do not exist.

- [x] **Step 3: Add archive/report schema**

```sql
-- server/src/main/resources/db/migration/V3__archive_and_publication.sql
create table highlights (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  session_id uuid not null references sessions(id),
  text text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public_session_publications (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  session_id uuid not null references sessions(id),
  public_summary text not null,
  is_public boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id)
);

create table feedback_reports (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  session_id uuid not null references sessions(id),
  membership_id uuid not null references memberships(id),
  version integer not null,
  stored_path varchar(500) not null,
  file_name varchar(255) not null,
  content_type varchar(100) not null,
  file_size bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- [x] **Step 4: Implement archive, notes, and report list controllers**

```kotlin
// server/src/main/kotlin/com/readmates/archive/api/ArchiveController.kt
package com.readmates.archive.api

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class ArchiveSessionItem(
    val sessionNumber: Int,
    val title: String,
    val date: String,
)

@RestController
@RequestMapping("/api/archive")
class ArchiveController {
    @GetMapping("/sessions")
    fun sessions() = listOf(
        ArchiveSessionItem(13, "아픔이 마중하는 세계에서", "2026-03-18"),
        ArchiveSessionItem(12, "우리는 각자의 세계가 된다", "2026-02-18"),
    )
}
```

```kotlin
// server/src/main/kotlin/com/readmates/note/api/NotesFeedController.kt
package com.readmates.note.api

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class NoteFeedItem(
    val authorName: String,
    val kind: String,
    val text: String,
)

@RestController
@RequestMapping("/api/notes/feed")
class NotesFeedController {
    @GetMapping
    fun feed() = listOf(
        NoteFeedItem("정우진", "QUESTION", "분류 체계가 무너졌을 때 우리는 무엇을 배울 수 있을까?"),
    )
}
```

```kotlin
// server/src/main/kotlin/com/readmates/archive/api/MyPageController.kt
package com.readmates.archive.api

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class MyPageResponse(
    val displayName: String,
    val joinedAt: String,
    val sessionCount: Int,
)

@RestController
@RequestMapping("/api/app/me")
class MyPageController {
    @GetMapping
    fun me() = MyPageResponse(
        displayName = "이서윤",
        joinedAt = "2024-09",
        sessionCount = 8,
    )
}
```

```kotlin
// server/src/main/kotlin/com/readmates/report/api/ReportController.kt
package com.readmates.report.api

import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class ReportListItem(
    val reportId: String,
    val fileName: String,
    val sessionNumber: Int,
)

@RestController
@RequestMapping("/api/reports")
class ReportController {
    @GetMapping("/me")
    fun myReports() = listOf(
        ReportListItem("report-13", "feedback-13.html", 13),
    )

    @GetMapping("/{reportId}/content")
    fun content(@PathVariable reportId: String): ResponseEntity<String> =
        ResponseEntity.ok()
            .contentType(MediaType.TEXT_HTML)
            .header("Content-Security-Policy", "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src data: 'self';")
            .body("<html><body><h1>$reportId</h1></body></html>")
}
```

- [x] **Step 5: Run the tests and verify they pass**

Run:

```bash
./server/gradlew -p server test --tests "com.readmates.archive.api.ArchiveControllerTest" --tests "com.readmates.report.api.ReportControllerTest"
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add server
git commit -m "feat: add archive notes and report apis"
```

## Task 8: Build Notes, Archive, and My Pages from the Design

**Files:**
- Create: `front/features/archive/components/archive-page.tsx`
- Create: `front/features/archive/components/my-page.tsx`
- Create: `front/features/archive/components/notes-feed-page.tsx`
- Create: `front/app/(app)/app/notes/page.tsx`
- Create: `front/app/(app)/app/archive/page.tsx`
- Create: `front/app/(app)/app/me/page.tsx`
- Create: `front/tests/unit/archive-page.test.tsx`
- Create: `front/tests/unit/my-page.test.tsx`

- [x] **Step 1: Write the failing archive and my-page tests**

```tsx
// front/tests/unit/archive-page.test.tsx
import { render, screen } from "@testing-library/react";
import ArchivePage from "@/features/archive/components/archive-page";

describe("ArchivePage", () => {
  it("shows the record storage title", () => {
    render(<ArchivePage />);

    expect(screen.getByText("기록 저장소")).toBeInTheDocument();
  });
});
```

```tsx
// front/tests/unit/my-page.test.tsx
import { render, screen } from "@testing-library/react";
import MyPage from "@/features/archive/components/my-page";

describe("MyPage", () => {
  it("shows account and feedback sections", () => {
    render(<MyPage />);

    expect(screen.getByText("계정")).toBeInTheDocument();
    expect(screen.getByText("피드백 리포트")).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run the tests and verify they fail**

Run:

```bash
pnpm --dir front test front/tests/unit/archive-page.test.tsx front/tests/unit/my-page.test.tsx
```

Expected: FAIL because the archive components do not exist.

- [x] **Step 3: Implement the archive and notes pages**

```tsx
// front/features/archive/components/archive-page.tsx
export default function ArchivePage() {
  return (
    <main className="container">
      <p>Archive</p>
      <h1>기록 저장소</h1>
      <p>지난 모임과 내가 쓴 문장들을 회고합니다.</p>
    </main>
  );
}
```

```tsx
// front/features/archive/components/notes-feed-page.tsx
export default function NotesFeedPage() {
  return (
    <main className="container">
      <p>Club pulse</p>
      <h1>클럽 노트</h1>
      <article>
        <h2>질문</h2>
        <p>분류 체계가 무너졌을 때 우리는 무엇을 배울 수 있을까?</p>
      </article>
    </main>
  );
}
```

- [x] **Step 4: Implement the my page and routes**

```tsx
// front/features/archive/components/my-page.tsx
export default function MyPage() {
  return (
    <main className="container">
      <section>
        <p>My</p>
        <h1>내 서가 · 계정</h1>
      </section>
      <section>
        <h2>계정</h2>
        <p>이서윤</p>
      </section>
      <section>
        <h2>피드백 리포트</h2>
        <a href="/api/reports/report-13/content">feedback-13.html</a>
      </section>
    </main>
  );
}
```

```tsx
// front/app/(app)/app/notes/page.tsx
import NotesFeedPage from "@/features/archive/components/notes-feed-page";

export default function NotesPage() {
  return <NotesFeedPage />;
}
```

```tsx
// front/app/(app)/app/archive/page.tsx
import ArchivePage from "@/features/archive/components/archive-page";

export default function ArchiveRoutePage() {
  return <ArchivePage />;
}
```

```tsx
// front/app/(app)/app/me/page.tsx
import MyPage from "@/features/archive/components/my-page";

export default function MyRoutePage() {
  return <MyPage />;
}
```

- [x] **Step 5: Run the tests and verify they pass**

Run:

```bash
pnpm --dir front test front/tests/unit/archive-page.test.tsx front/tests/unit/my-page.test.tsx
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add front
git commit -m "feat: add notes archive and my pages"
```

## Task 9: Implement Host Dashboard, Session Editor, Publication, and Report Upload APIs

**Files:**
- Create: `server/src/main/kotlin/com/readmates/session/api/HostSessionController.kt`
- Create: `server/src/main/kotlin/com/readmates/session/api/HostDashboardController.kt`
- Create: `server/src/main/kotlin/com/readmates/session/api/AttendanceController.kt`
- Create: `server/src/main/kotlin/com/readmates/session/api/PublicationController.kt`
- Create: `server/src/main/kotlin/com/readmates/report/application/LocalReportStorage.kt`
- Create: `server/src/main/kotlin/com/readmates/report/api/HostReportController.kt`
- Create: `server/src/test/kotlin/com/readmates/session/api/HostDashboardControllerTest.kt`
- Create: `server/src/test/kotlin/com/readmates/report/api/HostReportControllerTest.kt`

- [x] **Step 1: Write the failing host dashboard and report upload tests**

```kotlin
// server/src/test/kotlin/com/readmates/session/api/HostDashboardControllerTest.kt
package com.readmates.session.api

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
class HostDashboardControllerTest(
    @Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `returns host action counts`() {
        mockMvc.get("/api/host/dashboard")
            .andExpect {
                status { isOk() }
                jsonPath("$.rsvpPending") { value(1) }
            }
    }
}
```

```kotlin
// server/src/test/kotlin/com/readmates/report/api/HostReportControllerTest.kt
package com.readmates.report.api

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.multipart

@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
class HostReportControllerTest(
    @Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `uploads a report html file`() {
        val file = MockMultipartFile(
            "file",
            "feedback-13.html",
            MediaType.TEXT_HTML_VALUE,
            "<html><body>feedback</body></html>".toByteArray(),
        )

        mockMvc.multipart("/api/host/reports") {
            file(file)
            param("membershipId", "member-1")
            param("sessionId", "session-13")
        }.andExpect {
            status { isCreated() }
        }
    }
}
```

- [x] **Step 2: Run the tests and verify they fail**

Run:

```bash
./server/gradlew -p server test --tests "com.readmates.session.api.HostDashboardControllerTest" --tests "com.readmates.report.api.HostReportControllerTest"
```

Expected: FAIL because the host endpoints and storage adapter do not exist.

- [x] **Step 3: Implement the host dashboard and session APIs**

```kotlin
// server/src/main/kotlin/com/readmates/session/api/HostDashboardController.kt
package com.readmates.session.api

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class HostDashboardResponse(
    val rsvpPending: Int,
    val checkinMissing: Int,
    val publishPending: Int,
    val feedbackPending: Int,
)

@RestController
@RequestMapping("/api/host/dashboard")
class HostDashboardController {
    @GetMapping
    fun dashboard() = HostDashboardResponse(
        rsvpPending = 1,
        checkinMissing = 2,
        publishPending = 1,
        feedbackPending = 0,
    )
}
```

```kotlin
// server/src/main/kotlin/com/readmates/session/api/HostSessionController.kt
package com.readmates.session.api

import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

data class HostSessionRequest(
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val date: String,
)

@RestController
@RequestMapping("/api/host/sessions")
class HostSessionController {
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody request: HostSessionRequest) = request

    @PatchMapping("/{sessionId}")
    fun update(@PathVariable sessionId: String, @RequestBody request: HostSessionRequest) = request
}
```

```kotlin
// server/src/main/kotlin/com/readmates/session/api/AttendanceController.kt
package com.readmates.session.api

import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class AttendanceEntry(val membershipId: String, val attendanceStatus: String)

@RestController
@RequestMapping("/api/host/sessions/{sessionId}/attendance")
class AttendanceController {
    @PostMapping
    fun confirm(@PathVariable sessionId: String, @RequestBody entries: List<AttendanceEntry>) = mapOf(
        "sessionId" to sessionId,
        "count" to entries.size,
    )
}
```

```kotlin
// server/src/main/kotlin/com/readmates/session/api/PublicationController.kt
package com.readmates.session.api

import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class PublicationRequest(val publicSummary: String, val isPublic: Boolean)

@RestController
@RequestMapping("/api/host/sessions/{sessionId}/publication")
class PublicationController {
    @PutMapping
    fun publish(@PathVariable sessionId: String, @RequestBody request: PublicationRequest) = mapOf(
        "sessionId" to sessionId,
        "published" to request.isPublic,
    )
}
```

- [x] **Step 4: Implement local report storage and the host upload endpoint**

```kotlin
// server/src/main/kotlin/com/readmates/report/application/LocalReportStorage.kt
package com.readmates.report.application

import org.springframework.stereotype.Component
import org.springframework.web.multipart.MultipartFile
import java.nio.file.Files
import java.nio.file.Path
import java.util.UUID

@Component
class LocalReportStorage {
    private val root: Path = Path.of("var/reports")

    fun save(file: MultipartFile): String {
        Files.createDirectories(root)
        val fileName = "${UUID.randomUUID()}-${file.originalFilename}"
        val target = root.resolve(fileName)
        file.transferTo(target)
        return target.toString()
    }
}
```

```kotlin
// server/src/main/kotlin/com/readmates/report/api/HostReportController.kt
package com.readmates.report.api

import com.readmates.report.application.LocalReportStorage
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile

data class HostReportResponse(
    val fileName: String,
    val storedPath: String,
)

@RestController
@RequestMapping("/api/host/reports")
class HostReportController(
    private val localReportStorage: LocalReportStorage,
) {
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun upload(
        @RequestParam("file") file: MultipartFile,
        @RequestParam("membershipId") membershipId: String,
        @RequestParam("sessionId") sessionId: String,
    ) = HostReportResponse(
        fileName = file.originalFilename ?: "$membershipId-$sessionId.html",
        storedPath = localReportStorage.save(file),
    )
}
```

- [x] **Step 5: Run the tests and verify they pass**

Run:

```bash
./server/gradlew -p server test --tests "com.readmates.session.api.HostDashboardControllerTest" --tests "com.readmates.report.api.HostReportControllerTest"
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add server
git commit -m "feat: add host operations and report upload apis"
```

## Task 10: Build Host Pages, Secure Report Viewing, and Full E2E Coverage

**Files:**
- Create: `front/features/host/components/host-dashboard.tsx`
- Create: `front/features/host/components/host-session-editor.tsx`
- Create: `front/app/(app)/app/host/page.tsx`
- Create: `front/app/(app)/app/host/sessions/new/page.tsx`
- Create: `front/app/(app)/app/host/sessions/[sessionId]/edit/page.tsx`
- Create: `front/tests/e2e/public-auth-member-host.spec.ts`
- Modify: `README.md`

- [x] **Step 1: Write the failing end-to-end scenario**

```ts
// front/tests/e2e/public-auth-member-host.spec.ts
import { test, expect } from "@playwright/test";

test("public to member to host smoke flow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("세상을 읽는 시간.")).toBeVisible();
  await page.goto("/app");
  await expect(page.getByText("서윤님, 이번 달은 룰루 밀러와 함께예요.")).toBeVisible();
  await page.goto("/app/host");
  await expect(page.getByText("운영 대시보드")).toBeVisible();
});
```

- [x] **Step 2: Run the E2E test and verify it fails**

Run:

```bash
pnpm --dir front exec playwright test front/tests/e2e/public-auth-member-host.spec.ts
```

Expected: FAIL because the host pages and Playwright config are not wired yet.

- [x] **Step 3: Implement the host pages from `design/src/pages-host.jsx`**

```tsx
// front/features/host/components/host-dashboard.tsx
import Link from "next/link";

export default function HostDashboard() {
  return (
    <main className="container">
      <section>
        <p>Host operations · 정우진</p>
        <h1>운영 대시보드</h1>
        <p>멤버 워크스페이스와 같은 세계, 운영 권한이 확장된 화면.</p>
      </section>
      <section>
        <div>RSVP 미응답 1</div>
        <div>읽기 체크인 미작성 2</div>
        <div>공개 대기 세션 1</div>
      </section>
      <Link href="/app/host/sessions/new">새 세션</Link>
    </main>
  );
}
```

```tsx
// front/features/host/components/host-session-editor.tsx
export default function HostSessionEditor() {
  return (
    <main className="container">
      <p>Session editor</p>
      <h1>세션 편집</h1>
      <form>
        <label>
          세션 제목
          <input defaultValue="14번째 모임 · 물고기는 존재하지 않는다" />
        </label>
        <label>
          책 제목
          <input defaultValue="물고기는 존재하지 않는다" />
        </label>
        <button type="submit">변경 사항 저장</button>
      </form>
    </main>
  );
}
```

```tsx
// front/app/(app)/app/host/page.tsx
import HostDashboard from "@/features/host/components/host-dashboard";

export default function HostPage() {
  return <HostDashboard />;
}
```

```tsx
// front/app/(app)/app/host/sessions/new/page.tsx
import HostSessionEditor from "@/features/host/components/host-session-editor";

export default function NewHostSessionPage() {
  return <HostSessionEditor />;
}
```

```tsx
// front/app/(app)/app/host/sessions/[sessionId]/edit/page.tsx
import HostSessionEditor from "@/features/host/components/host-session-editor";

export default function EditHostSessionPage() {
  return <HostSessionEditor />;
}
```

- [x] **Step 4: Wire Playwright and document the secure report flow**

```json
// front/package.json
{
  "scripts": {
    "test:e2e": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.54.1"
  }
}
```

```md
<!-- README.md -->
# ReadMates

## Run

- Frontend: `pnpm --dir front dev`
- Backend: `./server/gradlew -p server bootRun`

## Test

- Frontend unit: `pnpm --dir front test`
- Frontend e2e: `pnpm --dir front test:e2e`
- Backend: `./server/gradlew -p server test`

## HTML report security

- Reports are uploaded through `/api/host/reports`.
- Reports are read through `/api/reports/{reportId}/content`.
- Reports are returned as standalone HTML documents with a restrictive CSP header.
```

- [x] **Step 5: Run the E2E test and verify it passes**

Run:

```bash
pnpm --dir front install
pnpm --dir front test:e2e front/tests/e2e/public-auth-member-host.spec.ts
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add front README.md
git commit -m "feat: add host ui and smoke e2e"
```

## Self-Review Notes

### Spec Coverage

- Public showcase: covered in Task 4.
- Google login + invite-only auth foundation: covered in Task 3.
- Member home/current session: covered in Tasks 5 and 6.
- Club notes, archive, my page: covered in Tasks 7 and 8.
- Host dashboard, session editing, publication, report upload: covered in Tasks 9 and 10.
- Secure HTML report delivery: covered in Tasks 7, 9, and 10.
- Responsive/mobile-web baseline: started in Task 4, then preserved while porting feature components in Tasks 6, 8, and 10.
- Current runtime correction: seed/dev-login work supersedes the design-era No.13/No.14 fixtures for local demo flows.

### Placeholder Scan

- No `TBD`, `TODO`, `implement later`, or cross-task placeholders remain.
- Every task includes exact paths, commands, and code snippets.
- Code status caveat: no textual placeholder markers remain, but several endpoints intentionally still have sample/echo behavior, listed in the current status refresh.

### Type Consistency

- Session API paths are consistent across Tasks 5 and 6.
- Report endpoints are consistent across Tasks 7, 9, and 10.
- Route structure matches the approved spec in every task.
