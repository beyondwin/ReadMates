# ReadMates Backend Quality Phase 2 — Actor, Auth, And Club Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task. Keep the ledger, briefs, task reports, review packages, and final execution report in the ignored workspace returned by that skill's `scripts/sdd-workspace`; none of those SDD artifacts is a tracked deliverable. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce capability-only `ClubActor` and `PlatformActor` values, remove every remaining auth inbound boundary debt, and eliminate the reverse `club -> auth` application edge without changing authentication, authorization, club context, OAuth, session-cookie, or API behavior.

**Architecture:** Spring Security principals remain inbound carriers and are converted at controller/filter boundaries into pure Kotlin actors whose IDs and capabilities are the only authorization input application use cases need. Auth-owned web/security helpers call input ports and application-owned models instead of concrete services or the club web adapter. Club consumes an auth-provided invitation-token implementation through a club-owned output port, so the allowed application direction remains `auth -> club` while `club -> auth` disappears.

**Tech Stack:** Kotlin 2.4, Java 25, Spring Boot 4, Spring Security 7, Spring MVC, JDBC, MySQL/Testcontainers, JUnit 5, AssertJ, Mockito, ArchUnit 1.3.2, Gradle 9.6.1, React/Vite BFF E2E with Playwright, and repository public-release checks.

## Global Constraints

- Approved design: `docs/superpowers/specs/2026-08-09-readmates-backend-quality-hardening-design.md`.
- Execute from branch `codex/backend-quality-hardening-phase-0-2` at exact clean plan base `615aedac85739c83abe8730e82cbf2cf316a8c8b` or a descendant containing only this tracked plan commit. Record the actual implementation base before Task 1.
- Scope is strictly the Phase 2 actor/auth–club slice: actor values and principal conversion, auth/club-context inbound ownership, auth security/OAuth/session input ports, auth host/member authorization inputs, auth web failure/model ownership, and removal of `club|auth`.
- Exclude `session`, `sessionclosing`, `sessionimport`, `sessionrecord`, the two remaining session-family reverse edges (`sessionrecord|sessionimport` and `sessionrecord|session`), the four separate session-family boundary-ownership debts, large-class decomposition, frontend/BFF source edits, database schema, SQL, Flyway migrations, and final Phase 2 program closeout.
- Preserve every REST/BFF response shape, JSON field name, HTTP status, safe error code/message, redirect target, OAuth state and join-intent behavior, session cookie name/attributes/rotation, Spring authority string, club-context precedence, support-grant behavior, and authorization decision.
- `ClubActor` contains only user, membership, club IDs/slug, and `Set<ClubCapability>`. `PlatformActor` contains only `adminId` and `Set<PlatformCapability>`. Neither actor imports Spring, auth/club domain enums, email, account name, display name, avatar, or profile data.
- `CurrentMember`, `CurrentPlatformAdmin`, and `CurrentUser` remain while consumers outside this slice exist. Delete one only after a repository-wide zero-consumer proof; this plan is expected to retain all three.
- Preserve `auth -> club`. Do not move membership enums or club policy into `shared`. The only new cycle-removal bridge is a club-owned invitation-token output port implemented by auth.
- Move the club-context `HttpServletRequest` helper from club web ownership to auth security ownership; do not duplicate it or add an auth import of `com.readmates.club.adapter.in.web`.
- Do not change external API/auth meaning to simplify actors. A capability name replaces an existing predicate only when characterization proves exact allowed and denied states.
- The initial boundary partition is `23 current + 16 retired = 39 approved`. This plan retires exactly 19 boundary identities and finishes at `4 current + 35 retired = 39 approved`.
- The initial feature partition is `41 current + 0 retired = 41 approved`. This plan retires exactly `club|auth` and finishes at `40 current + 1 retired = 41 approved`.
- For each debt removal, first add a RED boundary or behavior detector; remove the source import; remove the exact current baseline row; append the identical row to the matching retired ledger; run the exact inventory partition test; and commit those facts together.
- Never increase an approved seed, delete a retired identity, add a replacement debt identity, weaken source scanning, or broaden an architecture exception.
- Use TDD RED/GREEN, focused authorization and club-context regression, auth/OAuth server integration, full server canonical gates, and full frontend E2E at final HEAD. Do not accept compile-only type moves.
- Run Gradle and Testcontainers commands sequentially. No task agent may overlap a Gradle, MySQL, Kafka, Redis, Docker, Playwright, or public-candidate run in the shared worktree.
- Stage only each task's exact allowlist, compare `git diff --cached --name-only` with it, request a fresh task review, resolve every material finding through the originating task, and use the exact commit subject prescribed below.
- Use deterministic fixtures, local Testcontainers, and fake mail/provider dependencies. Do not deploy, push, open a PR, tag, call a live provider, send email, or use production/private member data.
- Keep tracked and ignored reports public-safe: no local absolute paths, secrets, private domains, token-shaped examples, real emails, cookies, raw OAuth state, session tokens, invitation tokens, or deployment identifiers.
- Exactly four file-local package-name suppressions are authorized because Kotlin's escaped `port.in` and `adapter.in` package segments trigger the package-name rule: `@file:Suppress("ktlint:standard:package-name")` at the first line of `AuthSecurityUseCases.kt`, `OAuthLoginUseCases.kt`, `AuthClubContextResolver.kt`, and `AuthClubContextResolverTest.kt`. No other new suppression and no detekt/ktlint baseline or configuration change is allowed.

---

## Current Debt Ledger And Target

### Boundary identities

| Task | Exact identities retired | Current after task | Retired after task |
| --- | ---: | ---: | ---: |
| Start | none | 23 | 16 |
| Task 1 | none; actor foundation | 23 | 16 |
| Task 2 | none; incremental platform actor migration | 23 | 16 |
| Task 3 | 6 auth-to-club-web helper identities | 17 | 22 |
| Task 4 | 5 auth security concrete-service/model identities | 12 | 27 |
| Task 5 | 1 pending-approval service-model identity | 11 | 28 |
| Task 6 | 2 member-profile service-error identities | 9 | 30 |
| Task 7 | 5 OAuth/session concrete-service identities | 4 | 35 |
| Task 8 | no boundary identity; one feature edge | 4 | 35 |

The four remaining current boundary identities after Task 8 are the already-approved `sessionclosing`, `sessionimport`, and two `sessionrecord` rows. They belong to the next session ownership plan.

### Feature identity

| Point | Current | Retired | Approved | Cyclic components |
| --- | ---: | ---: | ---: | --- |
| Start | 41 | 0 | 41 | `auth,club,notification,session,sessionimport,sessionrecord` |
| After Task 8 | 40 | 1 | 41 | `session,sessionimport,sessionrecord` only |

`auth|club` remains current. `club|auth` is moved verbatim to the retired ledger.

## File Structure

### New production files

- `server/src/main/kotlin/com/readmates/shared/security/Actors.kt` — pure actor values and capability enums only.
- `server/src/main/kotlin/com/readmates/auth/application/model/AuthenticatedPrincipalModels.kt` — framework-neutral resolved member snapshot and authority synthesis values.
- `server/src/main/kotlin/com/readmates/auth/application/model/AuthIngressModels.kt` — issued-session and verified-login input/output values used by auth inbound ports.
- `server/src/main/kotlin/com/readmates/auth/application/model/PendingApprovalModels.kt` — pending approval response models owned outside a concrete service.
- `server/src/main/kotlin/com/readmates/auth/application/MemberProfileErrors.kt` — member-profile application error and exception.
- `server/src/main/kotlin/com/readmates/auth/application/GoogleLoginException.kt` — OAuth-safe application failure classification.
- `server/src/main/kotlin/com/readmates/auth/application/port/in/AuthSecurityUseCases.kt` — authenticated-principal resolution and authority-synthesis input ports.
- `server/src/main/kotlin/com/readmates/auth/application/port/in/OAuthLoginUseCases.kt` — verified Google login and invitation acceptance input ports.
- `server/src/main/kotlin/com/readmates/auth/adapter/in/security/AuthClubContextResolver.kt` — sole HTTP club-context headers, helper, and source enum/model.
- `server/src/main/kotlin/com/readmates/auth/application/model/JoinedClubSummary.kt` — auth-owned `/api/auth/me` joined-club projection.
- `server/src/main/kotlin/com/readmates/club/application/port/out/GeneratePlatformAdminInvitationTokenPort.kt` — consumer-owned token pair contract.
- `server/src/test/kotlin/com/readmates/shared/security/ActorCapabilitiesTest.kt` — exact role/status-to-capability characterization.
- `server/src/test/kotlin/com/readmates/auth/adapter/in/security/AuthClubContextResolverTest.kt` — exact slug/host/unscoped HTTP context precedence.
- `server/src/test/kotlin/com/readmates/club/application/service/PlatformAdminClubRegistryServiceTest.kt` — exact `VIEW_CLUBS` denial and SUPPORT read characterization.

### Moved or deleted production files

- Delete after move: `server/src/main/kotlin/com/readmates/club/adapter/in/web/ClubContextResolver.kt`.
- Delete after move: `server/src/main/kotlin/com/readmates/club/adapter/in/web/ClubContextHeader.kt`.
- Delete after move: `server/src/main/kotlin/com/readmates/auth/application/service/AuthoritySynthesisService.kt`.
- Move response declarations out of `server/src/main/kotlin/com/readmates/auth/application/service/PendingApprovalReadService.kt`.
- Move errors out of `server/src/main/kotlin/com/readmates/auth/application/service/MemberProfileService.kt`.
- Move `JoinedClubSummary` out of `server/src/main/kotlin/com/readmates/club/application/model/ClubContextModels.kt`.
- Move `IssuedAuthSession` out of `server/src/main/kotlin/com/readmates/auth/application/service/AuthSessionService.kt`.
- Move `GoogleLoginResult` and `GoogleLoginException` out of `server/src/main/kotlin/com/readmates/auth/application/service/GoogleLoginService.kt`.

### Tracked ledgers and architecture tests

- `server/config/architecture/boundary-import-baseline.txt`
- `server/config/architecture/phase-0-retired-boundary-imports.txt`
- `server/config/architecture/feature-dependency-baseline.txt`
- `server/config/architecture/phase-0-retired-feature-dependencies.txt`
- `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventoryTest.kt`

### Active docs and ignored evidence

- `docs/development/architecture.md`
- `docs/development/adr/0002-server-clean-architecture-with-archunit.md`
- `CHANGELOG.md`
- `${SDD_WORKSPACE}/final-report.md` — ignored execution evidence only; never stage or commit.

---

### Task 1: Introduce Pure Capability Actors And Principal Mappings

**Files:**

- Create: `server/src/main/kotlin/com/readmates/shared/security/Actors.kt`
- Modify: `server/src/main/kotlin/com/readmates/shared/security/CurrentMember.kt`
- Modify: `server/src/main/kotlin/com/readmates/shared/security/CurrentPlatformAdmin.kt`
- Create: `server/src/test/kotlin/com/readmates/shared/security/ActorCapabilitiesTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

**Interfaces:**

```kotlin
enum class ClubCapability {
    BROWSE_MEMBER_CONTENT,
    EDIT_OWN_PROFILE,
    VIEW_PENDING_APPROVAL,
    MANAGE_INVITATIONS,
    MANAGE_MEMBERS,
}

data class ClubActor(
    override val userId: UUID,
    override val membershipId: UUID,
    override val clubId: UUID,
    override val clubSlug: String,
    val capabilities: Set<ClubCapability>,
) : AuthenticatedClubActor {
    override val isHost: Boolean
        get() = ClubCapability.MANAGE_MEMBERS in capabilities

    fun can(capability: ClubCapability): Boolean = capability in capabilities
}

enum class PlatformCapability {
    VIEW_CLUBS,
    VIEW_CLUB_OPERATIONS,
    CREATE_CLUB,
    MANAGE_CLUBS,
    MANAGE_CLUB_DOMAINS,
    MANAGE_SUPPORT_ACCESS,
    MANAGE_PLATFORM_ADMINS,
}

data class PlatformActor(
    val adminId: UUID,
    val capabilities: Set<PlatformCapability>,
) {
    fun can(capability: PlatformCapability): Boolean = capability in capabilities
}

fun CurrentMember.toClubActor(): ClubActor
fun CurrentPlatformAdmin.toPlatformActor(): PlatformActor
```

Mapping is exact:

| Principal state | Club capabilities |
| --- | --- |
| `VIEWER` membership | `BROWSE_MEMBER_CONTENT`, `EDIT_OWN_PROFILE`, `VIEW_PENDING_APPROVAL` |
| `ACTIVE MEMBER` | `BROWSE_MEMBER_CONTENT`, `EDIT_OWN_PROFILE` |
| `ACTIVE HOST` | member capabilities plus `MANAGE_INVITATIONS`, `MANAGE_MEMBERS` |
| `SUSPENDED` membership | `BROWSE_MEMBER_CONTENT`, `EDIT_OWN_PROFILE`; never host management |
| `INVITED`, `INACTIVE`, `LEFT` | empty |

| Platform role | Platform capabilities |
| --- | --- |
| `OWNER` | all seven capabilities |
| `OPERATOR` | view, operations, create, manage clubs, manage domains; no support-access or platform-admin management |
| `SUPPORT` | view clubs and club operations only |

- [ ] **Step 1: Write RED actor mapping and purity tests.**

  `ActorCapabilitiesTest` constructs every row above and asserts exact set equality, not only positive membership. Add source/ArchUnit assertions that `Actors.kt`, `ClubActor`, and `PlatformActor` depend on no `org.springframework..`, `com.readmates.auth.domain..`, or `com.readmates.club.domain..`, and contain no `email`, `accountName`, `displayName`, `avatar`, or role/status property.

- [ ] **Step 2: Run RED.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.shared.security.ActorCapabilitiesTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

  Expected: test compilation fails because the two actor types, capability enums, and mapping functions do not exist.

- [ ] **Step 3: Implement actors and carrier-local mappings.**

  Keep `Actors.kt` pure. Put `CurrentMember.toClubActor()` in `CurrentMember.kt` and `CurrentPlatformAdmin.toPlatformActor()` in `CurrentPlatformAdmin.kt`, where the existing auth/club domain imports already live. Do not add adapter-to-adapter mapping imports. Keep every current carrier property and existing derived predicate unchanged.

- [ ] **Step 4: Run GREEN and mutation.**

  Run Step 2 again. Temporarily omit `MANAGE_MEMBERS` from active hosts; the exact `ACTIVE HOST` set assertion must fail, then pass after restoration. Temporarily grant `MANAGE_SUPPORT_ACCESS` to `OPERATOR`; the exact operator set assertion must fail, then pass after restoration.

- [ ] **Step 5: Review and commit.**

  Require a fresh reviewer to verify pure values, exact capability parity, absence of private profile data, and retention of all current carriers. Stage only Task 1 files and commit:

  ```bash
  git commit -m "refactor(server): introduce capability actors"
  ```

---

### Task 2: Migrate Safe Club Platform Use Cases To `PlatformActor`

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/club/application/port/in/PlatformAdminUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminOnboardingService.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminClubRegistryService.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminService.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/service/AdminClubOperationsService.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/operations/adapter/out/source/ClubReadinessOperationSignalProvider.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/operations/adapter/out/source/ClosingRiskOperationSignalProvider.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminController.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubController.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubOperationsController.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/application/service/PlatformAdminOnboardingServiceTest.kt`
- Create: `server/src/test/kotlin/com/readmates/club/application/service/PlatformAdminClubRegistryServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/application/service/AdminClubOperationsServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/admin/operations/adapter/out/source/AdminOperationSignalProvidersTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/api/PlatformAdminControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/api/PlatformAdminClubOperationsControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

**Interfaces:**

Use `PlatformActor` for these exact methods:

```kotlin
fun createClubDomain(admin: PlatformActor, clubId: UUID, command: CreateClubDomainCommand): PlatformAdminClubDomain
fun checkClubDomainProvisioning(admin: PlatformActor, domainId: UUID): PlatformAdminClubDomain
fun listClubs(admin: PlatformActor): PlatformAdminClubList
fun updateClub(admin: PlatformActor, clubId: UUID, command: UpdatePlatformAdminClubCommand): PlatformAdminClubListItem
fun preview(admin: PlatformActor, command: PlatformAdminOnboardingCommand): PlatformAdminOnboardingPreview
fun commit(admin: PlatformActor, command: PlatformAdminOnboardingCommand): PlatformAdminOnboardingResult
fun operationsSnapshot(admin: PlatformActor, clubId: UUID): AdminClubOperationsSnapshot
fun todayClosingRisks(admin: PlatformActor): AdminTodayClosingRiskSnapshot
```

The two admin-operation providers continue implementing `AdminOperationSignalProvider.collect/verify(CurrentPlatformAdmin)` because that admin-owned SPI is outside this task. They are mandatory consumer-boundary conversions for the two migrated club ports:

```kotlin
listClubsUseCase.listClubs(admin.toPlatformActor())
closingRisksUseCase.todayClosingRisks(admin.toPlatformActor())
```

Apply the conversion to both `collect` and `verify` in `ClubReadinessOperationSignalProvider` and `ClosingRiskOperationSignalProvider`; leaving either provider on the old argument is a compile failure, not deferred work. Keep `PlatformAdminSummaryUseCase.summary(CurrentPlatformAdmin)` unchanged because its response returns the exact current role. Keep club lifecycle and support-grant/workbench use cases on `CurrentPlatformAdmin` because their audit records currently require the exact role string. This is the deliberate coexistence boundary.

- [ ] **Step 1: Write RED interface and denied-capability tests.**

  Change every service, controller, and admin-operation-provider test fake to the signatures above before production. Add assertions that an actor without `CREATE_CLUB` gets the unchanged onboarding `AccessDeniedException`, and an actor without `MANAGE_CLUB_DOMAINS` gets the unchanged create/check/update denial. In `PlatformAdminClubRegistryServiceTest`, prove an actor without `VIEW_CLUBS` is denied before a load-port call and a SUPPORT actor can list. In `AdminClubOperationsServiceTest`, prove an actor without `VIEW_CLUB_OPERATIONS` is denied before snapshot/today-risk or ledger-port calls and a SUPPORT actor can read both operation paths. In `AdminOperationSignalProvidersTest`, assert both `collect` and `verify` convert their `CurrentPlatformAdmin` to the exact `PlatformActor` expected by migrated list/risk fakes. SUPPORT can read/list but cannot create/update.

  The update denial uses `MANAGE_CLUBS`; create/check-domain denial uses `MANAGE_CLUB_DOMAINS`. The test must distinguish those capabilities so accidentally substituting one for the other fails.

- [ ] **Step 2: Run RED focused tests.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.club.application.service.PlatformAdminOnboardingServiceTest \
    --tests com.readmates.club.application.service.PlatformAdminClubRegistryServiceTest \
    --tests com.readmates.club.application.service.AdminClubOperationsServiceTest \
    --tests com.readmates.admin.operations.adapter.out.source.AdminOperationSignalProvidersTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

  Expected: compilation fails while use cases and services still require `CurrentPlatformAdmin`.

- [ ] **Step 3: Implement capability checks and inbound conversion.**

  Replace `canCreateClub` with `admin.can(PlatformCapability.CREATE_CLUB)`, domain checks with `admin.can(PlatformCapability.MANAGE_CLUB_DOMAINS)`, and update checks with `admin.can(PlatformCapability.MANAGE_CLUBS)`. Require `VIEW_CLUBS` at the start of `listClubs`; require `VIEW_CLUB_OPERATIONS` at the start of both `operationsSnapshot` and `todayClosingRisks`; use the existing `AccessDeniedException` family and do not touch a downstream port before denial. Replace migrated `admin.userId` reads with `admin.adminId`. Controllers and both admin-operation providers continue accepting `CurrentPlatformAdmin` at their inbound/SPIs and pass `admin.toPlatformActor()` only to migrated use cases. Do not change resolver, provider projection, signal identity, controller response mapping, or platform-admin summary behavior.

- [ ] **Step 4: Run GREEN, architecture, and API regression sequentially.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.club.application.service.PlatformAdminOnboardingServiceTest \
    --tests com.readmates.club.application.service.PlatformAdminClubRegistryServiceTest \
    --tests com.readmates.club.application.service.AdminClubOperationsServiceTest \
    --tests com.readmates.admin.operations.adapter.out.source.AdminOperationSignalProvidersTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server integrationTest \
    --tests com.readmates.club.api.PlatformAdminControllerTest \
    --tests com.readmates.club.api.PlatformAdminClubOperationsControllerTest \
    --tests com.readmates.club.api.PlatformAdminBffSecurityTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 5: Mutation, review, and commit.**

  Run three temporary mutations: make `PlatformAdminOnboardingService` check `VIEW_CLUBS` instead of `CREATE_CLUB`; remove the `VIEW_CLUBS` guard from `listClubs`; and remove the `VIEW_CLUB_OPERATIONS` guards from both operations methods. The SUPPORT mutation-denial, list denied/no-port-call, and operations denied/no-port-call tests respectively must fail. Restore each mutation before the next, rerun Step 4, obtain fresh review of provider conversion, coexistence, and role parity, and commit only Task 2 files:

  ```bash
  git commit -m "refactor(server): use platform actors in club use cases"
  ```

---

### Task 3: Move HTTP Club-Context Resolution Into Auth Inbound Ownership

**Files:**

- Create: `server/src/main/kotlin/com/readmates/auth/adapter/in/security/AuthClubContextResolver.kt`
- Delete: `server/src/main/kotlin/com/readmates/club/adapter/in/web/ClubContextResolver.kt`
- Delete: `server/src/main/kotlin/com/readmates/club/adapter/in/web/ClubContextHeader.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/security/CurrentMemberArgumentResolver.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/AuthMeController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/MemberProfileController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt`
- Create by moving: `server/src/test/kotlin/com/readmates/auth/adapter/in/security/AuthClubContextResolverTest.kt`
- Delete after move: `server/src/test/kotlin/com/readmates/club/adapter/in/web/ResolveClubContextRequestExtensionTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/adapter/in/security/CurrentMemberArgumentResolverTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/AuthMeControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/MemberProfileControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/infrastructure/security/MemberAuthoritiesFilterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Modify: `server/config/architecture/boundary-import-baseline.txt`
- Modify: `server/config/architecture/phase-0-retired-boundary-imports.txt`

**Interfaces:**

```kotlin
object AuthClubContextHeader {
    const val CLUB_HOST = "X-Readmates-Club-Host"
    const val CLUB_SLUG = "X-Readmates-Club-Slug"
}

enum class AuthClubContextSource { SLUG, HOST_FALLBACK, NONE }

data class RequestedAuthClubContext(
    val supplied: Boolean,
    val source: AuthClubContextSource,
    val context: ResolvedClubContext?,
)

fun HttpServletRequest.resolveAuthClubContext(
    resolveClubContextUseCase: ResolveClubContextUseCase,
): RequestedAuthClubContext
```

Precedence and semantics remain exact: non-blank trusted slug first, then non-blank trusted host, then unscoped; a supplied unknown slug/host has `supplied=true` and `context=null`; no browser header trust is added here.

**Exact retired identities:**

```text
com/readmates/auth/adapter/in/security/CurrentMemberArgumentResolver.kt|com.readmates.club.adapter.in.web.resolveClubContext
com/readmates/auth/adapter/in/web/AuthMeController.kt|com.readmates.club.adapter.in.web.ClubContextSource
com/readmates/auth/adapter/in/web/AuthMeController.kt|com.readmates.club.adapter.in.web.resolveClubContext
com/readmates/auth/adapter/in/web/MemberProfileController.kt|com.readmates.club.adapter.in.web.resolveClubContext
com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt|com.readmates.club.adapter.in.web.resolveClubContext
com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt|com.readmates.club.adapter.in.web.resolveClubContext
```

- [ ] **Step 1: Move tests first and add RED ownership rules.**

  The moved helper test must assert: slug beats host; blank slug falls through to host; known slug; unknown slug; known host; unknown host; and neither header. Add an architecture rule that every auth inbound/security class rejects dependencies on `com.readmates.club.adapter.in..`, and a source assertion that no production auth file imports `com.readmates.club.adapter.in.web`.

- [ ] **Step 2: Run RED.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.auth.adapter.in.security.AuthClubContextResolverTest \
    --tests com.readmates.auth.adapter.in.security.CurrentMemberArgumentResolverTest \
    --tests com.readmates.auth.infrastructure.security.MemberAuthoritiesFilterTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --tests com.readmates.architecture.ServerArchitectureInventoryTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

  Expected: helper compilation/ownership rules fail against the current club-web helper imports.

- [ ] **Step 3: Move the helper without semantic edits and retire six identities.**

  Copy the exact header constants, trim, precedence, and lookup logic under the new auth names, update the five auth consumers and auth tests, delete both club helper files, and move all six rows verbatim from current to retired. `AuthClubContextHeader` owns the unchanged literal values so production and tests import no club adapter type. Put the exact authorized `@file:Suppress("ktlint:standard:package-name")` at line 1 of only `AuthClubContextResolver.kt` and `AuthClubContextResolverTest.kt`; do not introduce any other suppression or baseline/configuration change.

- [ ] **Step 4: Run GREEN and scoped integration.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.auth.adapter.in.security.AuthClubContextResolverTest \
    --tests com.readmates.auth.adapter.in.security.CurrentMemberArgumentResolverTest \
    --tests com.readmates.auth.infrastructure.security.MemberAuthoritiesFilterTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server integrationTest \
    --tests com.readmates.auth.api.AuthMeControllerTest \
    --tests com.readmates.auth.api.MemberProfileControllerTest \
    --tests com.readmates.club.api.ClubContextResolverTest \
    --tests com.readmates.auth.api.AuthenticatedMemberSecurityTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --tests com.readmates.architecture.ServerArchitectureInventoryTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server detekt ktlintMainSourceSetCheck ktlintTestSourceSetCheck \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

  Assert ledger arithmetic `17 current + 22 retired = 39 approved`.

- [ ] **Step 5: Mutation, review, and commit.**

  Temporarily resolve host before slug; the slug-precedence test must fail. Temporarily treat an unknown supplied slug as unscoped; AuthMe unknown-slug 404 and security denial must fail. Restore, obtain fresh review, and commit:

  ```bash
  git commit -m "refactor(server): own auth club context resolution"
  ```

---

### Task 4: Port Auth Security Resolution And Authority Synthesis

**Files:**

- Create: `server/src/main/kotlin/com/readmates/auth/application/model/AuthenticatedPrincipalModels.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/in/AuthSecurityUseCases.kt`
- Delete: `server/src/main/kotlin/com/readmates/auth/application/service/AuthoritySynthesisService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/AuthenticatedMemberResolver.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/DefaultAuthoritySynthesisService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/application/service/DefaultAuthoritySynthesisServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/infrastructure/security/MemberAuthoritiesFilterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/AuthenticatedMemberSecurityTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/ViewerSecurityTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Modify: `server/config/architecture/boundary-import-baseline.txt`
- Modify: `server/config/architecture/phase-0-retired-boundary-imports.txt`

**Interfaces:**

```kotlin
data class AuthenticatedMemberSnapshot(
    val actor: ClubActor,
    val email: String,
    val displayName: String,
    val accountName: String,
    val clubName: String,
    val avatarKey: String,
    val role: MembershipRole,
    val membershipStatus: MembershipStatus,
)

interface ResolveAuthenticatedPrincipalUseCase {
    fun resolveByEmail(email: String?, clubContext: ResolvedClubContext?): AuthenticatedMemberSnapshot?
    fun resolveByUserId(userId: String, clubContext: ResolvedClubContext?): AuthenticatedMemberSnapshot?
    fun resolveProfileByUserId(userId: String): AuthenticatedMemberSnapshot?
    fun resolveUserById(userId: String): CurrentUser?
}

interface SynthesizeAuthoritiesUseCase {
    fun synthesize(request: AuthoritySynthesisRequest): AuthoritySynthesisResult
}

data class AuthoritySynthesisRequest(
    val incomingAuthorities: Set<String>,
    val email: String,
    val userId: UUID?,
    val clubContext: ClubContextInput,
    val member: AuthenticatedMemberSnapshot?,
    val supportSynthesis: SupportMemberSynthesis?,
)
```

`AuthenticatedMemberResolver` implements the resolver port and converts persistence-returned `CurrentMember` to the snapshot. `DefaultAuthoritySynthesisService` implements `SynthesizeAuthoritiesUseCase` and consumes that complete snapshot, not `ClubActor`, because Spring authority compatibility remains a role/status projection. Filters map snapshots back to the unchanged `CurrentMember` principal only at the Spring boundary.

Authority selection preserves the exact current rule: a resolved snapshot with `membershipStatus == MembershipStatus.VIEWER` gets `ROLE_VIEWER`; every other resolved snapshot gets `ROLE_${member.role}`, so a suspended HOST deliberately still gets `ROLE_HOST` and a suspended MEMBER gets `ROLE_MEMBER`. Incoming member-role authorities are removed before this one effective role is added. This compatibility mapping must not be inferred from actor capabilities: the same suspended HOST snapshot's `actor` has no `MANAGE_INVITATIONS` or `MANAGE_MEMBERS`, so application management paths remain denied by Tasks 1 and 5 even though the unchanged Spring authority string is `ROLE_HOST`.

**Exact retired identities:**

```text
com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt|com.readmates.auth.application.service.AuthenticatedMemberResolver
com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt|com.readmates.auth.application.service.AuthoritySynthesisRequest
com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt|com.readmates.auth.application.service.AuthoritySynthesisService
com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt|com.readmates.auth.application.service.ClubContextInput
com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt|com.readmates.auth.application.service.AuthenticatedMemberResolver
```

- [ ] **Step 1: Write RED port, actor, and boundary tests.**

  Make filter tests inject the two input ports, then assert exact authority sets for anonymous/no email, unknown supplied club, different-club membership, platform admin without grant, platform admin with valid support grant, and stale incoming member-role authority removal. In `DefaultAuthoritySynthesisServiceTest`, add an explicit 12-row role/status matrix over both `MembershipRole` values and all six `MembershipStatus` values: HOST/VIEWER and MEMBER/VIEWER yield `ROLE_VIEWER`; HOST with INVITED, ACTIVE, SUSPENDED, LEFT, or INACTIVE yields `ROLE_HOST`; MEMBER with those same five statuses yields `ROLE_MEMBER`. Each row supplies a snapshot whose actor capability set is independently valid for that status and asserts the exact final authority set, including suspended HOST = `ROLE_HOST` while its actor management capabilities are empty. Add a rule that auth `infrastructure.security` depends on auth `application.port.in`/model rather than `application.service` and that `AuthoritySynthesisRequest.member` is `AuthenticatedMemberSnapshot?`.

- [ ] **Step 2: Run RED.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.auth.application.service.DefaultAuthoritySynthesisServiceTest \
    --tests com.readmates.auth.infrastructure.security.MemberAuthoritiesFilterTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --tests com.readmates.architecture.ServerArchitectureInventoryTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 3: Implement ports and snapshot mapping.**

  Move `ClubContextInput`, `AuthoritySynthesisRequest`, and `AuthoritySynthesisResult` to the model file; move the interface to the input-port file; adapt the two services; and keep Spring `SimpleGrantedAuthority`, `UsernamePasswordAuthenticationToken`, request attributes, and `SecurityContextHolder` exclusively in filters. Put the exact authorized `@file:Suppress("ktlint:standard:package-name")` at line 1 of `AuthSecurityUseCases.kt` only. Do not add another suppression or lint baseline/configuration change. Do not change authority strings `ROLE_VIEWER`, `ROLE_MEMBER`, `ROLE_HOST`, or `ROLE_PLATFORM_ADMIN`, and never replace role/status authority selection with capability selection.

- [ ] **Step 4: Retire five identities and run GREEN.**

  Move the exact rows, run Step 2, then:

  ```bash
  ./server/gradlew -p server integrationTest \
    --tests com.readmates.auth.api.AuthenticatedMemberSecurityTest \
    --tests com.readmates.auth.api.ViewerSecurityTest \
    --tests com.readmates.auth.api.MemberLifecycleAuthTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server detekt ktlintMainSourceSetCheck ktlintTestSourceSetCheck \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

  Assert ledger arithmetic `12 current + 27 retired = 39 approved`.

- [ ] **Step 5: Mutations, review, and commit.**

  Temporarily replace `AuthoritySynthesisRequest.member: AuthenticatedMemberSnapshot?` with `ClubActor?` and derive authorities from capabilities; the signature rule and 12-row matrix must fail, specifically because suspended HOST no longer yields the required `ROLE_HOST`. Temporarily retain an incoming `ROLE_HOST` for a non-member; the stale-authority test must fail. Restore, rerun Step 4, request review, and commit:

  ```bash
  git commit -m "refactor(server): port auth authority synthesis"
  ```

---

### Task 5: Use `ClubActor` For Auth Host And Membership Authorization

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/auth/application/port/in/AuthWebUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/model/PendingApprovalModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/InvitationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/MemberApprovalService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/MemberLifecycleService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/PendingApprovalReadService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/HostInvitationController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/HostMemberApprovalController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/SelfMembershipController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/PendingApprovalController.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/application/MemberLifecycleServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/HostInvitationControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/HostMemberApprovalControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/HostMemberLifecycleControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/PendingApprovalControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/SelfMembershipControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Modify: `server/config/architecture/boundary-import-baseline.txt`
- Modify: `server/config/architecture/phase-0-retired-boundary-imports.txt`

**Interfaces:**

Every `host`, `member`, or `currentMember` parameter in `ManageHostInvitationsUseCase`, `ManageMemberApprovalsUseCase`, `ManageMemberLifecycleUseCase`, `LeaveMembershipUseCase`, and `GetPendingApprovalUseCase` becomes `ClubActor`. Controllers still accept `CurrentMember` and call `toClubActor()` at the input-port invocation.

Authorization is exact:

```kotlin
private fun requireInvitationManager(actor: ClubActor) {
    if (!actor.can(ClubCapability.MANAGE_INVITATIONS)) throw existingHostRequiredFailure()
}

private fun requireMemberManager(actor: ClubActor) {
    if (!actor.can(ClubCapability.MANAGE_MEMBERS)) throw existingHostRequiredFailure()
}

private fun requirePendingViewer(actor: ClubActor) {
    if (!actor.can(ClubCapability.VIEW_PENDING_APPROVAL)) throw existingPendingApprovalFailure()
}
```

Host self-mutation and last-host checks continue to use `membershipId`, `clubId`, and `MANAGE_MEMBERS` exactly as the former active-HOST predicate did.

**Exact retired identity:**

```text
com/readmates/auth/adapter/in/web/PendingApprovalController.kt|com.readmates.auth.application.service.PendingApprovalAppResponse
```

- [ ] **Step 1: Write RED use-case signature and authorization matrix tests.**

  Change test fakes and services to `ClubActor`. For invitation, approval, lifecycle, leave, and pending paths, assert HOST allowed, ACTIVE MEMBER denied for host writes, VIEWER allowed only pending read, SUSPENDED HOST denied host management, different `clubId` cannot mutate target-club rows, and last active host cannot leave. Pin unchanged error types/codes/statuses.

- [ ] **Step 2: Run RED.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.auth.application.MemberLifecycleServiceTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --tests com.readmates.architecture.ServerArchitectureInventoryTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 3: Implement actor inputs and move pending models.**

  Replace only authorization-input types and predicates. Keep persistence ports, transactions, current-session policy, cursor behavior, response models, and controller parameters unchanged. Move the two pending response data classes byte-for-byte to the model file and update the controller/input port import.

- [ ] **Step 4: Retire the pending identity and run GREEN.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.auth.application.MemberLifecycleServiceTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server integrationTest \
    --tests com.readmates.auth.api.HostInvitationControllerTest \
    --tests com.readmates.auth.api.HostMemberApprovalControllerTest \
    --tests com.readmates.auth.api.HostMemberLifecycleControllerTest \
    --tests com.readmates.auth.api.PendingApprovalControllerTest \
    --tests com.readmates.auth.api.SelfMembershipControllerTest \
    --tests com.readmates.auth.api.MemberLifecycleAuthTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --tests com.readmates.architecture.ServerArchitectureInventoryTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

  Assert ledger arithmetic `11 current + 28 retired = 39 approved`.

- [ ] **Step 5: Mutation, review, and commit.**

  Temporarily let `MANAGE_INVITATIONS` satisfy member lifecycle management; the exact-capability denial test must fail. Temporarily pass `CurrentMember` directly to one migrated use case; the scoped input-port rule must fail. Restore, obtain review, and commit:

  ```bash
  git commit -m "refactor(server): authorize auth use cases with club actors"
  ```

---

### Task 6: Move Member-Profile Failures Out Of The Concrete Service

**Files:**

- Create: `server/src/main/kotlin/com/readmates/auth/application/MemberProfileErrors.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/MemberProfileService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/MemberProfileController.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/application/service/MemberProfileServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/MemberProfileControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Modify: `server/config/architecture/boundary-import-baseline.txt`
- Modify: `server/config/architecture/phase-0-retired-boundary-imports.txt`

**Interfaces:**

Move these declarations without renaming or changing members:

```kotlin
class MemberProfileException(
    val error: MemberProfileError,
) : RuntimeException(error.code)

enum class MemberProfileError {
    AUTHENTICATION_REQUIRED,
    HOST_ROLE_REQUIRED,
    MEMBERSHIP_NOT_ALLOWED,
    MEMBER_NOT_FOUND,
    DISPLAY_NAME_REQUIRED,
    DISPLAY_NAME_TOO_LONG,
    DISPLAY_NAME_INVALID,
    DISPLAY_NAME_RESERVED,
    DISPLAY_NAME_DUPLICATE,
    AVATAR_KEY_REQUIRED,
    AVATAR_KEY_INVALID;

    val code: String get() = name
}
```

**Exact retired identities:**

```text
com/readmates/auth/adapter/in/web/MemberProfileController.kt|com.readmates.auth.application.service.MemberProfileError
com/readmates/auth/adapter/in/web/MemberProfileController.kt|com.readmates.auth.application.service.MemberProfileException
```

- [ ] **Step 1: Write RED ownership rules and preserve the error matrix.**

  Update the controller test import to `com.readmates.auth.application`. Assert every enum maps to its existing numeric status, code, and public-safe message. Add a rule that auth web adapters do not import auth concrete services.

- [ ] **Step 2: Run RED.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.auth.application.service.MemberProfileServiceTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --tests com.readmates.architecture.ServerArchitectureInventoryTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 3: Move declarations and two ledger rows.**

  Change imports only; keep validation, transaction, duplicate-name, avatar allowlist, fail-closed club-context, and compatibility PATCH behavior byte-for-byte. Move the exact rows to retired.

- [ ] **Step 4: Run GREEN and profile integration.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.auth.application.service.MemberProfileServiceTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server integrationTest \
    --tests com.readmates.auth.api.MemberProfileControllerTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --tests com.readmates.architecture.ServerArchitectureInventoryTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

  Assert ledger arithmetic `9 current + 30 retired = 39 approved`.

- [ ] **Step 5: Mutation, review, and commit.**

  Temporarily map `MEMBER_NOT_FOUND` to 403; the response-matrix test must fail. Restore, request review of exact error parity and scope, and commit:

  ```bash
  git commit -m "refactor(server): own auth profile failures"
  ```

---

### Task 7: Port OAuth And Session-Cookie Ingress

**Files:**

- Create: `server/src/main/kotlin/com/readmates/auth/application/model/AuthIngressModels.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/GoogleLoginException.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/in/OAuthLoginUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/port/in/AuthSessionUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/AuthSessionService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/GoogleLoginService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/InvitationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/ReadmatesOAuthSuccessHandler.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/application/AuthSessionServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/application/GoogleLoginServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/application/AcceptInvitationUseCaseTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/GoogleOAuthLoginSessionTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/infrastructure/security/InviteAwareOAuthTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Modify: `server/config/architecture/boundary-import-baseline.txt`
- Modify: `server/config/architecture/phase-0-retired-boundary-imports.txt`

**Interfaces:**

```kotlin
interface ManageAuthSessionUseCase {
    val sessionCookieName: String
    fun issueSession(userId: String, userAgent: String?, ipAddress: String?): IssuedAuthSession
    fun findValidSession(rawToken: String): StoredAuthSession?
    fun sessionCookie(rawToken: String): String
    fun clearedSessionCookie(): String
}

interface LoginVerifiedGoogleUserUseCase {
    fun loginVerifiedGoogleUserForSession(
        googleSubjectId: String,
        email: String,
        displayName: String?,
        profileImageUrl: String?,
        targetClubSlug: String? = null,
    ): GoogleLoginResult
}

interface AcceptGoogleInvitationUseCase {
    fun acceptGoogleInvitation(
        rawToken: String,
        googleSubjectId: String,
        email: String,
        displayName: String?,
        profileImageUrl: String?,
        expectedClubSlug: String? = null,
    ): CurrentMember
}
```

`AuthSessionService` implements both `ManageAuthSessionUseCase` and the existing `LogoutAuthSessionUseCase`. `GoogleLoginService` and `InvitationService` implement the new ports. `IssuedAuthSession`, `GoogleLoginResult`, and `GoogleLoginException` move out of concrete-service ownership. OAuth handler reads `sessionCookieName`; no service constant import remains.

**Exact retired identities:**

```text
com/readmates/auth/infrastructure/security/ReadmatesOAuthSuccessHandler.kt|com.readmates.auth.application.service.AuthSessionService
com/readmates/auth/infrastructure/security/ReadmatesOAuthSuccessHandler.kt|com.readmates.auth.application.service.GoogleLoginException
com/readmates/auth/infrastructure/security/ReadmatesOAuthSuccessHandler.kt|com.readmates.auth.application.service.GoogleLoginService
com/readmates/auth/infrastructure/security/ReadmatesOAuthSuccessHandler.kt|com.readmates.auth.application.service.InvitationService
com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt|com.readmates.auth.application.service.AuthSessionService
```

- [ ] **Step 1: Write RED port-injection and OAuth/session characterization tests.**

  Change handler/filter fixtures to input-port fakes. Pin: success issues exactly one app session, preserves cookie attributes, rotates servlet session ID on every callback exit, consumes exact state once, preserves valid app cookie on successful login, clears only stale app cookie on domain/provider error, keeps invitation priority and target-club binding, rejects mismatched/replayed state, and preserves `membership-left` versus `google` redirect errors.

- [ ] **Step 2: Run RED.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.auth.application.AuthSessionServiceTest \
    --tests com.readmates.auth.application.GoogleLoginServiceTest \
    --tests com.readmates.auth.application.AcceptInvitationUseCaseTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --tests com.readmates.architecture.ServerArchitectureInventoryTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 3: Move models/errors, implement ports, and retire five identities.**

  Preserve every method body except ownership/import changes and `AuthSessionService.COOKIE_NAME` replacement with the port property. Put the exact authorized `@file:Suppress("ktlint:standard:package-name")` at line 1 of `OAuthLoginUseCases.kt` only; add no other suppression or lint baseline/configuration change. Do not alter OAuth repository, cookie builder, token generation/hash, redirect construction, catch classification, or `finally` cleanup order. Move all five rows verbatim.

- [ ] **Step 4: Run GREEN and auth integration.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.auth.application.AuthSessionServiceTest \
    --tests com.readmates.auth.application.GoogleLoginServiceTest \
    --tests com.readmates.auth.application.AcceptInvitationUseCaseTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server integrationTest \
    --tests com.readmates.auth.api.GoogleOAuthLoginSessionTest \
    --tests com.readmates.auth.infrastructure.security.InviteAwareOAuthTest \
    --tests com.readmates.auth.api.OAuthAuthorizationControllerTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --tests com.readmates.architecture.ServerArchitectureInventoryTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server detekt ktlintMainSourceSetCheck ktlintTestSourceSetCheck \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

  Assert ledger arithmetic `4 current + 35 retired = 39 approved` and scan auth inbound/security production for zero `application.service` and zero `club.adapter.in` imports.

- [ ] **Step 5: Mutations, review, and commit.**

  Temporarily inject `GoogleLoginService` into the handler; the architecture rule must fail. Temporarily skip `changeSessionId()` on the provider-error path; the callback-exit rotation test must fail. Restore, rerun Step 4, request review, and commit:

  ```bash
  git commit -m "refactor(server): port OAuth and session ingress"
  ```

---

### Task 8: Remove The Reverse `club -> auth` Application Edge

**Files:**

- Create by moving: `server/src/main/kotlin/com/readmates/auth/application/model/JoinedClubSummary.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/model/ClubContextModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/port/in/CheckSupportAccessGrantUseCase.kt`
- Create: `server/src/main/kotlin/com/readmates/club/application/port/out/GeneratePlatformAdminInvitationTokenPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/service/SupportAccessGrantService.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminOnboardingService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/InvitationTokenService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/port/in/ResolveCurrentMemberUseCase.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberIdentityLookupPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/ResolveCurrentMemberService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAccountAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/AuthWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/security/CurrentMemberArgumentResolver.kt`
- Modify: `server/src/test/kotlin/com/readmates/archive/api/ArchiveControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/adapter/in/security/CurrentMemberArgumentResolverTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/infrastructure/security/MemberAuthoritiesFilterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/api/MemberNotificationControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/sessionclosing/adapter/in/web/HostSessionClosingControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/application/InvitationTokenServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/application/service/PlatformAdminOnboardingServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/application/service/SupportAccessGrantServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventoryTest.kt`
- Modify: `server/config/architecture/feature-dependency-baseline.txt`
- Modify: `server/config/architecture/phase-0-retired-feature-dependencies.txt`

**Interfaces:**

`JoinedClubSummary` keeps its exact seven fields and auth membership enum types, but auth owns it. `SupportMemberSynthesis` becomes:

```kotlin
data class SupportMemberSynthesis(
    val membershipProxyId: UUID,
    val displayName: String,
    val accountName: String,
)
```

The auth argument resolver maps a valid synthesis to the unchanged `CurrentMember` using explicit `MembershipRole.HOST` and `MembershipStatus.ACTIVE` at the auth inbound boundary.

The club-owned token port is:

```kotlin
data class GeneratedPlatformAdminInvitationToken(
    val rawToken: String,
    val tokenHash: String,
)

fun interface GeneratePlatformAdminInvitationTokenPort {
    fun generate(): GeneratedPlatformAdminInvitationToken
}
```

`InvitationTokenService` implements this port by calling its unchanged `generateToken()` and `hashToken(rawToken)`. `PlatformAdminOnboardingService` consumes only the club port and uses the returned pair. This keeps immediate consistency and exact token/hash behavior without a new event, adapter dependency, or infrastructure service.

**Exact retired feature identity:**

```text
club|auth
```

- [ ] **Step 1: Write RED cycle, ownership, and token/synthesis tests.**

  Add a boundary/source rule that `com.readmates.club.application..` imports no `com.readmates.auth..`. Tighten the inventory test so `cyclicFeatureComponents(actual)` equals exactly `setOf(setOf("session", "sessionimport", "sessionrecord"))` after the change. Pin joined-club JSON enum strings, invitation raw-token/hash pairing, accept URL, stored hash, and email send-after-commit behavior. In `CurrentMemberArgumentResolverTest`, seed a cached `SupportMemberSynthesis` and assert the resolver reuses it without another support lookup and materializes an exact `CurrentMember` with `MembershipRole.HOST` and `MembershipStatus.ACTIVE`. In `MemberAuthoritiesFilterTest`, seed the same cached synthesis, assert the request attribute remains cached/reused, and assert the effective authority is exactly `ROLE_HOST` with the explicit HOST/ACTIVE principal state. These two tests are the compatibility detector after role/status fields leave `SupportMemberSynthesis`.

- [ ] **Step 2: Run RED.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.auth.adapter.in.security.CurrentMemberArgumentResolverTest \
    --tests com.readmates.auth.infrastructure.security.MemberAuthoritiesFilterTest \
    --tests com.readmates.auth.application.InvitationTokenServiceTest \
    --tests com.readmates.club.application.service.PlatformAdminOnboardingServiceTest \
    --tests com.readmates.club.application.service.SupportAccessGrantServiceTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --tests com.readmates.architecture.ServerArchitectureInventoryTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

  Expected: club application still imports auth enums/token service and the feature graph still contains the six-feature cyclic component.

- [ ] **Step 3: Move the projection, narrow synthesis, and implement the consumer-owned port.**

  Preserve serialization and persistence mappings. Do not move `MembershipRole`/`MembershipStatus`, add a shared membership enum, or change token entropy/hash. At Task 8 start, rerun `rg -l 'com.readmates.club.application.model.JoinedClubSummary' server/src/test/kotlin` and require the result to equal the five test paths in this task before editing; a different set is a factual plan-path defect requiring review rather than silent scope growth.

- [ ] **Step 4: Retire `club|auth` and run GREEN.**

  Move `club|auth` verbatim from current feature baseline to retired, then run Step 2 plus:

  ```bash
  ./server/gradlew -p server integrationTest \
    --tests com.readmates.auth.api.AuthMeControllerTest \
    --tests com.readmates.club.api.PlatformAdminControllerTest \
    --tests com.readmates.auth.api.GoogleOAuthLoginSessionTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

  Assert `40 current + 1 retired = 41 approved`, `auth|club` remains current, and the only cyclic component is `session/sessionimport/sessionrecord`.

- [ ] **Step 5: Mutations, review, and commit.**

  Temporarily reintroduce one club application import of `MembershipRole`; the no-club-to-auth and exact feature-inventory tests must fail. Temporarily materialize cached support synthesis as MEMBER or SUSPENDED; both cached-synthesis tests must fail their explicit HOST/ACTIVE and `ROLE_HOST` assertions. Temporarily hash a different token than the returned raw token; the token-pair test must fail. Restore each mutation, rerun Step 4, request review, and commit:

  ```bash
  git commit -m "refactor(server): remove club auth reverse dependency"
  ```

---

### Task 9: Active Documentation, Canonical Gates, E2E, Public Safety, And Whole-Plan Review

**Files:**

- Modify: `docs/development/architecture.md`
- Modify: `docs/development/adr/0002-server-clean-architecture-with-archunit.md`
- Modify: `CHANGELOG.md`
- Create ignored execution artifact: `${SDD_WORKSPACE}/final-report.md`
- Do not modify the approved design or this plan during execution unless a factual path/signature defect is independently reviewed.

**Documentation contract:**

- Actors are capability-only pure Kotlin values; principals remain inbound carriers during incremental migration.
- Auth owns HTTP club-context extraction and calls the club resolve input port.
- Auth servlet-security and OAuth handlers inject input ports/models, not concrete services.
- Club owns membership/access policy; `club -> auth` is gone and `auth -> club` remains.
- Current actor carriers remain because consumers outside this slice still exist.
- Boundary ledger is `4/35/39`; feature ledger is `40/1/41`; session-family cycle and four boundary rows remain for the next plan.
- No API, authorization meaning, BFF/frontend source, migration, schema, deployment, or production behavior changed.

**Ignored report contract:**

The report records the plan SHA/base, full task/correction SHAs and subjects, exact changed-file inventory, 19 retired boundary identities grouped by task, `4 + 35 = 39`, retired `club|auth`, `40 + 1 = 41`, focused commands and counts, mutation RED/restored-GREEN evidence, canonical/full integration/E2E/public results, all reviews, skipped live evidence, residual risks, and exact clean status. It distinguishes repository, local Testcontainers, and local browser evidence from live production evidence.

- [ ] **Step 1: Resolve the ignored SDD workspace.**

  ```bash
  PLAN_FILE=docs/superpowers/plans/2026-08-12-readmates-backend-quality-phase-2-actor-auth-club-boundaries.md
  IMPLEMENTATION_BASE=615aedac85739c83abe8730e82cbf2cf316a8c8b
  SDD_SKILL_DIR="${CODEX_HOME:-$HOME/.codex}/skills/subagent-driven-development"
  SDD_WORKSPACE="$("$SDD_SKILL_DIR/scripts/sdd-workspace" "$PLAN_FILE")"
  REPORT_FILE="$SDD_WORKSPACE/final-report.md"
  PLAN_COMMIT="$(git log -n 1 --format=%H -- "$PLAN_FILE")"
  test -d "$SDD_WORKSPACE"
  test "${#PLAN_COMMIT}" -eq 40
  git check-ignore -q "$REPORT_FILE"
  ! git ls-files --error-unmatch "$REPORT_FILE" >/dev/null 2>&1
  ```

- [ ] **Step 2: Update three active docs and draft the ignored report.**

  Change only the actor/auth/club boundary paragraphs and `Unreleased` entry. Do not claim Phase 2 complete, cycle zero, boundary zero, deploy completion, or production verification. Populate all evidence already available; final gates and verdicts are execution-state fields in the ignored draft only.

- [ ] **Step 3: Audit exact scope and ledgers.**

  ```bash
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureInventoryTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ! rg -n '^import com\.readmates\.(auth\.application\.service|club\.adapter\.in)' \
    server/src/main/kotlin/com/readmates/auth/adapter/in \
    server/src/main/kotlin/com/readmates/auth/infrastructure/security
  ! rg -n '^import com\.readmates\.auth' server/src/main/kotlin/com/readmates/club/application
  test "$(awk '!/^#/ && NF {count++} END {print count+0}' server/config/architecture/boundary-import-baseline.txt)" -eq 4
  test "$(awk '!/^#/ && NF {count++} END {print count+0}' server/config/architecture/phase-0-retired-boundary-imports.txt)" -eq 35
  test "$(awk '!/^#/ && NF {count++} END {print count+0}' server/config/architecture/feature-dependency-baseline.txt)" -eq 40
  test "$(awk '!/^#/ && NF {count++} END {print count+0}' server/config/architecture/phase-0-retired-feature-dependencies.txt)" -eq 1
  rg -n '^auth\|club$' server/config/architecture/feature-dependency-baseline.txt
  rg -n '^club\|auth$' server/config/architecture/phase-0-retired-feature-dependencies.txt
  SUPPRESSION_AUDIT="$SDD_WORKSPACE/package-name-suppressions.actual"
  git diff --unified=0 "$IMPLEMENTATION_BASE"..HEAD -- server | \
    awk '
      /^\+\+\+ b\// { file = substr($0, 7); next }
      /^\+@file:Suppress\("ktlint:standard:package-name"\)$/ {
        print file "|" substr($0, 2); next
      }
      /^\+.*Suppress/ { print "UNAUTHORIZED|" file "|" substr($0, 2) }
    ' | LC_ALL=C sort > "$SUPPRESSION_AUDIT"
  diff -u <(printf '%s\n' \
    'server/src/main/kotlin/com/readmates/auth/adapter/in/security/AuthClubContextResolver.kt|@file:Suppress("ktlint:standard:package-name")' \
    'server/src/main/kotlin/com/readmates/auth/application/port/in/AuthSecurityUseCases.kt|@file:Suppress("ktlint:standard:package-name")' \
    'server/src/main/kotlin/com/readmates/auth/application/port/in/OAuthLoginUseCases.kt|@file:Suppress("ktlint:standard:package-name")' \
    'server/src/test/kotlin/com/readmates/auth/adapter/in/security/AuthClubContextResolverTest.kt|@file:Suppress("ktlint:standard:package-name")') \
    "$SUPPRESSION_AUDIT"
  test -z "$(git diff --name-only "$IMPLEMENTATION_BASE"..HEAD -- \
    server/config/detekt server/config/ktlint)"
  git diff --name-only "$IMPLEMENTATION_BASE"..HEAD
  ```

  The suppression audit is exact and fail-closed: any fifth suppression, different annotation text/path, or detekt/ktlint baseline/configuration edit fails this task.

- [ ] **Step 4: Obtain a fresh dirty-doc/report review and commit docs.**

  Reviewer checks active truth, exact ledgers, coexistence, exclusions, public safety, and report/history reconciliation. A source/test issue returns to its originating Task 1–8; a docs-only correction stays within the three tracked docs. If docs changed, stage only them and commit:

  ```bash
  git commit -m "docs: document Phase 2 actor auth boundaries"
  ```

- [ ] **Step 5: Run canonical server gates sequentially at tracked candidate HEAD.**

  ```bash
  ./server/gradlew -p server compileKotlin \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./scripts/server-ci-check.sh
  ./server/gradlew -p server integrationTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  git diff --check "$IMPLEMENTATION_BASE"..HEAD
  ```

  Record XML totals and explicitly name actor, club-context, authority, member lifecycle, profile, OAuth, platform-admin, and architecture suites.

- [ ] **Step 6: Run focused then full auth/browser E2E with the pinned package manager.**

  ```bash
  corepack pnpm --dir front exec playwright test \
    tests/e2e/google-auth-invite-flow.spec.ts \
    tests/e2e/google-auth-viewer.spec.ts \
    tests/e2e/google-login-recovery.spec.ts \
    tests/e2e/dev-login-session-flow.spec.ts \
    tests/e2e/multi-club-flow.spec.ts \
    tests/e2e/member-lifecycle.spec.ts \
    tests/e2e/member-profile-permissions.spec.ts \
    tests/e2e/admin-support.spec.ts \
    tests/e2e/admin-clubs-triage.spec.ts
  corepack pnpm --dir front test:e2e
  ```

  If `corepack` is unavailable, use the repository-approved fallback `npx --yes corepack@0.35.0 pnpm --dir front ...` and record the exact command. Do not substitute mocks for the canonical full E2E lane.

- [ ] **Step 7: Run public-release and docs safety gates at the same HEAD.**

  ```bash
  ./scripts/build-public-release-candidate.sh
  ./scripts/public-release-check.sh .tmp/public-release-candidate
  git diff --check "$IMPLEMENTATION_BASE"..HEAD -- \
    docs/development/architecture.md \
    docs/development/adr/0002-server-clean-architecture-with-archunit.md \
    CHANGELOG.md
  ```

  Extract added lines from those three docs and assert no match for:

  ```text
  (^|[^A-Za-z0-9_])([o]cid1\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)
  ```

  The scan must distinguish no-match exit 1 from execution error. Confirm changed files are byte-identical in the public candidate, `.git` and symlinks are absent, and gitleaks passes.

- [ ] **Step 8: Run whole-plan review with six independent verdicts.**

  Generate a review package from fixed implementation base through current tracked HEAD. Require separate verdicts for:

  1. plan compliance and exact actor/auth–club scope;
  2. actor purity, capability parity, port/type ownership, and carrier coexistence;
  3. auth, club-context, OAuth, cookie, redirect, and authorization behavior preservation;
  4. RED/GREEN, denied-path, different-club, mutation, integration, and E2E adequacy;
  5. release/public safety and absence of private values;
  6. readiness for the next session ownership/cycle plan.

  Every material finding starts an explicit correction wave in its originating task allowlist. Use exact correction subjects: Task 1 `fix(server): correct actor capability review`; Task 2 `fix(server): correct platform actor review`; Task 3 `fix(server): correct auth club context review`; Task 4 `fix(server): correct auth security port review`; Task 5 `fix(server): correct club actor authorization review`; Task 6 `fix(server): correct auth profile boundary review`; Task 7 `fix(server): correct OAuth session boundary review`; Task 8 `fix(server): correct auth club cycle review`; docs only `docs: correct Phase 2 actor auth documentation`.

  Before each correction commit, rerun the originating task's focused GREEN and architecture inventory selectors, verify staged paths, and request scoped rereview. After each correction commit, rerun Steps 3, 5, 6, and 7, regenerate the package, and obtain all six fresh verdicts. Repeat until all are clean.

- [ ] **Step 9: Finalize ignored evidence and prove clean tracked state.**

  Replace every execution-state field in the ignored report with actual evidence, include full 40-character SHAs and subjects, then run:

  ```bash
  test -s "$REPORT_FILE"
  rg -n '^## (Final whole-plan verdicts|Full commit SHAs|Final clean status)$' "$REPORT_FILE"
  assert_no_report_match() {
    local pattern="$1"
    local file="$2"
    if rg -q -- "$pattern" "$file"; then
      return 1
    else
      local status=$?
      test "$status" -eq 1
    fi
  }
  REPORT_SENSITIVE_PATTERN='(^|[^A-Za-z0-9_])([o]cid1\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|/[Pp]rivate/[Tt]mp/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY|([Cc]ookie|[Ss]et-[Cc]ookie|[Aa]uthorization):[[:space:]]*[^[:space:]]+|[?&]([Cc]ode|[Ss]tate)=[^&[:space:]]+|[Oo][Aa][Uu][Tt][Hh][_-]?([Cc]ode|[Ss]tate)[=:][[:space:]]*[^[:space:]]+|[Rr]eadmates_[Ss]ession=[^;[:space:]]+|[Ss]ession[_-]?([Ii][Dd]|[Tt]oken|[Cc]ookie)?[=:][[:space:]]*[^[:space:]]+|([Ii]nvitation|[Ii]nvite)[_-]?([Ii][Dd]|[Tt]oken)?[=:][[:space:]]*[^[:space:]]+|/([Ii]nvite|[Ii]nvitations)/[A-Za-z0-9._~-]{8,})'
  assert_no_report_match '[[:blank:]]+$' "$REPORT_FILE"
  assert_no_report_match "$REPORT_SENSITIVE_PATTERN" "$REPORT_FILE"
  git check-ignore -q "$REPORT_FILE"
  ! git ls-files --error-unmatch "$REPORT_FILE" >/dev/null 2>&1
  test -z "$(git status --porcelain=v1 --untracked-files=all)"
  git status --short --branch --untracked-files=all
  ```

  `assert_no_report_match` treats ripgrep exit 1 as the only passing no-match result; a match or scanner error fails without echoing a possibly sensitive line. The ignored-report scan covers trailing whitespace, cookie/authorization values, raw OAuth callback code/state, session and invitation identifiers/tokens/cookies, token-shaped credentials, private-key markers, and local absolute user/temp paths. The ignored report is never committed. A factual tracked-doc error returns to the docs correction loop and requires fresh canonical/E2E/public evidence and six clean verdicts.

---

## Acceptance-Matrix Mapping

- **Actor or authorization — selected:** characterize anonymous GUEST, VIEWER, active MEMBER, active HOST, suspended membership, and OWNER/OPERATOR/SUPPORT platform admin. Prove locked guest direct URLs, member/viewer denied host writes, support denied platform mutations, stale authority removal, last-host protection, and exact capability sets.
- **Club context — selected:** prove trusted slug precedence, host fallback, unscoped compatibility, unknown supplied context, different-club isolation, support-grant synthesis, AuthMe scoping, and profile fail-closed behavior in unit, server integration, and multi-club E2E.
- **BFF or OAuth — selected:** BFF source is unchanged, but OAuth handler/session ingress is touched. Preserve one-use state, reverse-order multi-tab state survival, invitation priority, target-club binding, safe return path, callback-exit session rotation, valid cookie preservation, stale-cookie clearing, replay/mismatch rejection, and trusted-header semantics through existing integration and E2E evidence.
- **Persistence or migration — excluded as a change surface:** no SQL, repository query, schema, or migration changes are authorized. Full `integrationTest` remains final regression evidence because auth and club behavior is persistence-backed.
- **Guest/public exposure and DTO privacy — excluded:** no guest/public query or DTO changes. Anonymous denial is covered only as actor/authorization evidence.
- **Async, cache, or provider — excluded:** no Kafka, Redis, mail, provider, retry, lease, or cache policy changes.
- **UI/runtime state — excluded:** no frontend source, route, component, copy, responsive, or state behavior changes. Browser E2E is contract evidence only.

## Mutation Checklist

Every task report records exact baseline GREEN, temporary RED, failing assertion/rule, byte-for-byte restoration, and identical restored GREEN command. Mutation edits are never committed.

1. Remove `MANAGE_MEMBERS` from an active HOST actor.
2. Grant `MANAGE_SUPPORT_ACCESS` to an OPERATOR actor.
3. Authorize club onboarding with `VIEW_CLUBS` instead of `CREATE_CLUB`, then independently remove the `VIEW_CLUBS` list guard and the `VIEW_CLUB_OPERATIONS` operations guards; the three exact denied-path detectors must each fail.
4. Resolve host context before slug context.
5. Treat an unknown supplied slug as unscoped.
6. Replace `AuthenticatedMemberSnapshot?` with `ClubActor?` in authority synthesis and derive the authority from capabilities; the signature detector and 12-role/status matrix, including suspended HOST = `ROLE_HOST`, must fail.
7. Retain stale incoming `ROLE_HOST` for a non-member.
8. Let `MANAGE_INVITATIONS` authorize member lifecycle mutation.
9. Pass `CurrentMember` directly to one migrated auth host input port.
10. Map `MemberProfileError.MEMBER_NOT_FOUND` to HTTP 403.
11. Inject `GoogleLoginService` into `ReadmatesOAuthSuccessHandler`.
12. Skip servlet session-ID rotation on an OAuth provider-error exit.
13. Reintroduce one `club.application -> auth` import.
14. Hash a different invitation token than the raw token returned to onboarding.
15. Materialize cached support synthesis as MEMBER or SUSPENDED instead of explicit HOST/ACTIVE.

## Explicit Residuals And Excluded Scope

- `CurrentMember`, `CurrentPlatformAdmin`, and `CurrentUser` remain because admin, AI, notification, session, sessionrecord, sessionimport, archive, note, feedback, and other consumers still use them. Their deletion requires later zero-consumer proof.
- The final boundary ledger is intentionally 4, not zero: one `sessionclosing`, one `sessionimport`, and two `sessionrecord` identities remain.
- The final feature graph still has the `session/sessionimport/sessionrecord` cyclic component. The next plan removes exactly the two reverse feature edges `sessionrecord|sessionimport` and `sessionrecord|session` while preserving forward workflow directions, and separately retires the four remaining boundary-ownership debts (one `sessionclosing`, one `sessionimport`, and two `sessionrecord` identities). There is no third session reverse edge in that scope.
- `auth|club` remains because auth consumes club context, joined/membership policy, and the club-owned invitation-token port. This is the approved direction; this plan removes only `club|auth`.
- Some club use cases remain on `CurrentPlatformAdmin` where exact platform role text is persisted in audit data or returned in API projections. PlatformActor migration is incremental and does not rewrite audit semantics.
- Member-profile compatibility PATCH methods may continue accepting an authentication email. This plan moves their failure ownership and club-context helper, not their public contract or compatibility-window behavior.
- No frontend/BFF source, database schema, migration, live deployment, production runtime, live provider, real email, remote push, PR, tag, or production-data action is part of this plan.
