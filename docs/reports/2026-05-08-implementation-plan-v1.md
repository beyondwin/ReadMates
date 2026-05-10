# ReadMates 구현 플랜

작성일: 2026-05-08
기반 문서: `2026-05-08-improvements-v1.md`
대상 버전: `v1.5.2` 이후

## 개요

본 문서는 `2026-05-08-improvements-v1.md`에서 도출된 7개 카테고리(아키텍처/백엔드/프런트/인프라/보안/테스트/DX) 개선사항을 **PR 단위로 실행 가능한 태스크 36개**로 분해한 실행 계획이다. 각 태스크는 독립적으로 머지 가능하도록 인터페이스 시그니처, 분할 후 파일 트리, 검증 명령까지 명시한다.

- **총 예상 기간**: 약 10~12주 (1인 풀타임 기준), 병렬 진행 시 6~8주
- **우선순위 순서**: P0(보안 history 정비) → P1(CI 가드 / 거대 파일 분해 / 보안 강화) → P2(DX·문서 자동화) → P3(중장기)
- **본 플랜이 다루지 않는 것**: AI 콘텐츠 생성 신규 기능, Public site SSR/RSS, Web Push 등 Phase D(사용자 가치 확장)는 별도 ADR로 처리

## 작업 규칙

- **브랜치 네이밍**: `phaseN/task-XXX-<slug>` (예: `phase1/task-013-osv-scanner`).
- **PR 단위**: 1 태스크 = 1 PR. 3 PR 이상 의존하는 태스크는 의존성 그래프에 명시.
- **PR 본문 필수 항목**: 변경 파일 / 검증 로그(아래 검증 명령 결과) / 회귀 우려 / 후속 태스크 링크.
- **공통 검증 베이스라인** (모든 PR이 통과해야 하는 최소 묶음):
  - `pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build`
  - `./server/gradlew -p server clean test`
  - 인증/route/BFF/full user-flow 변경 시 추가: `pnpm --dir front test:e2e`
  - 공개 release 영향이 있는 PR: `./scripts/build-public-release-candidate.sh && ./scripts/public-release-check.sh .tmp/public-release-candidate`
- **CODEOWNERS**: `.github/CODEOWNERS` 항목에 해당하는 영역 변경은 owner 자동 review 필요.
- **롤백 전략**: 각 PR은 단일 커밋으로 squash 머지하여 `git revert <sha>`만으로 이전 상태로 복귀 가능해야 함.

---

# Phase 0: 보안 (즉시 — 1일 내, P0)

## TASK-001: 공개 저장소 분리 또는 history 정비

- **목표**: 보안 리포트 Finding 1/2(`docs/superpowers/**` 추적, 실명 Gmail 노출)를 해소하여 공개 전환 차단을 푼다.
- **파일**:
  - `.gstack/security-reports/2026-04-27-194155+0900-readmates-security-posture.md` (참고)
  - `scripts/build-public-release-candidate.sh`, `scripts/public-release-check.sh`
  - `docs/superpowers/**` (제거 대상)
- **구현 방법**:
  1. 결정: (A) `git filter-repo --path docs/superpowers --invert-paths` + `--mailmap`(Gmail → `<gh-username>@users.noreply.github.com`)로 in-place 정비, 또는 (B) fresh public repo (`readmates-public`) 생성 후 release candidate만 push. ADR 형식의 결정 기록을 `docs/development/technical-decisions.md`에 1개 항목 추가.
  2. (A) 선택 시 `git filter-repo` 실행 → 모든 협업자 fresh clone 공지 → tag 재push → release-please/CHANGELOG 무결성 재검증.
  3. (B) 선택 시 `scripts/build-public-release-candidate.sh` 결과를 새 repo에 push, 현재 repo는 private 유지.
- **검증**:
  - `git log --all --format='%ae%n%ce' | sort -u` 결과에 개인 Gmail 없음
  - `git ls-files | grep '^docs/superpowers'` 결과 없음
  - `./scripts/public-release-check.sh .tmp/public-release-candidate` exit 0
- **예상 소요**: 0.5d (결정+ADR) + 0.5d (실행+검증) = 1d
- **선행 조건**: 없음

---

# Phase 1: CI / 인프라 강화 (1~2주, P1)

## TASK-010: CI에 `pnpm audit --prod` 게이트 추가

- **목표**: 프런트 의존성 CVE를 PR 시점에 차단.
- **파일**: `.github/workflows/ci.yml` (frontend job)
- **구현 방법**: `Build` step 다음에 아래 추가.
  ```yaml
  - name: Audit frontend dependencies
    run: pnpm audit --prod --audit-level=high
    continue-on-error: false
  ```
  baseline 합의가 필요하면 첫 1주는 `continue-on-error: true`로 두고 `audit-ci.json` allowlist를 만든 뒤 강제로 전환.
- **검증**: `act -j frontend` 또는 PR 트리거하여 step 통과 확인. 의도적 취약 패키지 추가 PR로 fail signal 검증.
- **예상 소요**: 0.25d
- **선행 조건**: 없음

## TASK-011: CI에 OSV Scanner JVM 게이트 추가

- **목표**: Spring Boot/Kotlin/Flyway 의존성 CVE 게이트.
- **파일**: `.github/workflows/ci.yml` (backend job)
- **구현 방법**: `Test` step 다음.
  ```yaml
  - name: OSV Scanner (JVM dependencies)
    uses: google/osv-scanner-action/osv-scanner-action@v2.2.3
    with:
      scan-args: |-
        --recursive
        --lockfile=server/gradle.lockfile
        ./server
    continue-on-error: true   # 첫 2주 baseline 수집
  ```
  Gradle dependency lock(`./server/gradlew -p server dependencies --write-locks`) 미적용 상태면 TASK-011a로 lock 활성화 선행.
- **검증**: PR에서 step 결과 SARIF가 GitHub Security 탭에 노출. baseline 후 `continue-on-error: false`.
- **예상 소요**: 0.5d
- **선행 조건**: TASK-011a (Gradle dependency lock 활성화)

## TASK-011a: Gradle dependency lock 활성화

- **목표**: OSV/Dependency-Check가 deterministic input을 받게 한다.
- **파일**: `server/build.gradle.kts`, `server/gradle.lockfile` (생성)
- **구현 방법**: `build.gradle.kts`에 아래 추가 후 lock 생성.
  ```kotlin
  dependencyLocking {
      lockAllConfigurations()
      lockMode.set(LockMode.STRICT)
  }
  ```
  명령: `./server/gradlew -p server dependencies --write-locks` 후 `gradle.lockfile` 커밋.
- **검증**: `./server/gradlew -p server test` 통과 + lockfile 변경 시 PR diff에 표기.
- **예상 소요**: 0.25d
- **선행 조건**: 없음

## TASK-012: CI에 test artifact upload 추가

- **목표**: 실패 시 traces / surefire xml / playwright report를 자동 보존.
- **파일**: `.github/workflows/ci.yml` (frontend, backend job 양쪽)
- **구현 방법**: 각 job 끝에 아래 step 추가.
  ```yaml
  - name: Upload test results
    if: failure()
    uses: actions/upload-artifact@26f96dfa697d77e81fd5907df203aa23a56210a8 # v4.4.3
    with:
      name: ${{ github.job }}-test-results-${{ github.run_id }}
      path: |
        front/test-results/**
        front/playwright-report/**
        server/build/test-results/**
        server/build/reports/tests/**
      retention-days: 14
  ```
- **검증**: 의도적 실패 PR로 artifact 다운로드 확인.
- **예상 소요**: 0.25d
- **선행 조건**: 없음

## TASK-013: CODEOWNERS 보안 surface 확장

- **목표**: auth/security/migration/scripts 변경에 owner review 자동 부여.
- **파일**: `.github/CODEOWNERS`
- **구현 방법**: 기존 `.github/workflows/** @beyondwin` 아래에 추가.
  ```
  /server/src/main/kotlin/com/readmates/auth/**       @beyondwin
  /server/src/main/kotlin/com/readmates/shared/security/** @beyondwin
  /server/src/main/resources/db/mysql/migration/**    @beyondwin
  /front/functions/**                                 @beyondwin
  /scripts/**                                         @beyondwin
  /.gitleaks.toml                                     @beyondwin
  /deploy/**                                          @beyondwin
  ```
- **검증**: CODEOWNERS PR이 Settings > Branch protection에서 "require review from Code Owners"로 동작 확인.
- **예상 소요**: 0.25d
- **선행 조건**: 없음

## TASK-014: GHCR image SBOM + provenance + Trivy 게이트

- **목표**: 운영 이미지 출처/취약점을 release 시점에 가드.
- **파일**: `.github/workflows/deploy-server.yml`
- **구현 방법**:
  1. `docker/build-push-action` step의 `with`에 `sbom: true`, `provenance: mode=max` 추가.
  2. push 직후 다음 step 추가.
     ```yaml
     - name: Trivy scan release image
       uses: aquasecurity/trivy-action@0.28.0
       with:
         image-ref: ghcr.io/${{ github.repository_owner }}/readmates-server:${{ env.TAG }}
         severity: HIGH,CRITICAL
         exit-code: 1
         ignore-unfixed: true
     ```
  3. Trivy SARIF는 별도 upload step으로 GitHub Security 탭에 게시.
- **검증**: 다음 release tag 빌드에서 SBOM이 GHCR Packages 페이지의 "Provenance" 탭에 노출.
- **예상 소요**: 0.5d
- **선행 조건**: 없음

## TASK-015: Dockerfile 이중화 정리

- **목표**: `server/Dockerfile`(legacy, build-from-source)과 `server/Dockerfile.release`의 의도를 명확히 한다.
- **파일**: `server/Dockerfile` → `server/Dockerfile.local`로 rename, `server/Dockerfile.release`는 유지.
- **구현 방법**:
  1. `server/Dockerfile` → `server/Dockerfile.local` rename.
  2. `compose.yml`/`scripts/run-server-local.sh`에서 build context가 `Dockerfile.local`을 참조하도록 변경.
  3. README의 Docker section에 두 파일 용도 1줄 명시.
- **검증**: `docker compose build` 통과, `deploy-server.yml`이 `Dockerfile.release`만 사용하는지 grep으로 확인.
- **예상 소요**: 0.25d
- **선행 조건**: 없음

## TASK-016: BFF redirect Location host allowlist 가드

- **목표**: SSRF/open-redirect 가능성을 차단.
- **파일**: `front/functions/api/bff/[[path]].ts`
- **구현 방법**: `redirect: "manual"` 후 응답 status가 3xx면 `Location` 헤더 host를 검사하여 allowlist 외이면 502를 반환.
  ```ts
  if (upstream.status >= 300 && upstream.status < 400) {
    const location = upstream.headers.get("Location");
    if (location && !isAllowedRedirectHost(location, context.env)) {
      return new Response(null, { status: 502, headers: { "X-Bff-Reject": "untrusted-redirect" } });
    }
  }
  ```
  `isAllowedRedirectHost`는 `front/functions/_shared/proxy.ts`에 추가하고 `READMATES_API_BASE_URL` host + 자기 자신 host만 허용.
- **검증**: `front/tests/unit/cloudflare-bff.test.ts`에 신규 테스트 케이스(외부 host로 302 흘러올 때 502 반환).
- **예상 소요**: 0.5d
- **선행 조건**: 없음

## TASK-017: BFF / RateLimit 로그에서 remoteAddr hash 처리

- **목표**: PII 일관성 확보.
- **파일**: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilter.kt`
- **구현 방법**: `RateLimitFilter`의 IP hash helper(`shared.security.ClientIpHashing` 정도)를 추출해 `BffSecretFilter`도 동일하게 사용. 시그니처:
  ```kotlin
  object ClientIpHashing {
      fun hashClientIp(raw: String?, salt: String): String
  }
  ```
- **검증**: 단위 테스트로 동일 입력은 동일 hash, 다른 salt면 다름 확인. 운영 로그에서 IP 평문이 사라졌는지 staging에서 확인.
- **예상 소요**: 0.25d
- **선행 조건**: 없음

---

# Phase 2: 백엔드 리팩터 (2~4주, P1)

## TASK-020: `JdbcFeedbackDocumentStoreAdapter` `select *` 제거

- **목표**: schema drift 안전성 향상.
- **파일**: `server/src/main/kotlin/com/readmates/feedback/adapter/out/persistence/JdbcFeedbackDocumentStoreAdapter.kt:36, 73`
- **구현 방법**: outer query의 `select *`를 inner subquery에서 정의한 8개 컬럼(`document_id`, `session_id`, `session_number`, `book_title`, `session_date`, `document_title`, `legacy_source_text`, `file_name`, `created_at`, `document_rank`) 명시 list로 교체.
- **검증**: `./server/gradlew -p server test --tests '*FeedbackDocumentStoreAdapter*'` + `MySqlQueryPlanTest` 통과. `ServerQueryBudgetTest` 회귀 없음.
- **예상 소요**: 0.25d
- **선행 조건**: 없음

## TASK-021: `JdbcMemberAccountAdapter` 분해 (612 LOC → 4 파일)

- **목표**: `session.adapter.out.persistence`의 `*Queries` + `*WriteOperations` + `*RowMappers` + `Jdbc*Adapter` 패턴 적용.
- **파일** (분할 후):
  - `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/MemberAccountQueries.kt` — `findActiveMemberByEmail`, `findActiveMemberByUserId`, `findMemberByUserIdAndClubId`, `findJoinedClubSummaries`, `findUserByGoogleSubject`
  - `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/MemberAccountWriteOperations.kt` — `createUserAndMembership`, `linkGoogleSubject`, `updateMembershipStatus`
  - `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/MemberAccountRowMappers.kt` — `ResultSet.toCurrentMember()`, `toJoinedClubSummary()` 등 `internal` 확장 함수
  - `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAccountAdapter.kt` — `MemberAccountStorePort` 구현 (slim, 50~80 LOC)
- **클래스 시그니처**:
  ```kotlin
  class MemberAccountQueries(private val jdbcTemplate: JdbcTemplate) {
      fun findActiveMemberByEmail(email: String): CurrentMember?
      fun findActiveMemberByUserId(userId: String): CurrentMember?
      // ... 등 read-only
  }
  class MemberAccountWriteOperations(private val jdbcTemplate: JdbcTemplate) {
      fun createUserAndMembership(...): UUID
      // ... 등 mutation
  }
  ```
- **검증**: `ServerArchitectureBoundaryTest`, `MemberAccountStorePort` 단위/통합 테스트 통과. LOC: adapter 본체 ≤ 80 LOC, query/write 각 ≤ 350 LOC.
- **예상 소요**: 1d
- **선행 조건**: 없음

## TASK-022: `JdbcNotesFeedAdapter` 분해 (576 LOC)

- **목표**: 동일 패턴 적용 + correlated subquery 4개를 단일 `LEFT JOIN ... GROUP BY`로 단순화 시도.
- **파일** (분할 후):
  - `note/adapter/out/persistence/NotesFeedQueries.kt`
  - `note/adapter/out/persistence/NotesFeedRowMappers.kt`
  - `note/adapter/out/persistence/JdbcNotesFeedAdapter.kt` (slim)
- **구현 방법**:
  1. 우선 split만 진행하여 동작 동등성 검증.
  2. 별도 follow-up PR(TASK-022a)로 `loadNoteSessions`의 4 correlated subquery를 `LEFT JOIN sessions_note_counts AS aggregate` 패턴으로 교체. `ServerQueryBudgetTest`로 query 수 변화 측정 후 결정.
- **검증**: `MySqlQueryPlanTest`로 EXPLAIN cost 회귀 확인. `ServerQueryBudgetTest` budget 갱신은 별도 PR.
- **예상 소요**: 1d (split) + 0.5d (TASK-022a 시도)
- **선행 조건**: TASK-021 (패턴 정착)

## TASK-023: `JdbcHostInvitationStoreAdapter` 분해 (468 LOC)

- **목표**: 동일 패턴.
- **파일**: `auth/adapter/out/persistence/HostInvitationQueries.kt` + `HostInvitationWriteOperations.kt` + `HostInvitationRowMappers.kt` + slim `JdbcHostInvitationStoreAdapter.kt`
- **검증**: `*HostInvitation*` 테스트 통과.
- **예상 소요**: 0.75d
- **선행 조건**: TASK-021

## TASK-024: `JdbcMemberLifecycleStoreAdapter` 분해 (422 LOC)

- **목표**: 동일 패턴.
- **파일**: `auth/adapter/out/persistence/MemberLifecycleQueries.kt` + `MemberLifecycleWriteOperations.kt` + `MemberLifecycleRowMappers.kt` + slim adapter.
- **검증**: `*MemberLifecycle*` 테스트 통과.
- **예상 소요**: 0.75d
- **선행 조건**: TASK-021

## TASK-025: `HostSessionCommandService` 3-service split

- **목표**: lifecycle / draft / read 책임 분리로 트랜잭션 경계 명확화.
- **파일** (변경 후):
  - `session/application/service/HostSessionLifecycleService.kt` — `open`, `close`, `publish`, `delete`, `updateVisibility`
  - `session/application/service/HostSessionDraftService.kt` — `create`, `update`, `confirmAttendance`, `upsertPublication`
  - `session/application/service/HostSessionReadService.kt` — `list`, `detail`, `dashboard`, `upcoming`, `deletionPreview`
  - 기존 `HostSessionCommandService.kt` 제거 (Spring 의존성 wiring은 use-case 인터페이스가 그대로이므로 controller 변경 없음)
- **클래스 시그니처**:
  ```kotlin
  @Service
  class HostSessionLifecycleService(
      private val port: HostSessionWritePort,
      private val cacheInvalidation: ReadCacheInvalidationPort,
      private val recordNotificationEventUseCase: RecordNotificationEventUseCase,
  ) : ManageHostSessionUseCase  // open/close/publish/delete/updateVisibility 만 override

  @Service
  class HostSessionDraftService(...) : ManageHostSessionUseCase, ConfirmAttendanceUseCase, UpsertPublicationUseCase

  @Service
  class HostSessionReadService(...) : ListUpcomingSessionsUseCase, GetHostDashboardUseCase
  ```
  주의: `ManageHostSessionUseCase`는 lifecycle/draft 양쪽이 일부 메서드를 구현하므로 인터페이스를 `ManageHostSessionLifecycleUseCase` + `ManageHostSessionDraftUseCase`로 split 하는 것을 함께 진행.
- **검증**: 기존 controller 테스트 그대로 통과, ArchUnit 통과.
- **예상 소요**: 1.5d
- **선행 조건**: 없음 (TASK-021과 병렬 가능)

## TASK-026: SecurityConfig CSRF 매처 외부화

- **목표**: 30회 반복되는 `methodAndPath(...)` 블록의 가독성/검토성을 높인다.
- **파일**: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`, 신규 `server/src/main/kotlin/com/readmates/auth/infrastructure/security/CsrfIgnoredEndpoints.kt`
- **구현 방법**:
  ```kotlin
  internal object CsrfIgnoredEndpoints {
      val literalPaths: Array<String> = arrayOf(...)
      val methodPathRegexes: List<Pair<String, Regex>> = listOf(...)
      fun toRequestMatchers(): Array<RequestMatcher> = ...
  }
  ```
  `SecurityConfig`는 `it.ignoringRequestMatchers(*CsrfIgnoredEndpoints.toRequestMatchers())` 한 줄로 정리.
- **검증**: `*SecurityConfigTest*`, BFF authorization 테스트 통과. policy 변화 없음을 확인하기 위해 git diff 의 effective matcher 목록을 PR 본문에 첨부.
- **예상 소요**: 0.5d
- **선행 조건**: 없음

## TASK-027: 트랜잭션 isolation 정책 명시

- **목표**: REPEATABLE_READ 기본의 join+write 혼재 서비스에서 의도를 코드에 표기.
- **파일**: `session/application/service/*.kt`, `auth/application/service/InvitationService.kt`, `auth/application/service/GoogleLoginService.kt` (이미 명시)
- **구현 방법**: 각 service의 `@Transactional`에 `isolation = Isolation.READ_COMMITTED`(기본값으로 의도된 곳) 또는 `Isolation.REPEATABLE_READ`(명시 의도) 명시. 결정 근거를 `docs/development/technical-decisions.md`에 1 항목 추가.
- **검증**: 기존 통합 테스트 통과. `MySqlQueryPlanTest`에서 isolation 변경으로 인한 deadlock 회귀 없음.
- **예상 소요**: 0.5d
- **선행 조건**: TASK-025 (lifecycle/draft split 후 적용이 자연스러움)

## TASK-028: Notification slice 응집도 분리

- **목표**: `notification` 평면 패키지를 `send` / `inbox` / `audit` sub-slice로 정렬.
- **파일** (이동):
  - `notification/application/{model,service,port}/**`
    → `notification/send/**`(이메일 outbox/relay/delivery), `notification/inbox/**`(member_notifications), `notification/audit/**`(test mail audit)
  - `application.model.NotificationEmailTemplates`(340 LOC)는 `notification/send/application/model/`로
- **구현 방법**: 점진적 PR 3개로 split.
  - PR-A: `audit` 분리(가장 결합도 낮음)
  - PR-B: `inbox` 분리
  - PR-C: `send`로 잔여 이동 + ArchUnit 룰에 sub-slice cross import 금지 추가
- **검증**: `ServerArchitectureBoundaryTest`에 sub-slice 룰 추가 후 통과. 기존 e2e 통과.
- **예상 소요**: 2d (PR 3개 합산)
- **선행 조건**: TASK-022 (패턴 안착), TASK-025

## TASK-029: Spring Boot 4.0.0 deprecated API sweep

- **목표**: 4.x 이행 후 deprecated API 잔재 제거.
- **파일**: `server/src/main/kotlin/**` 전반(특히 `SecurityConfig`, `CorsConfiguration`, `WebMvcConfigurer`)
- **구현 방법**:
  1. `./server/gradlew -p server compileKotlin -Werror`로 deprecation 경고 수집.
  2. Spring Boot 4 release notes / migration guide 기준 마이그레이션 항목 표 작성 (PR 본문).
  3. `RegexRequestMatcher` 사용처는 `RequestMatchers.regexMatchers(...)` deprecated 여부 확인 후 `RegexRequestMatcher.regexMatcher(...)`로 일관화.
- **검증**: 컴파일 경고 0건, 전체 테스트 통과.
- **예상 소요**: 1d
- **선행 조건**: 없음

## TASK-030: Flyway V2~V8 누락 주석화 + migration 정책 문서

- **목표**: `V1`, `V9~V22` 점프 의도 문서화.
- **파일**: `server/src/main/resources/db/mysql/migration/README.md` (신규), `docs/development/local-setup.md`
- **구현 방법**: `MySqlFlywayMigrationTest` 결과로 의도 확인 후 README에 1단락 추가. 의도되지 않았으면 placeholder migration `V2__retired.sql` 등으로 명시(빈 SQL + 주석).
- **검증**: `MySqlFlywayMigrationTest` 통과.
- **예상 소요**: 0.25d
- **선행 조건**: 없음

## TASK-031: `ApiErrorResponse`에 traceId 필드 추가

- **목표**: 5xx 발생 시 사용자 신고/디버그 fingerprint 제공.
- **파일**: `server/src/main/kotlin/com/readmates/shared/web/ApiErrorResponse.kt`, `GlobalExceptionHandler.kt`(또는 동등 위치)
- **구현 방법**: `Micrometer`/`MDC`의 `traceId`를 response body에 포함. 미존재 시 `UUID.randomUUID().toString().take(8)`로 short id 생성. 시그니처:
  ```kotlin
  data class ApiErrorResponse(
      val code: String,
      val message: String,
      val traceId: String,
      val fields: Map<String, String>? = null,
  )
  ```
  Frontend `front/shared/api/client.ts`의 `parseReadmatesResponse`에서 `traceId`를 옵셔널로 surfacing.
- **검증**: 단위 테스트로 5xx 응답에 `traceId` 존재. e2e 한 케이스에서 toast/error component에 짧은 id 노출 확인.
- **예상 소요**: 0.5d
- **선행 조건**: 없음

---

# Phase 3: 프런트엔드 리팩터 (2~4주, P1)

## TASK-040: `host-notifications-page.tsx` 타입 중복 제거

- **목표**: `notifications-contracts.ts`/`host-contracts.ts`의 SoT 사용.
- **파일**:
  - `front/features/host/ui/host-notifications-page.tsx:12-19`
  - `front/features/notifications/api/notifications-contracts.ts` (신규 export 보강)
  - `front/features/host/api/host-contracts.ts` (없으면 생성)
- **구현 방법**: 페이지 파일에서 `NotificationEventOutboxStatus`, `NotificationDeliveryStatus`, `NotificationChannel`, `HostNotificationEventType` 로컬 선언을 삭제하고 `import { ... } from "@/features/notifications/api/notifications-contracts"`로 교체.
- **검증**: `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build` 통과.
- **예상 소요**: 0.25d
- **선행 조건**: 없음

## TASK-041: `archive-page.tsx` 분해 (1074 LOC → 5 파일)

- **목표**: desktop/mobile 변형 분리, 리스트/탭/Row 컴포넌트 추출.
- **파일** (분할 후):
  - `front/features/archive/ui/archive-page.tsx` — route entry, data loading, 변형 선택만 (≤ 150 LOC)
  - `front/features/archive/ui/archive-desktop.tsx`
  - `front/features/archive/ui/archive-mobile.tsx`
  - `front/features/archive/ui/archive-tab-list.tsx`
  - `front/features/archive/ui/archive-report-row.tsx`
- **컴포넌트 시그니처**:
  ```ts
  type ArchiveViewProps = {
    initial: ArchiveInitialPayload;
    activeTab: ArchiveTabKey;
    onTabChange: (tab: ArchiveTabKey) => void;
    onLoadMore: () => Promise<void>;
  };
  export function ArchiveDesktop(props: ArchiveViewProps): JSX.Element;
  export function ArchiveMobile(props: ArchiveViewProps): JSX.Element;

  type ArchiveTabListProps = {
    tabs: ArchiveTabDescriptor[];
    activeKey: ArchiveTabKey;
    onChange: (next: ArchiveTabKey) => void;
  };
  ```
- **검증**: 기존 unit test (`archive-page.test.tsx`) 그대로 통과. e2e `multi-club-flow`/`google-auth-viewer` 통과.
- **예상 소요**: 1.5d
- **선행 조건**: 없음

## TASK-042: `host-session-editor.tsx` form/effects split (857 LOC)

- **목표**: 1차 entry에 form orchestration + side-effect가 함께 있는 구조 분리.
- **파일** (분할 후):
  - `front/features/host/ui/host-session-editor.tsx` — route entry + composition (≤ 200 LOC)
  - `front/features/host/ui/host-session-editor-form.tsx` — form state, validation, submit
  - `front/features/host/ui/host-session-editor-effects.tsx` — `useNavigate`, `scopedHostRedirectHref` side effects
- **컴포넌트 시그니처**:
  ```ts
  type HostSessionEditorFormProps = {
    initial: HostSessionEditorInitial;
    onSubmit: (snapshot: HostSessionEditorSnapshot) => Promise<HostSessionDetailResponse>;
  };
  export function HostSessionEditorForm(props: HostSessionEditorFormProps): JSX.Element;

  type HostSessionEditorEffectsProps = {
    detail: HostSessionDetailResponse | null;
    pendingTransition: HostSessionTransition | null;
  };
  export function HostSessionEditorEffects(props: HostSessionEditorEffectsProps): null;
  ```
- **검증**: `host-session-editor.test.tsx` 통과. e2e `member-lifecycle`(host write flow) 통과.
- **예상 소요**: 1.5d
- **선행 조건**: TASK-040 (타입 SoT 정리 후)

## TASK-043: `host-notifications-page.tsx` ledger 탭 분해 (856 LOC)

- **목표**: events / deliveries / audit 3 ledger를 분리.
- **파일** (분할 후):
  - `front/features/host/ui/host-notifications-page.tsx` — tab 라우팅, summary 카드 (≤ 200 LOC)
  - `front/features/host/ui/host-notifications-ledger-events.tsx`
  - `front/features/host/ui/host-notifications-ledger-deliveries.tsx`
  - `front/features/host/ui/host-notifications-test-mail.tsx`
- **컴포넌트 시그니처**:
  ```ts
  type LedgerEventsProps = {
    items: HostNotificationEventItem[];
    onRetry: (id: string) => Promise<void>;
    onRestore: (id: string) => Promise<void>;
  };
  export function HostNotificationsLedgerEvents(props: LedgerEventsProps): JSX.Element;

  type TestMailProps = {
    audit: NotificationTestMailAuditItem[];
    onSend: (request: SendNotificationTestMailRequest) => Promise<void>;
  };
  export function HostNotificationsTestMail(props: TestMailProps): JSX.Element;
  ```
- **검증**: 기존 host-notifications 테스트 통과.
- **예상 소요**: 1.5d
- **선행 조건**: TASK-040

## TASK-044: `current-session-mobile.tsx` & `current-session-page.tsx` layout primitive

- **목표**: 같은 데이터를 desktop/mobile로 그릴 때 layout primitive 도입.
- **파일** (분할 후):
  - `front/features/current-session/ui/current-session-layout.tsx` — slot 기반 primitive
  - `front/features/current-session/ui/current-session-page.tsx` — desktop variant (≤ 250 LOC)
  - `front/features/current-session/ui/current-session-mobile.tsx` — mobile variant (≤ 250 LOC)
- **컴포넌트 시그니처**:
  ```ts
  type CurrentSessionLayoutProps = {
    header: ReactNode;
    primary: ReactNode;
    secondary: ReactNode;
    footerActions?: ReactNode;
    variant: "desktop" | "mobile";
  };
  export function CurrentSessionLayout(props: CurrentSessionLayoutProps): JSX.Element;
  ```
- **검증**: e2e `responsive-navigation-chrome` 통과. unit `current-session-page.test.tsx` 통과.
- **예상 소요**: 1d
- **선행 조건**: 없음

## TASK-045: `member-session-detail-page.tsx` 분해 (776 LOC)

- **목표**: review/feedback/history section을 sub-component로 분리.
- **파일** (분할 후):
  - `front/features/archive/ui/member-session-detail-page.tsx` — route entry (≤ 200 LOC)
  - `front/features/archive/ui/member-session-detail-review.tsx`
  - `front/features/archive/ui/member-session-detail-feedback.tsx`
  - `front/features/archive/ui/member-session-detail-history.tsx`
- **컴포넌트 시그니처**:
  ```ts
  type SectionProps<T> = { data: T; locked?: boolean };
  export function MemberSessionDetailReview(props: SectionProps<ReviewSlice>): JSX.Element;
  export function MemberSessionDetailFeedback(props: SectionProps<FeedbackSlice>): JSX.Element;
  export function MemberSessionDetailHistory(props: SectionProps<HistorySlice>): JSX.Element;
  ```
- **검증**: `member-session-detail-page.test.tsx` 통과.
- **예상 소요**: 1d
- **선행 조건**: TASK-041 (archive 정렬 후)

## TASK-046: `globals.css` page-section split

- **목표**: 1620 LOC 단일 파일을 feature/page section별로 분리(중간 단계).
- **파일** (분할 후):
  - `front/src/styles/base.css` — reset, typography, root variables import
  - `front/src/styles/layout.css` — app shell, navigation
  - `front/src/styles/forms.css`
  - `front/src/styles/utilities.css`
  - `front/src/styles/index.css` — 위 4개를 `@import`
- **구현 방법**: section comment 기준으로 mechanical split. 모듈화(CSS Module / vanilla-extract)는 별도 ADR(TASK-046a)로 결정.
- **검증**: `pnpm --dir front build` 통과 + 시각 회귀(`pnpm --dir front test:e2e --grep responsive-navigation`).
- **예상 소요**: 1d
- **선행 조건**: 없음

## TASK-047: `mobile.css` page-section split

- **목표**: `front/shared/styles/mobile.css`(1485) 동일 split.
- **파일**:
  - `front/shared/styles/mobile/base.css`
  - `front/shared/styles/mobile/host.css`
  - `front/shared/styles/mobile/archive.css`
  - `front/shared/styles/mobile/current-session.css`
  - `front/shared/styles/mobile/index.css`
- **검증**: e2e `responsive-navigation-chrome` 통과.
- **예상 소요**: 0.75d
- **선행 조건**: TASK-046 (정책 정착 후)

## TASK-048: `JsonResponse<T>` typed-response helper 추출

- **목표**: ad-hoc cross-cast 제거.
- **파일**: 신규 `front/shared/api/typed-response.ts`, 사용처 (`host-session-editor.tsx:74` 등) 일괄 교체
- **구현 방법**:
  ```ts
  export type JsonResponse<T> = Response & { json(): Promise<T> };
  export function asJsonResponse<T>(response: Response): JsonResponse<T> {
    return response as JsonResponse<T>;
  }
  ```
- **검증**: lint/test 통과. `frontend-boundaries.test.ts` 회귀 없음.
- **예상 소요**: 0.25d
- **선행 조건**: 없음

## TASK-049: react-router v7 `hydrateFallbackElement` 일관화

- **목표**: 보호 route 모두에 fallback 명시.
- **파일**: `front/src/app/router.tsx`
- **구현 방법**: `/admin`, `/app/pending`, `/clubs/:clubSlug/app/pending` 등에 `hydrateFallbackElement={<RouteHydrateFallback />}` 추가. 공용 컴포넌트는 `front/shared/ui/route-hydrate-fallback.tsx`에 정의.
- **검증**: e2e route 진입 시 깜빡임 회귀 없음.
- **예상 소요**: 0.25d
- **선행 조건**: 없음

## TASK-050: 라우트별 lazy loading 도입

- **목표**: 초기 LCP 개선, 청크 사이즈 분산.
- **파일**: `front/src/app/router.tsx`
- **구현 방법**: archive/host/notifications 등 무거운 페이지를 `lazy(() => import("..."))` + `Suspense fallback`로 감싸기. `vite.config.ts`의 `chunkSizeWarningLimit`은 600 → 350으로 강화.
- **검증**: `pnpm --dir front build` 후 `dist/assets/*.js` 단일 청크 ≤ 350 KB. 초기 진입 e2e wall-time 측정 (Playwright trace).
- **예상 소요**: 0.5d
- **선행 조건**: TASK-041, TASK-042, TASK-043

## TASK-051: `@cloudflare/workers-types` 적용

- **목표**: `PagesFunction<Env>` 자체 정의 대신 공식 타입 사용.
- **파일**: `front/package.json` (devDependency 추가), `front/functions/api/bff/[[path]].ts`, `front/functions/_shared/proxy.ts`
- **구현 방법**: `pnpm --dir front add -D @cloudflare/workers-types@^4.20240500.0` 후 `tsconfig.json`의 `types`에 `"@cloudflare/workers-types"` 추가, 자체 정의 타입 제거.
- **검증**: `pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build` 통과.
- **예상 소요**: 0.25d
- **선행 조건**: 없음

---

# Phase 4: DX 개선 (지속, P2)

## TASK-060: `Justfile` 도입 — `just check` / `just e2e` / `just release-check`

- **목표**: 단일 명령으로 `lint+test+build+arch` 실행.
- **파일**: 신규 `/Justfile`
- **구현 방법**:
  ```just
  set shell := ["bash", "-cu"]

  default: help

  help:
      @just --list

  check: front-lint front-test front-build server-test

  front-lint:
      pnpm --dir front lint
  front-test:
      pnpm --dir front test
  front-build:
      pnpm --dir front build
  server-test:
      ./server/gradlew -p server clean test

  e2e:
      pnpm --dir front test:e2e

  release-check:
      ./scripts/build-public-release-candidate.sh
      ./scripts/public-release-check.sh .tmp/public-release-candidate
  ```
- **검증**: macOS/Linux에서 `just check` 통과. README "로컬 실행 요약" section 갱신.
- **예상 소요**: 0.5d
- **선행 조건**: 없음

## TASK-061: `.editorconfig` 추가

- **목표**: cross-IDE 일관성.
- **파일**: 신규 `/.editorconfig`
- **구현 방법**:
  ```
  root = true

  [*]
  charset = utf-8
  end_of_line = lf
  insert_final_newline = true
  trim_trailing_whitespace = true

  [*.{ts,tsx,js,jsx,json,css,md,yml,yaml}]
  indent_style = space
  indent_size = 2

  [*.{kt,kts}]
  indent_style = space
  indent_size = 4

  [Makefile]
  indent_style = tab
  ```
- **검증**: 기존 파일 line ending/indent 회귀 없음(`git status` clean).
- **예상 소요**: 0.1d
- **선행 조건**: 없음

## TASK-062: `docs/development/quickstart.md` 신설 + README "5분 만에 켜기"

- **목표**: 신규 contributor onboarding 시간 단축.
- **파일**: 신규 `docs/development/quickstart.md`, `README.md` 상단 section 갱신
- **구현 방법**: `git clone → docker compose up → pnpm install → pnpm dev → ./server/gradlew bootRun`을 5단계로 나열. 각 단계별 `just` 별칭과 환경변수 placeholder 1개씩 명시.
- **검증**: 새 머신에서 직접 따라해보고 5분 안에 health check 응답 확인.
- **예상 소요**: 0.5d
- **선행 조건**: TASK-060

## TASK-063: 문서 링크 자동 검증 step 추가

- **목표**: README의 docs 링크 25개+ 깨짐 방지.
- **파일**: `.github/workflows/ci.yml`
- **구현 방법**: docs 변경 path-filter로 `lychee-action`을 추가.
  ```yaml
  docs-links:
    name: Docs link check
    runs-on: ubuntu-latest
    if: contains(github.event.pull_request.changed_files, '.md') || github.event_name == 'push'
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
      - uses: lycheeverse/lychee-action@v2.6.1
        with:
          args: --no-progress --offline 'README.md' 'docs/**/*.md' 'AGENTS.md'
          fail: true
  ```
- **검증**: 의도적 broken link PR로 fail 확인.
- **예상 소요**: 0.25d
- **선행 조건**: 없음

## TASK-064: `scripts/run-server-dev.sh` 도입

- **목표**: bootRun 환경변수 묶음 onboarding curve 감소.
- **파일**: 신규 `scripts/run-server-dev.sh`
- **구현 방법**: `READMATES_BFF_SECRET=<shared-bff-secret>`(`.gitleaks.toml` allowlist), MySQL/Redis URL placeholder를 한 곳에 모아 `./server/gradlew -p server bootRun`을 실행. set -euo pipefail.
- **검증**: 스크립트 실행 후 `/internal/health` 200.
- **예상 소요**: 0.25d
- **선행 조건**: 없음

## TASK-065: CHANGELOG 자동화 (release-please)

- **목표**: `CHANGELOG.md` 수기 관리 부담 제거.
- **파일**: `.github/workflows/release-please.yml` (신규), `release-please-config.json`, `.release-please-manifest.json`
- **구현 방법**:
  ```yaml
  name: release-please
  on:
    push:
      branches: [main]
  permissions:
    contents: write
    pull-requests: write
  jobs:
    release:
      runs-on: ubuntu-latest
      steps:
        - uses: googleapis/release-please-action@v4
          with:
            release-type: simple
            config-file: release-please-config.json
            manifest-file: .release-please-manifest.json
  ```
  Conventional Commits 룰을 `docs/development/release-management.md`에 1단락 추가.
- **검증**: 시범 PR 머지 후 release PR 자동 생성.
- **예상 소요**: 0.5d
- **선행 조건**: 없음

---

# Phase 5: 중장기 (1~3개월, P2~P3)

## TASK-070: OpenAPI emission + frontend codegen

- **목표**: contract drift를 컴파일 단계에서 차단.
- **파일**:
  - `server/build.gradle.kts` — `springdoc-openapi-starter-webmvc-ui` 의존성 + `bootRun` 시 `/v3/api-docs` 노출
  - 신규 `scripts/regen-openapi.sh` — 서버 임시 기동 후 OpenAPI JSON 추출
  - `front/package.json` — `openapi-typescript` devDependency
  - `front/shared/api/generated/` (생성물)
  - `front/tests/unit/api-contract-fixtures.test.ts` — codegen 결과 비교로 전환
- **구현 방법**:
  1. server에 springdoc 추가 + `OpenApiConfig.kt`로 메타데이터 정의.
  2. `scripts/regen-openapi.sh`이 server를 `--profile=test`로 boot 후 spec 추출.
  3. CI에 "openapi-up-to-date" 검증 job 추가(`scripts/regen-openapi.sh` 후 git diff 비어 있는지).
- **검증**: 서버 controller 시그니처 변경 시 codegen diff 발생 → CI fail.
- **예상 소요**: 3d
- **선행 조건**: TASK-025, TASK-028 (백엔드 슬라이스 정리 후)

## TASK-071: BFF multi-secret rotation

- **목표**: zero-downtime secret rotation.
- **파일**:
  - `server/.../security/BffSecretFilter.kt`
  - `front/functions/api/bff/[[path]].ts`, `front/functions/_shared/proxy.ts`
  - `application.yml`에 `readmates.security.bff.secrets: ${READMATES_BFF_SECRETS:}`
- **구현 방법**: 현재 string → `Set<String>`으로 변경하고 `MessageDigest.isEqual`을 secret별로 시도, 어느 하나만 매치하면 통과. BFF는 우선 primary secret을 보내고 rotation period에는 secondary로 폴백 시도.
  ```kotlin
  class BffSecretFilter(secrets: List<String>) : OncePerRequestFilter() {
      private val expected: List<ByteArray> = secrets.map { it.toByteArray(StandardCharsets.UTF_8) }
      private fun matches(provided: String): Boolean = expected.any { MessageDigest.isEqual(it, provided.toByteArray(StandardCharsets.UTF_8)) }
  }
  ```
- **검증**: 단위 테스트로 다중 secret 매치 / mismatch 케이스 검증. staging에서 rotation drill.
- **예상 소요**: 1d
- **선행 조건**: TASK-016

## TASK-072: e2e 브라우저 매트릭스 + sharding

- **목표**: cross-browser regression coverage + wall-time 단축.
- **파일**: `front/playwright.config.ts`, `.github/workflows/ci.yml`
- **구현 방법**:
  ```ts
  // playwright.config.ts
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
  ];
  ```
  CI는 default branch에서만 multi-project. PR은 chromium만.
  ```yaml
  e2e:
    strategy:
      matrix:
        shard: [1/3, 2/3, 3/3]
    steps:
      - run: pnpm test:e2e -- --shard ${{ matrix.shard }} --project=chromium
  ```
- **검증**: CI wall time 절반 이하로 감소.
- **예상 소요**: 1.5d
- **선행 조건**: 없음

## TASK-073: PIT mutation testing 도입 (notification 영역 한정)

- **목표**: pure helper의 dead branch 검출.
- **파일**: `server/build.gradle.kts`, `server/src/main/kotlin/com/readmates/notification/**`
- **구현 방법**: `info.solidsoft.pitest` Gradle plugin 추가, `targetClasses`를 `com.readmates.notification.application.model.*`로 제한. PIT 스코어 70% 이상 목표.
- **검증**: `./server/gradlew -p server pitest` 보고서가 `build/reports/pitest`에 생성.
- **예상 소요**: 1d
- **선행 조건**: TASK-028

## TASK-074: Server multi-module Gradle ADR

- **목표**: 단일 모듈 유지 vs 분할 결정 기록.
- **파일**: `docs/development/technical-decisions.md` 항목 추가
- **구현 방법**: 분할 시 `server-shared`, `server-feature-{notification,session,auth}`, `server-app` 후보 그래프와 ArchUnit 룰 보강 비용을 비교. 결정 결과만 기록(분할 자체는 후속 task로 미룰 수 있음).
- **검증**: 결정 PR review.
- **예상 소요**: 0.5d
- **선행 조건**: TASK-028

## TASK-075: Notification kafka relay/consumer separate worker ADR

- **목표**: bootRun과 worker process 분리 여부 결정.
- **파일**: `docs/development/technical-decisions.md` 항목 추가
- **구현 방법**: 단일 process로 유지하는 옵션 + Spring Boot module 분리 옵션의 운영 차이 비교. 결정 보존.
- **검증**: 결정 PR review.
- **예상 소요**: 0.5d
- **선행 조건**: TASK-028

## TASK-076: GHCR untagged retention cleanup

- **목표**: 이미지 stockpile 정리.
- **파일**: 신규 `.github/workflows/ghcr-cleanup.yml`
- **구현 방법**:
  ```yaml
  name: GHCR cleanup
  on:
    schedule:
      - cron: "0 5 * * 0"
    workflow_dispatch:
  jobs:
    cleanup:
      runs-on: ubuntu-latest
      permissions:
        packages: write
      steps:
        - uses: actions/delete-package-versions@v5
          with:
            package-name: readmates-server
            package-type: container
            min-versions-to-keep: 10
            delete-only-untagged-versions: true
  ```
- **검증**: 첫 실행 후 GHCR Packages 페이지 확인.
- **예상 소요**: 0.25d
- **선행 조건**: 없음

---

## 의존성 그래프

```
Phase 0
  TASK-001 (history scrub) ──── 모든 public release 의존

Phase 1 (대부분 독립)
  TASK-010 (pnpm audit)
  TASK-011a (gradle lock) ──► TASK-011 (OSV)
  TASK-012 (artifact upload)
  TASK-013 (CODEOWNERS)
  TASK-014 (image SBOM/Trivy)
  TASK-015 (Dockerfile rename)
  TASK-016 (BFF redirect guard) ──► TASK-071 (multi-secret rotation, Phase 5)
  TASK-017 (IP hash)

Phase 2
  TASK-020 (select * 제거)            [독립]
  TASK-021 (MemberAccountAdapter split) ──► TASK-022, TASK-023, TASK-024 (동일 패턴 확산)
  TASK-022 (NotesFeed split) ──► TASK-022a (correlated subquery rewrite)
  TASK-025 (HostSessionCommandService split) ──► TASK-027 (isolation 명시)
  TASK-028 (notification slice) ──► TASK-070, TASK-073, TASK-074, TASK-075
  TASK-026 (CSRF 매처 외부화)         [독립]
  TASK-029 (Spring Boot 4 sweep)       [독립]
  TASK-030 (Flyway gap doc)            [독립]
  TASK-031 (traceId)                   [독립]

Phase 3
  TASK-040 (타입 SoT) ──► TASK-042, TASK-043 (host 컴포넌트 분해)
  TASK-041 (archive 분해) ──► TASK-045 (member-session-detail) ──► TASK-050 (lazy loading)
  TASK-042, TASK-043 ──► TASK-050
  TASK-044 (current-session layout)
  TASK-046 (globals.css split) ──► TASK-047 (mobile.css split)
  TASK-048 (typed-response)
  TASK-049 (router fallback)
  TASK-051 (workers-types)

Phase 4
  TASK-060 (Justfile) ──► TASK-062 (quickstart)
  TASK-061 (.editorconfig)
  TASK-063 (link check)
  TASK-064 (run-server-dev.sh)
  TASK-065 (release-please)

Phase 5
  TASK-070 (OpenAPI codegen) ◄── TASK-025, TASK-028
  TASK-071 (multi-secret) ◄── TASK-016
  TASK-072 (e2e matrix)
  TASK-073 (PIT) ◄── TASK-028
  TASK-074, TASK-075 (ADR) ◄── TASK-028
  TASK-076 (GHCR cleanup)
```

권장 병렬화 채널 (3 트랙):
- **트랙 A (보안/CI)**: TASK-001 → TASK-010 → TASK-011a → TASK-011 → TASK-012 → TASK-013 → TASK-014 → TASK-016 → TASK-017
- **트랙 B (백엔드)**: TASK-020 → TASK-021 → TASK-022 → TASK-023 → TASK-024 → TASK-026 → TASK-025 → TASK-027 → TASK-028 → TASK-029 → TASK-030 → TASK-031
- **트랙 C (프런트/DX)**: TASK-040 → TASK-041 → TASK-042 → TASK-043 → TASK-044 → TASK-045 → TASK-046 → TASK-047 → TASK-048 → TASK-049 → TASK-050 → TASK-051 → TASK-060 → TASK-061 → TASK-062 → TASK-063 → TASK-064 → TASK-065
- **Phase 5는 트랙 B/C 완료 후 순차**.

---

## 진행 체크리스트

### Phase 0
- [ ] TASK-001 공개 저장소 분리 또는 history 정비

### Phase 1
- [ ] TASK-010 pnpm audit CI 게이트
- [ ] TASK-011a Gradle dependency lock
- [ ] TASK-011 OSV Scanner JVM 게이트
- [ ] TASK-012 CI test artifact upload
- [ ] TASK-013 CODEOWNERS 보안 surface 확장
- [ ] TASK-014 GHCR SBOM + Trivy
- [ ] TASK-015 Dockerfile 이중화 정리
- [ ] TASK-016 BFF redirect Location 가드
- [ ] TASK-017 BFF/RateLimit IP hash 일관화

### Phase 2
- [ ] TASK-020 `JdbcFeedbackDocumentStoreAdapter` `select *` 제거
- [ ] TASK-021 `JdbcMemberAccountAdapter` 분해
- [ ] TASK-022 `JdbcNotesFeedAdapter` 분해
- [ ] TASK-022a `loadNoteSessions` correlated subquery rewrite
- [ ] TASK-023 `JdbcHostInvitationStoreAdapter` 분해
- [ ] TASK-024 `JdbcMemberLifecycleStoreAdapter` 분해
- [ ] TASK-025 `HostSessionCommandService` 3-service split
- [ ] TASK-026 SecurityConfig CSRF 매처 외부화
- [ ] TASK-027 트랜잭션 isolation 명시
- [ ] TASK-028 Notification slice 응집도 분리 (PR-A/B/C)
- [ ] TASK-029 Spring Boot 4.0.0 deprecated API sweep
- [ ] TASK-030 Flyway V2~V8 누락 문서화
- [ ] TASK-031 `ApiErrorResponse.traceId` 도입

### Phase 3
- [ ] TASK-040 host-notifications 타입 중복 제거
- [ ] TASK-041 `archive-page.tsx` 분해
- [ ] TASK-042 `host-session-editor.tsx` form/effects split
- [ ] TASK-043 `host-notifications-page.tsx` ledger 분해
- [ ] TASK-044 `current-session-layout` primitive
- [ ] TASK-045 `member-session-detail-page.tsx` 분해
- [ ] TASK-046 `globals.css` page-section split
- [ ] TASK-047 `mobile.css` split
- [ ] TASK-048 `typed-response` helper
- [ ] TASK-049 router `hydrateFallbackElement` 일관화
- [ ] TASK-050 라우트별 lazy loading
- [ ] TASK-051 `@cloudflare/workers-types` 적용

### Phase 4
- [ ] TASK-060 `Justfile` 도입
- [ ] TASK-061 `.editorconfig`
- [ ] TASK-062 `quickstart.md` + README 갱신
- [ ] TASK-063 docs link check CI
- [ ] TASK-064 `run-server-dev.sh`
- [ ] TASK-065 release-please

### Phase 5
- [ ] TASK-070 OpenAPI emission + frontend codegen
- [ ] TASK-071 BFF multi-secret rotation
- [ ] TASK-072 e2e 브라우저 매트릭스 + sharding
- [ ] TASK-073 PIT mutation testing
- [ ] TASK-074 Server multi-module ADR
- [ ] TASK-075 Notification worker process ADR
- [ ] TASK-076 GHCR untagged retention cleanup
