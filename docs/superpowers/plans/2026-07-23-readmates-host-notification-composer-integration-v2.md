# ReadMates Host Notification Composer Integration v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 최신 세션 기록 revision 워크플로를 보존하면서 콘텐츠 저장과 호스트 작성 알림 발송을 분리하고, 공통 manual composer와 opt-in 리마인더 정책을 안전하게 통합한다.

**Architecture:** 최신 `main`을 기준으로 기존 CPE 브랜치의 독립 기능만 참고해 이식한다. 세션 기록 apply 재시도는 notification decision ledger에서 `session_record_apply_receipts`로 분리하고, 콘텐츠 mutation은 composer context만 반환하며 manual options → preview → confirm만 outbox를 생성한다. 기존 `V39`~`V41`과 과거 host-action ledger는 변경하지 않고 `V42`에서 additive schema를 제공한다.

**Tech Stack:** Kotlin, Spring Boot, JDBC, MySQL 8, Flyway, React 19, React Router 7, TanStack Query 5, TypeScript, Vitest, Playwright, pnpm 11.13.1

## Global Constraints

- 승인 설계 `docs/superpowers/specs/2026-07-23-readmates-host-notification-composer-integration-v2-design.md`와 현재 코드·테스트·migration이 source of truth다.
- 실행 기준 branch는 최신 로컬 `main`에서 만든 `codex/notification-composer-integration-v2`다. 기존 `codex/cpe-1d9d77a47331471d` branch와 worktree는 비교 근거로 보존한다.
- 기존 CPE commit은 파일·테스트 참고 자료다. 전체 merge, 전체 cherry-pick, 충돌 난 patch의 기계적 적용을 금지한다.
- 콘텐츠 mutation은 notification outbox, 이메일, 인앱 알림, 합성 `SKIP`/`SEND` decision을 생성하지 않는다.
- 호스트가 작성한 `NEXT_BOOK_PUBLISHED`, `FEEDBACK_DOCUMENT_PUBLISHED`, `SESSION_RECORD_UPDATED`는 `POST /api/host/notifications/manual` confirm만 outbox를 생성한다.
- 작성기 닫기, `Escape`, 뒤로 가기, “이번에는 보내지 않기”는 notification mutation을 호출하지 않는다.
- `SESSION_REMINDER_DUE` scheduler는 별도 자동 생산자이며 policy row가 있고 `session_reminder_enabled = true`인 클럽만 처리한다. row 없음과 신규 row의 기본값은 `false`다.
- 다음 책 기본 audience는 `ALL_ACTIVE_MEMBERS`, 피드백과 세션 기록 기본 audience는 `CONFIRMED_ATTENDEES`, 기본 channel은 `BOTH`다.
- `SELECTED_MEMBERS`는 현재 club의 중복 없는 `ACTIVE` membership 한 명 이상만 허용한다.
- 서버는 preview와 confirm 모두에서 host 권한, club/session 범위, 활성 membership, content revision, 수신 설정을 재검증한다.
- 기존 `V39__host_session_record_revision_and_notification_confirmation.sql`, `V40`, `V41`을 수정하지 않는다. 새 production migration은 `V42__host_notification_composer.sql` 하나다.
- 기존 `host_action_notification_previews`와 `host_action_notification_decisions`는 historical read-only 호환을 유지한다. 새 콘텐츠 apply는 해당 테이블에 쓰지 않는다.
- `readmates.host-action-confirmation.required`는 기존 session-record staging/capability 노출에만 영향을 주고 알림 발송을 제어하지 않는다.
- 프런트 `route`가 query/mutation과 workflow state를 소유하고, `ui`는 props/callback만 사용한다.
- 신규 프런트 단위 테스트는 source 옆에 co-locate한다. 기존 fixture 공유 테스트는 `front/tests/unit`에 유지한다.
- root `package.json`의 `pnpm@11.13.1`을 Corepack으로 실행한다.
- 로컬 task commit만 허용된다. push, PR, tag, deploy, 공유 DB migration은 별도 사용자 승인 없이는 수행하지 않는다.
- 각 task는 RED → 최소 구현 → focused GREEN → 로컬 commit 순서로 완료한다.

## Scope And Dependency

이 계획은 하나의 vertical slice지만 리뷰 가능한 세 묶음으로 구성된다.

1. Task 1~6: 서버·migration·피드백 preview 기반
2. Task 7~11: 프런트 계약·공통 composer·최신 route 접합
3. Task 12: 통합 E2E·active docs·release readiness

Task 순서는 고정한다. Task 4의 policy/scheduler는 기능적으로 독립적이지만 Task 1의 `V42`를 공유하므로 같은 DB나 Testcontainers를 병렬 실행하지 않는다. Task 7 이후 프런트 작업도 같은 파일을 공유하므로 순차 실행한다.

## Acceptance Matrix Selection

- **Actor or authorization:** member/host와 다른 club의 member ID를 구분해야 하므로 server denied-path와 E2E를 실행한다.
- **Club context:** scoped route와 다른 club recipient 차단이 핵심이므로 controller/service/persistence test를 실행한다.
- **Session lifecycle:** DRAFT/OPEN/CLOSED/PUBLISHED에 따라 template과 host preview가 달라지므로 상태별 test를 실행한다.
- **Publication visibility:** 다음 책 최초 공개와 session record apply가 composer context를 만들기 때문에 visibility/cache test를 실행한다.
- **Persistence or migration:** `V42`, receipt replay, policy upsert, manual dispatch revision이 있으므로 Flyway와 full integration lane을 실행한다.
- **Async, cache, or provider:** outbox 중복, scheduler dedupe, confirm retry가 있으므로 persistence failure/retry test를 실행한다.
- **UI or runtime state:** loading, empty, stale, expired, retry, desktop/mobile, keyboard close를 component와 E2E로 검증한다.
- **BFF or OAuth 제외:** 새 BFF route, trusted header, cookie, OAuth flow를 추가하지 않는다. 기존 same-origin `/api/**` proxy를 그대로 사용한다.
- **Cursor collection:** member picker가 cursor pagination을 사용하므로 첫/다음/마지막 page 누적 test만 선택한다. 다른 ledger pagination은 변경하지 않는다.

## Requirement Traceability

| 승인 요구사항 | 구현 task | 최종 증거 |
| --- | --- | --- |
| 콘텐츠 mutation 무발송 | Task 2, 3, 9, 10 | DB count assertion, next-book/record-apply E2E |
| latest draft/revision/history 보존 | Task 1, 2, 10 | sessionrecord unit/integration, revision E2E |
| response-loss apply replay | Task 1, 2 | receipt persistence test, same request ID replay test |
| manual options → preview → confirm 단일 발송 | Task 5, 7, 8 | service/persistence test, manual notification E2E |
| 기본 audience/channel | Task 5, 7, 8 | model/service/component test |
| `SELECTED_MEMBERS` 권한·활성 상태 | Task 5, 7, 8, 12 | foreign/inactive rejection, picker/component/E2E |
| stale/expired/resend/idempotency | Task 5, 8, 12 | service/JDBC/component/E2E |
| JSON/AI commit은 draft-only | Task 10, 12 | route/unit와 AI E2E outbox count |
| club reminder 기본 OFF/opt-in | Task 1, 4, 11 | policy/scheduler/JDBC/UI test |
| 열린 세션 host feedback preview | Task 6, 11 | server authorization test, route/E2E |
| close/Escape/skip 무발송 | Task 8, 9, 10, 12 | dialog/component/E2E confirm call count |
| current docs와 release safety | Task 12 | CHANGELOG/architecture/deploy review, public-release/gitleaks |

## File Structure

- `server/src/main/resources/db/mysql/migration/V42__host_notification_composer.sql`: apply receipt, policy, manual dispatch revision/audience schema만 소유한다.
- `server/src/main/kotlin/com/readmates/sessionrecord/application/model/SessionRecordModels.kt`: content-only apply request/preview/result/receipt model을 소유한다.
- `server/src/main/kotlin/com/readmates/sessionrecord/application/port/out/SessionRecordStorePort.kt`: apply receipt 조회·저장 port를 소유한다.
- `server/src/main/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcSessionRecordAdapter.kt`: revision과 receipt의 같은 transaction JDBC를 소유한다.
- `server/src/main/kotlin/com/readmates/notification/application/model/ManualNotificationContentRevision.kt`: event별 64자 content revision 계산만 소유한다.
- `server/src/main/kotlin/com/readmates/notification/application/model/NotificationPolicyModels.kt`: club reminder policy model만 소유한다.
- `server/src/main/kotlin/com/readmates/notification/application/service/HostManualNotificationService.kt`: selection, revision, duplicate/resend, confirm orchestration을 소유한다.
- `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapter.kt`: target 계산, preview lock, dispatch/outbox 원자 저장을 소유한다.
- `server/src/main/kotlin/com/readmates/notification/adapter/in/scheduler/NotificationReminderScheduler.kt`: `Asia/Seoul` 기준 내일 날짜 계산과 use case 호출만 소유한다.
- `front/features/host/model/host-notification-composer-model.ts`: recipient mode와 API selection 변환만 소유한다.
- `front/features/host/route/host-notification-composer-controller.tsx`: options pagination, preview/confirm, composer 상태를 소유한다.
- `front/features/host/ui/notifications/host-notification-composer.tsx`: 작성기 presentation만 소유한다.
- `front/features/host/ui/notifications/host-notification-composer-dialog.tsx`: dialog/bottom-sheet 접근성과 닫기 동작만 소유한다.
- `front/features/host/ui/notifications/notification-recipient-picker.tsx`: 검색·cursor pagination·선택 UI만 소유한다.

## Execution Stop Conditions

- `V39`~`V41` 수정이 필요해지면 구현을 중단하고 migration 설계를 다시 검토한다.
- 콘텐츠 저장/apply test에서 outbox 또는 합성 host-action decision이 한 건이라도 생기면 다음 task로 진행하지 않는다.
- 같은 `applyRequestId` 또는 manual confirm retry가 중복 revision/outbox를 만들면 해당 task commit을 되돌리고 원인을 고친다.
- 다른 club, inactive membership, 중복 selected membership이 recipient에 포함되면 merge/release 검증으로 진행하지 않는다.
- JSON/AI draft commit에서 composer 또는 outbox가 생기면 route/server 경계를 다시 수정한다.
- 기존 test 삭제, assertion 완화, architecture baseline/exception 추가만으로 gate를 통과시키지 않는다.
- public-release 또는 private-data scan이 실패하면 finding을 제거하기 전 commit/push/deploy하지 않는다.
- rollback은 해당 task의 독립 commit revert로만 수행한다. destructive reset, 기존 CPE branch/worktree 삭제, 공유 DB rollback은 하지 않는다.

---

### Task 1: V42 schema와 content-owned apply receipt 계약

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V42__host_notification_composer.sql`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/model/ManualNotificationContentRevision.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionrecord/application/model/SessionRecordModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionrecord/application/port/out/SessionRecordStorePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcSessionRecordAdapter.kt`
- Modify: `server/src/test/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcSessionRecordAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

**Interfaces:**
- Produces: `HostNotificationComposerContext`, `SessionRecordApplyReceipt`, `findCompletedApply(host, applyRequestId)`, `insertApplyReceipt(host, command, draftSha256, eventType, revision)`, `ManualNotificationContentRevision`.
- Consumes: existing `session_record_revisions`, `notification_manual_dispatches`, membership/session composite keys.

- [ ] **Step 1: receipt replay와 V42 contract test를 RED로 추가**

`JdbcSessionRecordAdapterTest`에 같은 `apply_request_id`로 저장한 receipt가 동일 revision을 반환하고 다른 club/host에서는 조회되지 않는 test를 추가한다. `MySqlFlywayMigrationTest`에는 V42 이후 다음 assertion을 추가한다.

```kotlin
assertThat(columns("session_record_apply_receipts"))
    .contains(
        "apply_request_id",
        "expected_draft_revision",
        "expected_live_revision",
        "draft_sha256",
        "composer_event_type",
        "revision_id",
    )
assertThat(columns("club_notification_policies"))
    .contains("club_id", "session_reminder_enabled", "updated_by_membership_id")
assertThat(columns("notification_manual_dispatches"))
    .contains("content_revision")
```

- [ ] **Step 2: RED test 실행**

Run:

```bash
./server/gradlew -p server unitTest --tests '*JdbcSessionRecordAdapterTest'
./server/gradlew -p server integrationTest --tests '*MySqlFlywayMigrationTest'
```

Expected: 새 model/port/table이 없어 compile 또는 schema assertion이 FAIL한다.

- [ ] **Step 3: V42를 한 파일로 작성**

```sql
create table session_record_apply_receipts (
  id char(36) not null,
  apply_request_id char(36) not null,
  club_id char(36) not null,
  session_id char(36) not null,
  host_membership_id char(36) not null,
  expected_draft_revision bigint not null,
  expected_live_revision bigint not null,
  draft_sha256 char(64) not null,
  composer_event_type varchar(60) not null,
  revision_id char(36) not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  unique key session_record_apply_receipts_request_uk (club_id, session_id, apply_request_id),
  unique key session_record_apply_receipts_revision_uk (revision_id),
  constraint session_record_apply_receipts_session_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint session_record_apply_receipts_host_fk foreign key (host_membership_id, club_id) references memberships(id, club_id),
  constraint session_record_apply_receipts_revision_fk foreign key (revision_id) references session_record_revisions(id),
  constraint session_record_apply_receipts_revisions_check check (
    expected_draft_revision > 0 and expected_live_revision >= 0
  ),
  constraint session_record_apply_receipts_hash_check check (length(draft_sha256) = 64),
  constraint session_record_apply_receipts_event_check check (
    composer_event_type in ('FEEDBACK_DOCUMENT_PUBLISHED', 'SESSION_RECORD_UPDATED')
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table club_notification_policies (
  club_id char(36) not null,
  session_reminder_enabled boolean not null default false,
  updated_by_membership_id char(36) not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  primary key (club_id),
  constraint club_notification_policies_club_fk foreign key (club_id) references clubs(id),
  constraint club_notification_policies_updated_by_fk
    foreign key (updated_by_membership_id, club_id) references memberships(id, club_id)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

alter table notification_manual_dispatches
  add column content_revision char(64) null after event_type,
  add key notification_manual_dispatches_revision_idx (
    club_id, session_id, event_type, content_revision, created_at
  );

alter table notification_manual_dispatches
  drop check notification_manual_dispatches_audience_check,
  add constraint notification_manual_dispatches_audience_check
    check (audience in (
      'ALL_ACTIVE_MEMBERS',
      'SESSION_PARTICIPANTS',
      'CONFIRMED_ATTENDEES',
      'SELECTED_MEMBERS'
    )),
  add constraint notification_manual_dispatches_content_revision_check
    check (content_revision is null or regexp_like(content_revision, '^[0-9a-f]{64}$', 'c'));
```

- [ ] **Step 4: content-only model을 정의**

```kotlin
data class HostNotificationComposerContext(
    val sessionId: UUID,
    val eventType: NotificationEventType,
    val contentRevision: String,
)

data class ApplySessionRecordCommand(
    val sessionId: UUID,
    val applyRequestId: UUID,
    val expectedDraftRevision: Long,
    val expectedLiveRevision: Long,
    val expectedDraftHash: String,
)

data class SessionRecordApplyPreview(
    val eventType: NotificationEventType,
    val expectedDraftHash: String,
)

data class SessionRecordApplyResult(
    val revisionId: UUID,
    val liveRevision: Long,
    val composer: HostNotificationComposerContext,
)

data class SessionRecordApplyReceipt(
    val applyRequestId: UUID,
    val expectedDraftRevision: Long,
    val expectedLiveRevision: Long,
    val draftSha256: String,
    val composerEventType: NotificationEventType,
    val revision: SessionRecordRevision,
)
```

`CompletedSessionRecordApply`, apply model의 `NotificationDecision`, `decisionId`, `eventId`, `previewId` 의존성을 제거한다. `SessionRecordError`에 `APPLY_REQUEST_ALREADY_USED`, `INVALID_APPLY_CONTRACT`를 추가한다.

- [ ] **Step 5: content revision helper를 구현**

```kotlin
object ManualNotificationContentRevision {
    fun nextBook(sessionId: UUID, sessionNumber: Int, bookTitle: String, visibility: String): String =
        Sha256.hex(listOf(sessionId, sessionNumber, bookTitle, visibility).joinToString("|"))

    fun sessionRecord(snapshotSha256: String): String {
        require(snapshotSha256.matches(Regex("^[0-9a-f]{64}$")))
        return snapshotSha256
    }

    fun feedbackDocument(sessionId: UUID, documentVersion: Int): String =
        Sha256.hex(listOf(sessionId, documentVersion).joinToString("|"))

    fun reminder(sessionId: UUID, date: LocalDate?): String =
        Sha256.hex(listOf(sessionId, date).joinToString("|"))
}
```

- [ ] **Step 6: store port와 JDBC receipt를 구현**

```kotlin
fun findCompletedApply(
    host: AuthenticatedClubActor,
    applyRequestId: UUID,
): SessionRecordApplyReceipt?

fun insertApplyReceipt(
    host: AuthenticatedClubActor,
    command: ApplySessionRecordCommand,
    draftSha256: String,
    composerEventType: NotificationEventType,
    revision: SessionRecordRevision,
): SessionRecordApplyReceipt
```

조회 SQL은 receipt → revision을 join하고 `club_id`, `session_id`, `host_membership_id`, `apply_request_id`를 모두 조건으로 사용한다. insert는 UUID primary key와 `revision.id`를 저장하며 duplicate key는 기존 receipt를 다시 조회해 service가 payload 일치 여부를 판정하게 한다.

- [ ] **Step 7: focused test를 GREEN으로 확인**

Run:

```bash
./server/gradlew -p server unitTest --tests '*JdbcSessionRecordAdapterTest'
./server/gradlew -p server integrationTest --tests '*MySqlFlywayMigrationTest'
```

Expected: PASS, Flyway가 V1~V42를 새 MySQL container에 순서대로 적용한다.

- [ ] **Step 8: Task 1 commit**

```bash
git add server/src/main/resources/db/mysql/migration/V42__host_notification_composer.sql \
  server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt \
  server/src/main/kotlin/com/readmates/notification/application/model/ManualNotificationContentRevision.kt \
  server/src/main/kotlin/com/readmates/sessionrecord/application/model/SessionRecordModels.kt \
  server/src/main/kotlin/com/readmates/sessionrecord/application/port/out/SessionRecordStorePort.kt \
  server/src/main/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcSessionRecordAdapter.kt \
  server/src/test/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcSessionRecordAdapterTest.kt \
  server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt
git commit -m "feat(sessionrecord): add content apply receipts"
```

### Task 2: 세션 기록 apply를 notification decision에서 분리

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/sessionrecord/application/service/SessionRecordApplyService.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionrecord/adapter/in/web/SessionRecordWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionrecord/adapter/in/web/SessionRecordErrorHandler.kt`
- Modify: `server/src/test/kotlin/com/readmates/sessionrecord/application/service/SessionRecordApplyServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/sessionrecord/api/HostSessionRecordControllerDbTest.kt`

**Interfaces:**
- Consumes: Task 1 `SessionRecordApplyReceipt`, `HostNotificationComposerContext`.
- Produces: content-only preview/apply API와 response-loss replay.

- [ ] **Step 1: content-only apply test를 RED로 교체**

다음 test 이름과 assertion을 사용한다.

```kotlin
@Test
fun `apply creates revision and receipt without notification decision or outbox`() {
    val fixture = Fixture(liveRevision = 3)

    val result = fixture.apply()

    assertEquals(4L, result.liveRevision)
    assertEquals(1, fixture.store.receipts.size)
    assertTrue(fixture.store.notificationDecisions.isEmpty())
    assertTrue(fixture.recorder.commands.isEmpty())
}

@Test
fun `same apply request id replays original revision after draft deletion`() {
    val fixture = Fixture(liveRevision = 3)
    val first = fixture.apply()
    val replay = fixture.apply()

    assertEquals(first, replay)
    assertEquals(1, fixture.validator.calls)
    assertEquals(1, fixture.store.receipts.size)
}

@Test
fun `reused apply request id with different revisions or hash is rejected`() {
    val fixture = Fixture(liveRevision = 3)
    fixture.apply()

    val error = assertThrows(SessionRecordException::class.java) {
        fixture.apply(expectedDraftHash = "f".repeat(64))
    }

    assertEquals(SessionRecordError.APPLY_REQUEST_ALREADY_USED, error.error)
}

@Test
fun `preview returns event type and stored draft sha without persistence`() {
    val fixture = Fixture(liveRevision = 3)

    val preview = fixture.preview()

    assertEquals(NotificationEventType.SESSION_RECORD_UPDATED, preview.eventType)
    assertEquals(fixture.encodedDraft.sha256, preview.expectedDraftHash)
    assertTrue(fixture.store.receipts.isEmpty())
    assertTrue(fixture.store.notificationDecisions.isEmpty())
}
```

- [ ] **Step 2: RED test 실행**

Run:

```bash
./server/gradlew -p server unitTest --tests '*SessionRecordApplyServiceTest'
./server/gradlew -p server integrationTest --tests '*HostSessionRecordControllerDbTest'
```

Expected: 기존 `previewId`/`notificationDecision` 계약 때문에 compile 또는 assertion이 FAIL한다.

- [ ] **Step 3: preview를 읽기 전용으로 변경**

```kotlin
override fun preview(host: CurrentMember, command: PreviewSessionRecordApplyCommand): SessionRecordApplyPreview {
    requireHost(host)
    val live = store.loadLive(host, command.sessionId) ?: throw notFound()
    val draft = store.loadDraft(host, command.sessionId) ?: throw draftStale()
    requireRevisions(live, draft, command.expectedLiveRevision, command.expectedDraftRevision)
    return SessionRecordApplyPreview(
        eventType = eventType(live, draft),
        expectedDraftHash = codec.encode(draft.snapshot).sha256,
    )
}
```

- [ ] **Step 4: apply/replay를 receipt 기반으로 변경**

apply 시작과 session lock 뒤에 `findCompletedApply(host, command.applyRequestId)`를 확인한다. 새 apply는 draft hash를 constant-time 비교하고 validate → replace → immutable revision → receipt → draft delete 순서로 같은 transaction에서 처리한다.

```kotlin
private fun replay(
    command: ApplySessionRecordCommand,
    receipt: SessionRecordApplyReceipt,
): SessionRecordApplyResult {
    if (
        receipt.expectedDraftRevision != command.expectedDraftRevision ||
        receipt.expectedLiveRevision != command.expectedLiveRevision ||
        receipt.draftSha256 != command.expectedDraftHash ||
        receipt.revision.sessionId != command.sessionId
    ) {
        throw SessionRecordException(
            SessionRecordError.APPLY_REQUEST_ALREADY_USED,
            "Session record apply request was already used",
        )
    }
    return result(receipt.revision)
}
```

`result(revision, eventType)`은 `ManualNotificationContentRevision.sessionRecord(codec.encode(revision.snapshot).sha256)`와 event type을 `HostNotificationComposerContext`에 넣는다. 새 apply는 apply 직전 계산한 event type을 receipt에 저장하고, replay는 `receipt.composerEventType`을 사용한다. `ConfirmHostActionNotificationUseCase`, `RecordHostConfirmedNotificationEventUseCase`와 관련 import/constructor field를 제거한다.

- [ ] **Step 5: HTTP contract를 변경하고 legacy SEND를 fail closed**

```kotlin
data class ApplySessionRecordRequest(
    val applyRequestId: String,
    @field:Positive val expectedDraftRevision: Long,
    @field:PositiveOrZero val expectedLiveRevision: Long,
    val expectedDraftHash: String,
    val previewId: String? = null,
    val notificationDecision: NotificationDecision? = null,
) {
    fun toCommand(sessionId: UUID): ApplySessionRecordCommand {
        if (previewId != null || notificationDecision != null) {
            throw SessionRecordException(
                SessionRecordError.INVALID_APPLY_CONTRACT,
                "Legacy notification decision contract is not accepted",
            )
        }
        return ApplySessionRecordCommand(
            sessionId,
            parseRecordUuid(applyRequestId),
            expectedDraftRevision,
            expectedLiveRevision,
            expectedDraftHash,
        )
    }
}
```

preview response는 `eventType`, `expectedDraftHash`; apply response는 `revisionId`, `liveRevision`, `composer`만 반환한다. error handler는 `APPLY_REQUEST_ALREADY_USED`를 HTTP 409, `INVALID_APPLY_CONTRACT`를 HTTP 400으로 매핑한다.

- [ ] **Step 6: focused test를 GREEN으로 확인**

Run:

```bash
./server/gradlew -p server unitTest --tests '*SessionRecordApplyServiceTest' --tests '*SessionRecordModelsTest'
./server/gradlew -p server integrationTest --tests '*HostSessionRecordControllerDbTest'
```

Expected: PASS, apply DB assertion에서 host-action decision/outbox count가 0이다.

- [ ] **Step 7: Task 2 commit**

```bash
git add server/src/main/kotlin/com/readmates/sessionrecord/application/service/SessionRecordApplyService.kt \
  server/src/main/kotlin/com/readmates/sessionrecord/adapter/in/web/SessionRecordWebDtos.kt \
  server/src/main/kotlin/com/readmates/sessionrecord/adapter/in/web/SessionRecordErrorHandler.kt \
  server/src/test/kotlin/com/readmates/sessionrecord/application/service/SessionRecordApplyServiceTest.kt \
  server/src/test/kotlin/com/readmates/sessionrecord/api/HostSessionRecordControllerDbTest.kt
git commit -m "refactor(sessionrecord): separate apply from notifications"
```

### Task 3: 다음 책 visibility 저장에서 자동/decision 발송 제거

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionApplicationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/model/HostSessionCommands.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/in/HostSessionUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionLifecycleService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionController.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/application/service/HostSessionServicesTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`

**Interfaces:**
- Consumes: Task 1 `HostNotificationComposerContext`, `ManualNotificationContentRevision.nextBook`.
- Produces: `HostSessionVisibilityUpdateResult(session, composer?)`; legacy preview/decision path 제거.

- [ ] **Step 1: first publication 무발송 test를 RED로 작성**

`required=false`와 `required=true` fixture 모두 다음을 증명한다.

```kotlin
assertThat(result.composer?.eventType).isEqualTo(NotificationEventType.NEXT_BOOK_PUBLISHED)
assertThat(recordingEventUseCase.events).isEmpty()
assertThat(notificationGate.prepared).isEmpty()
```

DB test는 visibility 저장 뒤 `notification_event_outbox`와 `host_action_notification_decisions`가 모두 0인지 확인한다. legacy `previewId` 또는 `notificationDecision` request는 4xx이고 visibility가 바뀌지 않는 test를 추가한다.

- [ ] **Step 2: RED test 실행**

Run:

```bash
./server/gradlew -p server unitTest --tests '*HostSessionServicesTest'
./server/gradlew -p server integrationTest --tests '*HostSessionControllerDbTest'
```

Expected: 기존 fallback 또는 SEND path 때문에 FAIL한다.

- [ ] **Step 3: result contract를 추가**

```kotlin
data class HostSessionVisibilityUpdateResult(
    val session: HostSessionDetailResponse,
    val composer: HostNotificationComposerContext?,
)
```

`UpdateHostSessionVisibilityCommand`에서 `previewId`, `notificationDecision`을 제거한다. controller request는 legacy sentinel field를 읽되 하나라도 존재하면 변경 전에 400으로 거절한다. `/visibility-preview` endpoint와 `PreviewHostSessionVisibilityCommand`는 삭제한다.

```kotlin
fun toCommand(host: CurrentMember, sessionId: UUID): UpdateHostSessionVisibilityCommand {
    if (previewId != null || notificationDecision != null) {
        throw ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "Legacy notification decision contract is not accepted",
        )
    }
    return UpdateHostSessionVisibilityCommand(host, sessionId, visibility)
}
```

- [ ] **Step 4: lifecycle service를 content-only로 변경**

`updateVisibility`는 lock snapshot → first publication 판정 → visibility update → applied snapshot 확인 → cache invalidation만 수행한다. first publication일 때만 다음 context를 반환한다.

```kotlin
HostNotificationComposerContext(
    sessionId = command.sessionId,
    eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
    contentRevision = ManualNotificationContentRevision.nextBook(
        command.sessionId,
        applied.detail.sessionNumber,
        applied.detail.bookTitle,
        applied.detail.visibility.name,
    ),
)
```

`recordLegacyNextBookNotification`, `confirmVisibilityUpdate`, notification gate/recorder 의존성을 제거한다. `confirmationProperties.required`가 제어하는 staging/capability 코드는 그대로 둔다.

- [ ] **Step 5: focused test를 GREEN으로 확인**

Run:

```bash
./server/gradlew -p server unitTest --tests '*HostSessionServicesTest'
./server/gradlew -p server integrationTest --tests '*HostSessionControllerDbTest'
```

Expected: PASS, 두 property mode 모두 저장만 수행하고 first publication response에만 composer context가 있다.

- [ ] **Step 6: Task 3 commit**

```bash
git add server/src/main/kotlin/com/readmates/session/application/SessionApplicationModels.kt \
  server/src/main/kotlin/com/readmates/session/application/model/HostSessionCommands.kt \
  server/src/main/kotlin/com/readmates/session/application/port/in/HostSessionUseCases.kt \
  server/src/main/kotlin/com/readmates/session/application/service/HostSessionLifecycleService.kt \
  server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionController.kt \
  server/src/test/kotlin/com/readmates/session/application/service/HostSessionServicesTest.kt \
  server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt
git commit -m "fix(notification): remove content mutation dispatch"
```

### Task 4: club reminder policy와 opt-in scheduler

**Files:**
- Create: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationPolicyModels.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationPolicyUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationPolicyPort.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/service/HostNotificationPolicyService.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationPolicyAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/HostNotificationPolicyController.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/in/scheduler/NotificationReminderScheduler.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapter.kt`
- Create: `server/src/test/kotlin/com/readmates/notification/application/service/HostNotificationPolicyServiceTest.kt`
- Create: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationPolicyAdapterTest.kt`
- Create: `server/src/test/kotlin/com/readmates/notification/api/HostNotificationPolicyControllerTest.kt`
- Create: `server/src/test/kotlin/com/readmates/notification/adapter/in/scheduler/NotificationReminderSchedulerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapterTest.kt`

**Interfaces:**
- Produces: `GET/PUT /api/host/notifications/policy`, `NotificationPolicyPort`, midnight scheduler.
- Consumes: Task 1 `club_notification_policies`.

- [ ] **Step 1: policy default/auth와 scheduler filter test를 RED로 작성**

```kotlin
@Test
fun `missing policy defaults reminder to off`() {
    val result = HostNotificationPolicyService(FakeNotificationPolicyPort()).get(host())
    assertEquals(HostNotificationPolicy(false, null), result)
}

@Test
fun `member cannot read or update host policy`() {
    val service = HostNotificationPolicyService(FakeNotificationPolicyPort())
    assertThrows(AccessDeniedException::class.java) { service.get(member()) }
    assertThrows(AccessDeniedException::class.java) {
        service.update(member(), UpdateNotificationPolicyCommand(true))
    }
}

@Test
fun `scheduler uses tomorrow in Asia Seoul`() {
    val events = RecordingNotificationEvents()
    val clock = Clock.fixed(Instant.parse("2026-07-23T15:30:00Z"), ZoneOffset.UTC)
    NotificationReminderScheduler(events, clock, "Asia/Seoul").enqueueTomorrow()
    assertEquals(LocalDate.of(2026, 7, 25), events.reminderDates.single())
}

@Test
fun `reminder enqueue includes only opted in clubs`() {
    seedReminderCandidate(clubId = ON_CLUB_ID, policy = true)
    seedReminderCandidate(clubId = OFF_CLUB_ID, policy = false)
    seedReminderCandidate(clubId = MISSING_POLICY_CLUB_ID, policy = null)

    adapter.enqueueSessionReminderEvents(TOMORROW)
    adapter.enqueueSessionReminderEvents(TOMORROW)

    assertEquals(1, reminderEventCount(ON_CLUB_ID))
    assertEquals(0, reminderEventCount(OFF_CLUB_ID))
    assertEquals(0, reminderEventCount(MISSING_POLICY_CLUB_ID))
}
```

- [ ] **Step 2: RED test 실행**

Run:

```bash
./server/gradlew -p server unitTest --tests '*HostNotificationPolicyServiceTest' --tests '*NotificationReminderSchedulerTest'
./server/gradlew -p server integrationTest --tests '*JdbcNotificationPolicyAdapterTest' --tests '*HostNotificationPolicyControllerTest' --tests '*JdbcNotificationEventOutboxAdapterTest'
```

Expected: 새 classes가 없어 FAIL한다.

- [ ] **Step 3: policy clean-architecture slice 구현**

```kotlin
data class HostNotificationPolicy(
    val sessionReminderEnabled: Boolean,
    val updatedAt: OffsetDateTime?,
)

interface NotificationPolicyPort {
    fun get(clubId: UUID): HostNotificationPolicy
    fun save(clubId: UUID, hostMembershipId: UUID, sessionReminderEnabled: Boolean): HostNotificationPolicy
}
```

service는 `host.isHost`를 검증한다. JDBC `get`은 row 없음에 `HostNotificationPolicy(false, null)`, `save`는 `insert into club_notification_policies (club_id, session_reminder_enabled, updated_by_membership_id) values (?, ?, ?) on duplicate key update session_reminder_enabled = values(session_reminder_enabled), updated_by_membership_id = values(updated_by_membership_id)`를 사용한다. controller는 `GET`과 `PUT`에서 boolean과 ISO timestamp만 반환한다.

- [ ] **Step 4: scheduler와 opt-in join 구현**

```kotlin
@Scheduled(
    cron = "\${readmates.notifications.reminder-cron:0 0 0 * * *}",
    zone = "\${readmates.notifications.reminder-zone:Asia/Seoul}",
)
fun enqueueTomorrow() {
    val targetDate = LocalDate.now(clock.withZone(ZoneId.of(reminderZone))).plusDays(1)
    recordNotificationEventUseCase.recordSessionReminderDue(targetDate)
}
```

`enqueueSessionReminderEvents`의 session query에 다음 inner join만 추가하고 기존 dedupe key와 host-action ledger join은 보존한다.

```sql
join club_notification_policies
  on club_notification_policies.club_id = sessions.club_id
 and club_notification_policies.session_reminder_enabled = true
```

- [ ] **Step 5: focused test를 GREEN으로 확인**

Run:

```bash
./server/gradlew -p server unitTest --tests '*HostNotificationPolicyServiceTest' --tests '*NotificationReminderSchedulerTest'
./server/gradlew -p server integrationTest --tests '*JdbcNotificationPolicyAdapterTest' --tests '*HostNotificationPolicyControllerTest' --tests '*JdbcNotificationEventOutboxAdapterTest'
```

Expected: PASS, OFF/missing club은 event 0이고 ON club은 같은 session/date 재실행에도 event 1이다.

- [ ] **Step 6: Task 4 commit**

```bash
git add server/src/main/kotlin/com/readmates/notification \
  server/src/test/kotlin/com/readmates/notification
git commit -m "feat(notification): add opt-in reminder policy"
```

### Task 5: manual composer server를 selected members와 content revision으로 확장

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/ManualNotificationDispatchPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/HostManualNotificationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryPlanningOperations.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/application/model/NotificationManualDispatchModelsTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/application/service/HostManualNotificationServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapterTest.kt`

**Interfaces:**
- Produces: template `contentRevision`, `SELECTED_MEMBERS`, stale/duplicate/resend/idempotent confirm.
- Consumes: Task 1 V42, `ManualNotificationContentRevision`.

- [ ] **Step 1: selection/revision/confirm test를 RED로 추가**

```kotlin
@Test
fun `next book options default to all active members and both channels`() {
    val option = fixture.options(NotificationEventType.NEXT_BOOK_PUBLISHED)
    assertEquals(ManualNotificationAudience.ALL_ACTIVE_MEMBERS, option.defaultAudience)
    assertEquals(ManualNotificationRequestedChannels.BOTH, option.defaultChannels)
}

@Test
fun `feedback and session update default to confirmed attendees and both channels`() {
    listOf(
        NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
        NotificationEventType.SESSION_RECORD_UPDATED,
    ).forEach { eventType ->
        val option = fixture.options(eventType)
        assertEquals(ManualNotificationAudience.CONFIRMED_ATTENDEES, option.defaultAudience)
        assertEquals(ManualNotificationRequestedChannels.BOTH, option.defaultChannels)
    }
}

@Test
fun `selected members requires one or more unique active same club memberships`() {
    val empty = fixture.selection(audience = ManualNotificationAudience.SELECTED_MEMBERS)
    assertEquals(
        NotificationApplicationError.MEMBERSHIP_NOT_ALLOWED,
        assertThrows(NotificationApplicationException::class.java) {
            fixture.service.preview(fixture.host, ManualNotificationPreviewCommand(empty))
        }.error,
    )
}

@Test
fun `stale content revision fails preview and confirm without outbox`() {
    val stale = fixture.selection(contentRevision = "f".repeat(64))
    assertThrows(NotificationApplicationException::class.java) {
        fixture.service.preview(fixture.host, ManualNotificationPreviewCommand(stale))
    }
    assertTrue(fixture.port.outboxEvents.isEmpty())
}

@Test
fun `same consumed preview returns original dispatch without duplicate outbox`() {
    val command = fixture.confirmCommand()
    val first = fixture.service.confirm(fixture.host, command)
    val replay = fixture.service.confirm(fixture.host, command)
    assertEquals(first.eventId, replay.eventId)
    assertEquals(1, fixture.port.outboxEvents.size)
}

@Test
fun `same content revision requires explicit resend confirmation`() {
    fixture.confirm()
    val error = assertThrows(NotificationApplicationException::class.java) {
        fixture.confirm(resendConfirmed = false)
    }
    assertEquals(NotificationApplicationError.DUPLICATE_NOTIFICATION_DISPATCH, error.error)
    assertEquals(1, fixture.port.outboxEvents.size)
}
```

- [ ] **Step 2: RED test 실행**

Run:

```bash
./server/gradlew -p server unitTest --tests '*NotificationManualDispatchModelsTest' --tests '*HostManualNotificationServiceTest'
./server/gradlew -p server integrationTest --tests '*HostNotificationControllerTest' --tests '*JdbcManualNotificationDispatchAdapterTest'
```

Expected: `SELECTED_MEMBERS`와 `contentRevision`이 없어 FAIL한다.

- [ ] **Step 3: model과 DTO를 확장**

```kotlin
enum class ManualNotificationAudience {
    ALL_ACTIVE_MEMBERS,
    SESSION_PARTICIPANTS,
    CONFIRMED_ATTENDEES,
    SELECTED_MEMBERS,
}

data class ManualNotificationTemplateOption(
    val eventType: NotificationEventType,
    val label: String,
    val enabled: Boolean,
    val disabledReason: String?,
    val contentRevision: String,
    val defaultAudience: ManualNotificationAudience,
    val allowedAudiences: Set<ManualNotificationAudience>,
    val defaultChannels: ManualNotificationRequestedChannels = ManualNotificationRequestedChannels.BOTH,
)

data class ManualNotificationSelection(
    val sessionId: UUID,
    val eventType: NotificationEventType,
    val contentRevision: String,
    val audience: ManualNotificationAudience,
    val requestedChannels: ManualNotificationRequestedChannels,
    val selectedMembershipIds: List<UUID> = emptyList(),
    val excludedMembershipIds: List<UUID> = emptyList(),
    val includedMembershipIds: List<UUID> = emptyList(),
    val sendMode: ManualNotificationSendMode = ManualNotificationSendMode.NOW,
)
```

`ManualNotificationSessionContext`에 `feedbackDocumentVersion: Int?`, `sessionRecordContentRevision: String?`을 추가한다. JDBC는 latest feedback document version과 latest `session_record_revisions.snapshot_sha256`를 함께 조회한다.

- [ ] **Step 4: event별 allowed/default/revision 규칙 구현**

```kotlin
fun defaultManualAudience(eventType: NotificationEventType) =
    when (eventType) {
        NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
        NotificationEventType.SESSION_RECORD_UPDATED,
        -> ManualNotificationAudience.CONFIRMED_ATTENDEES
        else -> ManualNotificationAudience.ALL_ACTIVE_MEMBERS
    }
```

`NEXT_BOOK_PUBLISHED`, `FEEDBACK_DOCUMENT_PUBLISHED`, `SESSION_RECORD_UPDATED`, `SESSION_REMINDER_DUE`만 manual template로 허용한다. `SESSION_RECORD_UPDATED`는 `sessionRecordContentRevision`만 사용한다. `FEEDBACK_DOCUMENT_PUBLISHED`는 최신 revision hash가 있으면 이를 사용하고, legacy feedback document만 있으면 `feedbackDocument(sessionId, feedbackDocumentVersion)`을 사용한다. next book/reminder도 Task 1 helper로 계산한다. `MessageDigest.isEqual`로 request revision과 현재 revision을 비교한다.

- [ ] **Step 5: selected member와 selection hash 구현**

`SELECTED_MEMBERS`는 selected list가 비어 있거나 중복이 있거나 include/exclude와 함께 오면 `MEMBERSHIP_NOT_ALLOWED`다. 다른 audience에서 selected list가 오면 같은 error다. selection hash는 content revision과 정렬된 selected/include/exclude ID를 모두 포함한다.

```kotlin
val raw = listOf(
    selection.sessionId,
    selection.eventType,
    selection.contentRevision,
    selection.audience,
    selection.requestedChannels,
    selection.selectedMembershipIds.sorted(),
    selection.excludedMembershipIds.sorted(),
    selection.includedMembershipIds.sorted(),
    selection.sendMode,
).joinToString("|")
```

- [ ] **Step 6: persistence의 원자 confirm과 revision duplicate를 구현**

preview row를 `for update`로 lock하고 selection hash/TTL/consumed event를 검사한다. confirm transaction 안에서 session lock, current revision 재검증, `(club, session, eventType, contentRevision)` duplicate 조회, outbox insert, manual dispatch insert, preview consumed update를 수행한다. `resendConfirmed=false` duplicate는 outbox를 만들지 않는다.

```kotlin
@Transactional
override fun confirmManualDispatch(
    previewId: UUID,
    clubId: UUID,
    hostMembershipId: UUID,
    selectionHash: String,
    now: OffsetDateTime,
    selection: ManualNotificationSelection,
    payload: NotificationEventPayload,
    targetSnapshot: ManualNotificationTargetSnapshot,
    resend: Boolean,
): ManualNotificationConfirmedDispatch? {
    val preview = lockPreview(previewId, clubId, hostMembershipId) ?: return null
    if (preview.selectionHash != selectionHash || !preview.expiresAt.isAfter(now)) return null
    preview.consumedEventId?.let { return findStoredDispatchByEventId(clubId, it) }
    lockSession(clubId, selection.sessionId) ?: return null
    findStoredDispatchByRevision(clubId, selection)?.let {
        return it.copy(status = ManualNotificationConfirmInsertStatus.DUPLICATE)
    }
    return insertDispatchAndConsumePreview(
        previewId,
        clubId,
        hostMembershipId,
        selection,
        payload,
        targetSnapshot,
        resend,
    )
}
```

delivery planning의 `SELECTED_MEMBERS` branch는 payload snapshot의 selected ID를 club의 현재 active membership으로 다시 제한한다.

- [ ] **Step 7: focused test를 GREEN으로 확인**

Run:

```bash
./server/gradlew -p server unitTest --tests '*NotificationManualDispatchModelsTest' --tests '*HostManualNotificationServiceTest'
./server/gradlew -p server integrationTest --tests '*HostNotificationControllerTest' --tests '*JdbcManualNotificationDispatchAdapterTest'
```

Expected: PASS, stale/foreign/inactive/duplicate 입력에서 outbox count가 0이고 confirm retry는 같은 event ID를 반환한다.

- [ ] **Step 8: Task 5 commit**

```bash
git add server/src/main/kotlin/com/readmates/notification \
  server/src/test/kotlin/com/readmates/notification
git commit -m "feat(notification): extend explicit recipient composer"
```

### Task 6: 열린 세션의 host feedback preview

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/feedback/application/port/in/FeedbackDocumentUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/application/port/out/FeedbackDocumentStorePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/application/service/FeedbackDocumentService.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/adapter/out/persistence/JdbcFeedbackDocumentStoreAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/adapter/in/web/FeedbackDocumentController.kt`
- Modify: `server/src/test/kotlin/com/readmates/feedback/api/FeedbackDocumentControllerTest.kt`

**Interfaces:**
- Produces: host-only `GET /api/host/sessions/{sessionId}/feedback-document/preview`.
- Consumes: existing parser/response DTO; public/member readability rule는 변경하지 않는다.

- [ ] **Step 1: open-session host/member/foreign-club test를 RED로 추가**

host는 OPEN session 문서를 200으로 읽고, member는 403, 다른 club host는 404, 문서 없음은 404를 assertion한다.

```kotlin
@Test
fun `host previews an open session feedback document`() {
    whenever(preview.getHostFeedbackDocumentPreview(host, SESSION_ID)).thenReturn(document())

    mockMvc
        .get("/api/host/sessions/$SESSION_ID/feedback-document/preview") {
            with(user("host@example.test"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionId") { value(SESSION_ID.toString()) }
        }
}

@Test
fun `member cannot preview a host feedback document`() {
    mockMvc
        .get("/api/host/sessions/$SESSION_ID/feedback-document/preview") {
            with(user("member@example.test"))
        }.andExpect { status { isForbidden() } }
}
```

- [ ] **Step 2: RED test 실행**

Run:

```bash
./server/gradlew -p server integrationTest --tests '*FeedbackDocumentControllerTest'
```

Expected: preview endpoint가 없어 FAIL한다.

- [ ] **Step 3: host preview use case와 persistence를 구현**

```kotlin
interface GetHostFeedbackDocumentPreviewUseCase {
    fun getHostFeedbackDocumentPreview(
        currentMember: CurrentMember,
        sessionId: UUID,
    ): FeedbackDocumentResult?
}
```

store의 `findSession(clubId, sessionId)`는 visibility/state filter 없이 같은 club session metadata만 조회한다. service는 `currentMember.isHost`를 먼저 검사하고 `findSession`과 `findLatestDocument`를 조합해 기존 parser/response mapper를 재사용한다.

- [ ] **Step 4: controller endpoint 구현**

```kotlin
@GetMapping("/api/host/sessions/{sessionId}/feedback-document/preview")
fun hostFeedbackDocumentPreview(
    currentMember: CurrentMember,
    @PathVariable sessionId: String,
): FeedbackDocumentResponse =
    previewUseCase
        .getHostFeedbackDocumentPreview(currentMember, parseSessionId(sessionId))
        ?.toWebDto()
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
```

- [ ] **Step 5: focused test를 GREEN으로 확인**

Run:

```bash
./server/gradlew -p server integrationTest --tests '*FeedbackDocumentControllerTest'
```

Expected: PASS, public/member endpoint의 기존 closed/visible rule도 유지된다.

- [ ] **Step 6: Task 6 commit**

```bash
git add server/src/main/kotlin/com/readmates/feedback \
  server/src/test/kotlin/com/readmates/feedback/api/FeedbackDocumentControllerTest.kt
git commit -m "feat(feedback): add host document preview"
```

### Task 7: 프런트 API, query, composer 순수 model

**Files:**
- Modify: `front/features/host/api/host-contracts.ts`
- Modify: `front/features/host/api/host-api.ts`
- Modify: `front/features/host/api/host-api.test.ts`
- Modify: `front/features/host/api/host-session-record-contracts.ts`
- Modify: `front/features/host/api/host-session-record-api.ts`
- Modify: `front/features/host/queries/host-notification-queries.ts`
- Modify: `front/features/host/queries/host-notification-queries.test.ts`
- Modify: `front/features/host/queries/host-notification-queries.hooks.test.tsx`
- Modify: `front/features/host/queries/host-session-record-queries.ts`
- Modify: `front/features/host/queries/host-session-record-queries.test.tsx`
- Create: `front/features/host/model/host-notification-composer-model.ts`
- Create: `front/features/host/model/host-notification-composer-model.test.ts`
- Modify: `front/features/host/model/host-view-types.ts`

**Interfaces:**
- Produces: typed server contracts, policy query/mutation, `buildComposerSelection`.
- Consumes: Task 2~5 HTTP responses.

- [ ] **Step 1: Zod/API/model test를 RED로 작성**

```ts
expect(buildComposerSelection({
  sessionId: "session-1",
  eventType: "SESSION_RECORD_UPDATED",
  contentRevision: "a".repeat(64),
  recipientMode: "RECOMMENDED",
  requestedChannels: "BOTH",
  selectedMembershipIds: [],
}).audience).toBe("CONFIRMED_ATTENDEES");
```

추가 test는 selected ID 정렬, 빈 selected preview 금지, apply request의 `applyRequestId`/`expectedDraftHash`, visibility response composer, policy GET/PUT를 검증한다.

- [ ] **Step 2: RED test 실행**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/api/host-api.test.ts \
  features/host/model/host-notification-composer-model.test.ts \
  features/host/queries/host-notification-queries.test.ts \
  features/host/queries/host-session-record-queries.test.tsx
```

Expected: 새 type/function이 없어 FAIL한다.

- [ ] **Step 3: contract를 서버 응답과 일치시킨다**

```ts
export type ManualNotificationAudience =
  | "ALL_ACTIVE_MEMBERS"
  | "SESSION_PARTICIPANTS"
  | "CONFIRMED_ATTENDEES"
  | "SELECTED_MEMBERS";

export type HostNotificationComposerContext = {
  sessionId: string;
  eventType: "NEXT_BOOK_PUBLISHED" | "FEEDBACK_DOCUMENT_PUBLISHED" | "SESSION_RECORD_UPDATED";
  contentRevision: string;
};

export type HostSessionRecordApplyRequest = {
  applyRequestId: string;
  expectedDraftRevision: number;
  expectedLiveRevision: number;
  expectedDraftHash: string;
};
```

preview schema는 `eventType`, `expectedDraftHash`; apply result schema는 `revisionId`, `liveRevision`, `composer`; visibility mutation result는 `session`, `composer`다. notification template에 `contentRevision`, selection에 `selectedMembershipIds`를 추가한다.

- [ ] **Step 4: policy와 manual query를 구현**

```ts
export const hostNotificationKeys = {
  all: ["host", "notifications"] as const,
  policy: (context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.all, context?.clubSlug ?? null, "policy"] as const,
  // existing keys remain
};
```

`fetchHostNotificationPolicy`, `updateHostNotificationPolicy`, `useUpdateHostNotificationPolicyMutation`을 추가하고 success에서 policy key만 invalidate한다. manual confirm success는 manual dispatch/event/delivery/summary query를 invalidate한다.

- [ ] **Step 5: 순수 composer model 구현**

```ts
export type HostNotificationRecipientMode =
  | "RECOMMENDED"
  | "ALL_ACTIVE_MEMBERS"
  | "SELECTED_MEMBERS";

export function recommendedAudience(eventType: HostNotificationEventType) {
  return eventType === "NEXT_BOOK_PUBLISHED"
    ? "ALL_ACTIVE_MEMBERS"
    : "CONFIRMED_ATTENDEES";
}

export function composerCanPreview(draft: HostNotificationComposerDraft) {
  return draft.recipientMode !== "SELECTED_MEMBERS"
    || draft.selectedMembershipIds.length > 0;
}
```

`buildComposerSelection`은 selected mode에서만 정렬한 selected ID를 보내고 include/exclude는 빈 배열로 보낸다.

- [ ] **Step 6: focused test를 GREEN으로 확인**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/api/host-api.test.ts \
  features/host/model/host-notification-composer-model.test.ts \
  features/host/queries/host-notification-queries.test.ts \
  features/host/queries/host-notification-queries.hooks.test.tsx \
  features/host/queries/host-session-record-queries.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Task 7 commit**

```bash
git add front/features/host/api front/features/host/model front/features/host/queries
git commit -m "feat(front): define notification composer contracts"
```

### Task 8: 공통 composer UI와 controller

**Files:**
- Create: `front/features/host/route/host-notification-composer-controller.tsx`
- Create: `front/features/host/route/host-notification-composer-controller.test.tsx`
- Create: `front/features/host/ui/notifications/host-notification-composer.tsx`
- Create: `front/features/host/ui/notifications/host-notification-composer.test.tsx`
- Create: `front/features/host/ui/notifications/host-notification-composer-dialog.tsx`
- Create: `front/features/host/ui/notifications/host-notification-composer-dialog.test.tsx`
- Create: `front/features/host/ui/notifications/notification-recipient-picker.tsx`
- Delete: `front/features/host/ui/notifications/manual-notification-member-picker.tsx`
- Modify: `front/features/host/ui/notifications/manual-notification-workbench.tsx`
- Modify: `front/features/host/ui/notifications/manual-notification-labels.ts`
- Modify: `front/features/host/ui/notifications/notification-formatters.ts`
- Modify: `front/shared/styles/mobile.css`
- Modify: `front/tests/unit/host-notifications-ui-boundary.test.ts`
- Modify: `front/tests/unit/host-notifications.test.tsx`

**Interfaces:**
- Produces: `HostNotificationComposerController`, reusable presentational composer.
- Consumes: Task 7 query/model.

- [ ] **Step 1: accessibility/state test를 RED로 작성**

test는 추천/전체/직접 선택, selected empty disable, search cursor accumulation, preview 변경 시 invalidation, duplicate resend checkbox, confirm success, options error retry, close/Escape 무mutation, reopen state reset을 검증한다.

```tsx
it("does not confirm when the composer is closed with Escape", async () => {
  const confirm = vi.fn();
  renderComposer({ onConfirm: confirm });

  await userEvent.keyboard("{Escape}");

  expect(confirm).not.toHaveBeenCalled();
});

it("requires a selected member before preview", async () => {
  renderComposer();
  await userEvent.click(screen.getByRole("radio", { name: "직접 선택" }));
  expect(screen.getByRole("button", { name: "알림 미리보기" })).toBeDisabled();
});
```

- [ ] **Step 2: RED test 실행**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/route/host-notification-composer-controller.test.tsx \
  features/host/ui/notifications/host-notification-composer.test.tsx \
  features/host/ui/notifications/host-notification-composer-dialog.test.tsx \
  tests/unit/host-notifications-ui-boundary.test.ts
```

Expected: 새 components가 없어 FAIL한다.

- [ ] **Step 3: controller interface를 구현**

```ts
export type HostNotificationComposerRequest = {
  sessionId: string;
  eventType: "NEXT_BOOK_PUBLISHED" | "FEEDBACK_DOCUMENT_PUBLISHED" | "SESSION_RECORD_UPDATED";
  origin: "FIRST_PUBLICATION" | "CONTENT_UPDATE" | "OPERATIONS";
};
```

open 시 options를 session ID로 조회하고 event template의 `contentRevision`을 draft key로 사용한다. options error는 “콘텐츠는 저장됐지만 알림을 준비하지 못했습니다”와 retry/나중에 발송을 제공한다. confirm success만 `onConfirmed`를 호출한다.

- [ ] **Step 4: presentation과 recipient picker 구현**

UI는 props/callback만 받고 API/query/route를 import하지 않는다. 추천 대상 label은 next book “전체 활성 멤버”, feedback/update “참석 확정자”다. 직접 선택일 때만 검색·더 보기 picker를 렌더링한다.

```tsx
{draft.recipientMode === "SELECTED_MEMBERS" ? (
  <NotificationRecipientPicker
    members={options.members.items}
    selectedMembershipIds={draft.selectedMembershipIds}
    hasMore={Boolean(options.members.nextCursor)}
    busy={busy}
    onSelectedMembershipIdsChange={(selectedMembershipIds) =>
      onDraftChange({ ...draft, selectedMembershipIds })}
    onSearch={onSearch}
    onLoadMore={onLoadMore}
  />
) : null}
```

- [ ] **Step 5: dialog 접근성 구현**

dialog는 `role="dialog"`, `aria-modal`, title/description 연결, initial focus, focus trap, Escape close, body scroll restore를 제공한다. busy 중 close는 막고 mobile에서는 bottom sheet, desktop에서는 centered dialog를 사용한다.

```tsx
<div
  ref={dialogRef}
  role="dialog"
  aria-modal="true"
  aria-labelledby="host-notification-composer-title"
  aria-describedby="host-notification-composer-description"
  className="host-notification-composer-dialog"
  onKeyDown={(event) => {
    if (event.key === "Escape" && !busy) onClose();
    if (event.key === "Tab") trapFocus(event, dialogRef.current);
  }}
>
  {children}
</div>
```

- [ ] **Step 6: operations workbench를 공통 UI로 교체**

기존 manual workbench의 API state는 route에 남기고 recipient picker/composer presentation을 재사용한다. 기존 ledger와 free-form이 아닌 template 선택 동작은 보존한다.

```tsx
<HostNotificationComposer
  options={options}
  eventType={draft.eventType}
  draft={draft}
  preview={preview}
  busy={busy}
  error={error}
  onDraftChange={setDraft}
  onSearch={onSearch}
  onLoadMore={onLoadMore}
  onPreview={onPreview}
  onConfirm={onConfirm}
  onSkip={onReset}
  showSkip={false}
/>
```

- [ ] **Step 7: focused test를 GREEN으로 확인**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/route/host-notification-composer-controller.test.tsx \
  features/host/ui/notifications/host-notification-composer.test.tsx \
  features/host/ui/notifications/host-notification-composer-dialog.test.tsx \
  tests/unit/host-notifications-ui-boundary.test.ts \
  tests/unit/host-notifications.test.tsx
```

Expected: PASS, boundary test에서 UI의 API/query import가 0이다.

- [ ] **Step 8: Task 8 commit**

```bash
git add front/features/host/route/host-notification-composer-controller* \
  front/features/host/ui/notifications \
  front/shared/styles/mobile.css \
  front/tests/unit/host-notifications-ui-boundary.test.ts \
  front/tests/unit/host-notifications.test.tsx
git commit -m "feat(front): add shared host notification composer"
```

### Task 9: 다음 책 최초 공개 뒤 composer 연결

**Files:**
- Modify: `front/features/host/api/host-contracts.ts`
- Modify: `front/features/host/api/host-api.ts`
- Modify: `front/features/host/queries/host-session-queries.ts`
- Modify: `front/features/host/model/host-session-editor-model.ts`
- Modify: `front/features/host/route/host-dashboard-route.tsx`
- Create: `front/features/host/route/host-dashboard-route.test.tsx`
- Modify: `front/features/host/route/host-session-editor-route.tsx`
- Modify: `front/features/host/ui/host-dashboard.tsx`
- Modify: `front/features/host/ui/host-dashboard.test.tsx`
- Modify: `front/features/host/ui/host-session-editor.tsx`
- Modify: `front/features/host/ui/session-editor/publication-panel.tsx`
- Modify: `front/tests/unit/host-session-editor.test.tsx`
- Create: `front/tests/e2e/host-next-book-notification-composer.spec.ts`

**Interfaces:**
- Consumes: Task 3 visibility response, Task 8 controller.
- Produces: first publication save-success → composer flow.

- [ ] **Step 1: route/UI test를 RED로 작성**

first publication response에 composer가 있으면 dialog가 열리고, `composer=null`인 후속 저장에는 열리지 않으며, 저장 실패에는 열리지 않는 test를 작성한다. 닫기/건너뛰기는 confirm mock count 0을 assertion한다.

```tsx
it("opens the composer only after a successful first publication", async () => {
  saveVisibility.mockResolvedValue({
    session: publishedSession,
    composer: {
      sessionId: publishedSession.sessionId,
      eventType: "NEXT_BOOK_PUBLISHED",
      contentRevision: "a".repeat(64),
    },
  });

  renderRoute();
  await userEvent.click(screen.getByRole("button", { name: "멤버에게 공개" }));

  expect(await screen.findByRole("dialog", { name: "멤버에게 알림을 보낼까요?" })).toBeVisible();
  expect(confirmManual).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: RED test 실행**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/route/host-dashboard-route.test.tsx \
  features/host/ui/host-dashboard.test.tsx \
  tests/unit/host-session-editor.test.tsx
```

Expected: visibility mutation이 detail만 반환해 FAIL한다.

- [ ] **Step 3: visibility query를 parsed result로 변경**

`saveHostSessionVisibility`는 response JSON을 `HostSessionVisibilityUpdateResult`로 parse한다. mutation success는 `result.session`을 cache에 반영하고 result 전체를 caller에 반환한다. `previewHostSessionVisibility` API/query를 삭제한다.

```ts
export async function saveHostSessionVisibility(
  sessionId: string,
  request: HostSessionVisibilityRequest,
  context?: ReadmatesApiContext,
) {
  const response = await readmatesFetchResponse(
    `/api/host/sessions/${encodeURIComponent(sessionId)}/visibility`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    context,
  );
  if (!response.ok) throw await apiErrorFromResponse(response);
  return HostSessionVisibilityUpdateResponseSchema.parse(await response.json());
}
```

- [ ] **Step 4: dashboard/editor route가 composer request를 소유**

```ts
const [composerRequest, setComposerRequest] =
  useState<HostNotificationComposerRequest | null>(null);

const result = await visibilityMutation.mutateAsync({ sessionId, request: { visibility } });
if (result.composer) {
  setComposerRequest({
    sessionId: result.composer.sessionId,
    eventType: result.composer.eventType,
    origin: "FIRST_PUBLICATION",
  });
}
```

UI에서 기존 `HostActionConfirmationDialog`의 SEND/SKIP visibility flow를 제거하고 공통 controller를 렌더링한다.

- [ ] **Step 5: focused test를 GREEN으로 확인**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/route/host-dashboard-route.test.tsx \
  features/host/ui/host-dashboard.test.tsx \
  tests/unit/host-session-editor.test.tsx
```

Expected: PASS.

- [ ] **Step 6: next-book E2E 실행**

Run:

```bash
corepack pnpm --dir front test:e2e -- host-next-book-notification-composer.spec.ts
```

Expected: 저장 후 outbox 0, skip 후 0, confirm 후 manual dispatch/outbox 각각 1, 재확인 retry에도 1.

- [ ] **Step 7: Task 9 commit**

```bash
git add front/features/host front/tests/e2e/host-next-book-notification-composer.spec.ts \
  front/tests/unit/host-session-editor.test.tsx
git commit -m "feat(front): compose notifications after next book save"
```

### Task 10: final session record apply 뒤 composer 연결

**Files:**
- Modify: `front/features/host/api/host-session-record-contracts.ts`
- Modify: `front/features/host/api/host-session-record-api.ts`
- Modify: `front/features/host/queries/host-session-record-queries.ts`
- Modify: `front/features/host/route/host-session-editor-route.tsx`
- Modify: `front/features/host/route/host-session-editor-route.test.tsx`
- Modify: `front/features/host/ui/host-session-editor.tsx`
- Delete: `front/features/host/ui/session-editor/host-action-confirmation-dialog.tsx`
- Delete: `front/features/host/ui/session-editor/host-action-confirmation-dialog.test.tsx`
- Modify: `front/features/host/aigen/ui/AiGenerateTab.tsx`
- Modify: `front/features/host/aigen/ui/AiGenerateTab.test.tsx`
- Modify: `front/features/host/model/session-import-model.ts`
- Modify: `front/features/host/model/session-import-model.test.ts`
- Modify: `front/features/host/ui/session-editor/session-import-panel.tsx`
- Modify: `front/features/host/ui/session-editor/session-import-panel.test.tsx`
- Modify: `front/tests/unit/host-session-editor.test.tsx`
- Create: `front/tests/e2e/host-feedback-notification-composer.spec.ts`

**Interfaces:**
- Consumes: Task 2 content-only apply, Task 8 controller.
- Produces: final apply-success → composer; JSON/AI draft commit → no composer.

- [ ] **Step 1: apply/replay/draft-only test를 RED로 작성**

route test는 preview가 `expectedDraftHash`를 반환하고 apply가 한 번 생성한 `crypto.randomUUID()`의 `applyRequestId`를 retry에도 재사용하는지 검증한다. JSON import와 AI commit success는 composer가 열리지 않고, final apply success만 response event type으로 composer가 열리는지 검증한다.

```tsx
it("opens the composer after final apply but not after JSON draft commit", async () => {
  commitImport.mockResolvedValue(importedDraft);
  applyRecord.mockResolvedValue({
    revisionId: "revision-4",
    liveRevision: 4,
    composer: {
      sessionId: "session-1",
      eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
      contentRevision: "b".repeat(64),
    },
  });

  renderRoute();
  await commitJsonDraft();
  expect(screen.queryByRole("dialog", { name: "멤버에게 알림을 보낼까요?" })).not.toBeInTheDocument();
  await applyFinalDraft();
  expect(await screen.findByRole("dialog", { name: "멤버에게 알림을 보낼까요?" })).toBeVisible();
});
```

- [ ] **Step 2: RED test 실행**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/route/host-session-editor-route.test.tsx \
  features/host/aigen/ui/AiGenerateTab.test.tsx \
  features/host/model/session-import-model.test.ts \
  features/host/ui/session-editor/session-import-panel.test.tsx \
  tests/unit/host-session-editor.test.tsx
```

Expected: 기존 SEND/SKIP dialog와 request contract 때문에 FAIL한다.

- [ ] **Step 3: route apply state를 content-only로 변경**

```ts
const applyRequestId = crypto.randomUUID();
const preview = await previewMutation.mutateAsync({
  sessionId,
  request: {
    expectedDraftRevision: recordEditor.draft.draftRevision,
    expectedLiveRevision: recordEditor.liveRevision,
  },
});
const result = await applyMutation.mutateAsync({
  sessionId,
  request: {
    applyRequestId,
    expectedDraftRevision: recordEditor.draft.draftRevision,
    expectedLiveRevision: recordEditor.liveRevision,
    expectedDraftHash: preview.expectedDraftHash,
  },
});
setComposerRequest({
  sessionId: result.composer.sessionId,
  eventType: result.composer.eventType,
  origin: "CONTENT_UPDATE",
});
```

network error retry는 같은 applyRequestId/request object를 보존한다. stale error 후 새 preview를 받으면 새 applyRequestId를 만든다.

- [ ] **Step 4: 기존 SEND/SKIP dialog를 제거**

apply confirmation UI는 content diff, revision, 복구 지점과 “기록 반영”만 보여준다. 알림 대상/채널 선택은 apply 성공 뒤 공통 composer에서만 제공한다. history는 기존 과거 `NOTIFICATION_SENT/SKIPPED` row를 계속 표시한다.

```tsx
<button
  type="button"
  className="btn btn-primary"
  disabled={submitting || !preview}
  onClick={onApplyRecord}
>
  {submitting ? "반영 중" : "기록 반영"}
</button>
```

- [ ] **Step 5: JSON/AI 경계를 고정**

`commitSessionImport`와 AI commit callback은 draft cache와 session-record surfaces만 invalidate한다. composer request를 만들지 않는다. final apply callback만 composer를 연다.

```ts
commitSessionImport: async (sessionId, request) => {
  const result = await commitImport({ sessionId, request });
  await invalidateHostSessionRecordSurfaces(queryClient, sessionId, context);
  await onSessionRecordsChanged?.(sessionId);
  return result;
},
```

- [ ] **Step 6: focused test를 GREEN으로 확인**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/route/host-session-editor-route.test.tsx \
  features/host/aigen/ui/AiGenerateTab.test.tsx \
  features/host/model/session-import-model.test.ts \
  features/host/ui/session-editor/session-import-panel.test.tsx \
  tests/unit/host-session-editor.test.tsx
```

Expected: PASS.

- [ ] **Step 7: feedback/update E2E 실행**

Run:

```bash
corepack pnpm --dir front test:e2e -- host-feedback-notification-composer.spec.ts
```

Expected: JSON/AI draft commit outbox 0, final apply outbox 0, skip outbox 0, confirm outbox 1, stale preview confirm outbox 0.

- [ ] **Step 8: Task 10 commit**

```bash
git add front/features/host front/tests/e2e/host-feedback-notification-composer.spec.ts \
  front/tests/unit/host-session-editor.test.tsx
git commit -m "feat(front): compose notifications after record apply"
```

### Task 11: policy UI와 host feedback preview route

**Files:**
- Modify: `front/features/feedback/api/feedback-api.ts`
- Modify: `front/features/feedback/queries/feedback-queries.ts`
- Modify: `front/features/feedback/route/feedback-document-route.tsx`
- Modify: `front/tests/unit/feedback-document-route.test.tsx`
- Create: `front/src/app/host-routes/feedback-document-preview-data.ts`
- Create: `front/src/app/host-routes/feedback-document-preview-route-element.tsx`
- Modify: `front/src/app/routes/host.tsx`
- Create: `front/features/host/ui/notifications/host-notification-policy-card.tsx`
- Create: `front/features/host/ui/notifications/host-notification-policy-card.test.tsx`
- Modify: `front/features/host/route/host-notifications-route.tsx`
- Modify: `front/features/host/ui/host-notifications-page.tsx`
- Modify: `front/features/host/ui/session-editor/session-record-completion-panel.tsx`
- Modify: `front/tests/unit/host-notifications.test.tsx`
- Modify: `front/tests/unit/host-session-editor.test.tsx`
- Modify: `front/tests/e2e/host-session-record-preview.spec.ts`

**Interfaces:**
- Consumes: Task 4 policy API, Task 6 feedback preview API.
- Produces: host operations policy toggle와 open-session preview route.

- [ ] **Step 1: policy rollback과 host preview test를 RED로 작성**

policy card는 save success, save failure rollback, pending disable, accessible label을 검증한다. feedback route는 host loader auth, club slug query scope, OPEN session ready, missing document state를 검증한다.

```tsx
it("keeps the confirmed policy value when saving fails", async () => {
  const onChange = vi.fn().mockRejectedValue(new Error("save failed"));
  render(<HostNotificationPolicyCard policy={{ sessionReminderEnabled: false, updatedAt: null }} onChange={onChange} />);

  await userEvent.click(screen.getByRole("checkbox", { name: "모임 전날 자동 리마인더" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("저장하지 못했습니다");
  expect(screen.getByRole("checkbox", { name: "모임 전날 자동 리마인더" })).not.toBeChecked();
});
```

- [ ] **Step 2: RED test 실행**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/notifications/host-notification-policy-card.test.tsx \
  tests/unit/feedback-document-route.test.tsx \
  tests/unit/host-notifications.test.tsx \
  tests/unit/host-session-editor.test.tsx
```

Expected: 새 UI/route가 없어 FAIL한다.

- [ ] **Step 3: host feedback preview query/route 구현**

```ts
export function hostFeedbackDocumentPreviewQuery(
  sessionId: string,
  context?: ReadmatesApiContext,
) {
  return queryOptions({
    queryKey: [...feedbackKeys.scope(context), "host-preview", sessionId],
    queryFn: () => fetchHostFeedbackDocumentPreview(sessionId, context),
  });
}
```

route loader는 `requireHostLoaderAuth`, `clubSlugFromLoaderArgs`, `ensureQueryData`를 사용하고 path는 `sessions/:sessionId/feedback-document`다. member feedback route의 visibility behavior는 바꾸지 않는다.

- [ ] **Step 4: policy card와 route state 구현**

card는 server value를 checked source로 사용하고 PUT success 뒤에만 UI를 확정한다. failure 시 이전 server value로 복귀하고 `role="alert"`를 표시한다. host notifications route가 query/mutation을 소유하고 page에는 props/callback을 전달한다.

```tsx
const handlePolicyChange = async (enabled: boolean) => {
  setPolicyError(null);
  try {
    await updatePolicyMutation.mutateAsync({ sessionReminderEnabled: enabled });
  } catch {
    setPolicyError("리마인더 정책을 저장하지 못했습니다. 다시 시도해 주세요.");
  }
};

<HostNotificationPolicyCard
  policy={policyQuery.data}
  pending={updatePolicyMutation.isPending}
  error={policyError}
  onChange={handlePolicyChange}
/>
```

- [ ] **Step 5: session editor preview link 연결**

feedback document가 있으면 completion panel의 preview action을 club-scoped host route로 연결한다. OPEN/CLOSED/PUBLISHED 모두 host preview를 사용하고 public/member route로 우회하지 않는다.

```tsx
<LinkComponent
  className="btn btn-quiet btn-sm"
  to={clubScopedPath(clubSlug, `/app/host/sessions/${sessionId}/feedback-document`)}
>
  피드백 문서 미리보기
</LinkComponent>
```

- [ ] **Step 6: focused test와 E2E를 GREEN으로 확인**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/notifications/host-notification-policy-card.test.tsx \
  tests/unit/feedback-document-route.test.tsx \
  tests/unit/host-notifications.test.tsx \
  tests/unit/host-session-editor.test.tsx
corepack pnpm --dir front test:e2e -- host-session-record-preview.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Task 11 commit**

```bash
git add front/features/feedback front/features/host front/src/app/host-routes \
  front/src/app/routes/host.tsx front/tests/unit front/tests/e2e/host-session-record-preview.spec.ts
git commit -m "feat(front): add notification policy and host preview"
```

### Task 12: 통합 회귀, active docs, release readiness

**Files:**
- Modify: `front/tests/e2e/manual-notifications.spec.ts`
- Modify: `front/tests/e2e/aigen-commit-recovery.spec.ts`
- Modify: `front/tests/e2e/aigen-evidence-review.spec.ts`
- Modify: `front/tests/e2e/aigen-full-flow.spec.ts`
- Modify: `front/tests/e2e/aigen-test-fixtures.ts`
- Modify: `front/tests/e2e/readmates-e2e-db.ts`
- Modify: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationDeliveryAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcHostSessionHistoryAdapterDbTest.kt`
- Modify: `CHANGELOG.md`
- Modify: `docs/development/architecture.md`
- Modify: `docs/deploy/oci-backend.md`
- Create: `docs/reports/2026-07-23-host-notification-composer-integration-v2-release-readiness.md`

**Interfaces:**
- Consumes: Task 1~11 completed behavior.
- Produces: final branch-wide evidence와 current docs.

- [ ] **Step 1: full behavior matrix E2E를 작성**

E2E DB helper는 다음 count/read 함수를 제공한다.

```ts
notificationEventCount(sessionId, eventType)
manualDispatchCount(sessionId, eventType, contentRevision?)
hostActionDecisionCount(sessionId)
sessionRecordApplyReceiptCount(sessionId, applyRequestId?)
clubReminderPolicy(clubId)
```

manual notification E2E는 selected members, inactive/foreign rejection, default audience/channel, stale/expired preview, resend, confirm retry를 검증한다. AI E2E는 commit이 draft만 만들고 outbox/composer를 만들지 않는 assertion을 유지한다.

- [ ] **Step 2: focused integration suites 실행**

Run:

```bash
./server/gradlew -p server unitTest \
  --tests '*SessionRecordApplyServiceTest' \
  --tests '*HostManualNotificationServiceTest' \
  --tests '*HostNotificationPolicyServiceTest'
./server/gradlew -p server integrationTest \
  --tests '*HostSessionRecordControllerDbTest' \
  --tests '*HostNotificationControllerTest' \
  --tests '*JdbcManualNotificationDispatchAdapterTest' \
  --tests '*JdbcNotificationEventOutboxAdapterTest' \
  --tests '*FeedbackDocumentControllerTest'
corepack pnpm --dir front exec vitest run \
  features/host/route/host-notification-composer-controller.test.tsx \
  features/host/route/host-session-editor-route.test.tsx \
  features/host/ui/notifications/host-notification-composer.test.tsx
```

Expected: PASS.

- [ ] **Step 3: active docs와 CHANGELOG 갱신**

`CHANGELOG.md` `Unreleased`에는 자동 발송 제거, explicit composer, selected recipients, opt-in reminder, host feedback preview, apply receipt를 기록한다. architecture에는 다음 현재 동작을 명시한다.

```text
content mutation -> content/revision/apply receipt only
manual options -> preview -> confirm -> manual dispatch + outbox
policy ON scheduler -> automatic reminder outbox
```

`readmates.host-action-confirmation.required`가 staging/capability만 제어하고 발송을 제어하지 않는다는 migration note를 남긴다. deploy doc에는 `V42`가 forward-only이며 server image 전 DB migration 순서를 기존 runbook 형식으로 추가한다.

- [ ] **Step 4: branch-wide release-readiness review 작성**

review 범위는 `origin/main..HEAD`다. 보고서는 Blocker/High/Medium/Low/Not an issue 순서로 CHANGELOG, CI/deploy, security hygiene, architecture baseline, public safety, migration/API contract, deploy order, skipped/live evidence를 기록한다. test pass만으로 위험 0을 선언하지 않는다.

```markdown
# Host Notification Composer Integration v2 Release Readiness

## Scope
- Base: `origin/main`
- Head: final feature HEAD

## Blocker
- None, or exact file/line, impact, required action, evidence.

## High
- None, or exact file/line, impact, required action, evidence.

## Medium
- None, or exact file/line, impact, required action, evidence.

## Low
- None, or exact file/line, impact, required action, evidence.

## Not an issue
- Historical host-action rows remain readable and receive no new writes.

## Migration And API Contract
- `V42` is forward-only; list every request/response/error change.

## Evidence And Residual Risk
- Separate automated, manual, skipped, pre-deploy, and post-deploy evidence.
```

- [ ] **Step 5: canonical server/frontend gate 실행**

Run:

```bash
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest --rerun-tasks
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
```

Expected: 모두 exit 0.

- [ ] **Step 6: full release/public safety gate 실행**

Run:

```bash
./scripts/pre-push-check.sh --full --release
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: 모두 exit 0, gitleaks finding 0.

- [ ] **Step 7: diff와 private-data safety 확인**

Run:

```bash
git diff --check origin/main..HEAD
rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" \
  CHANGELOG.md docs server/src front
git status --short --branch --untracked-files=all
```

Expected: diff check와 targeted scan에 새 finding이 없고 tracked build/report artifact가 없다.

- [ ] **Step 8: Task 12 commit**

```bash
git add CHANGELOG.md docs/development/architecture.md docs/deploy/oci-backend.md \
  docs/reports/2026-07-23-host-notification-composer-integration-v2-release-readiness.md \
  front/tests/e2e front/tests/unit \
  server/src/test/kotlin/com/readmates/notification \
  server/src/test/kotlin/com/readmates/sessionrecord
git commit -m "docs: close notification composer integration"
```

## Final Review Checklist

- [ ] `git diff origin/main..HEAD -- server/src/main/resources/db/mysql/migration`에 `V42` 추가만 있고 V39~V41 수정이 없다.
- [ ] content mutation service에서 `recordNextBookPublished`, host-action `SEND`, outbox insert를 호출하지 않는다.
- [ ] session record apply가 `session_record_apply_receipts`를 사용하고 synthetic decision row를 만들지 않는다.
- [ ] old `host_action_notification_decisions` history 조회와 기존 event ledger가 깨지지 않는다.
- [ ] manual options의 revision과 mutation response의 composer revision이 event별로 일치한다.
- [ ] confirm 전에는 manual dispatch/outbox count가 0이다.
- [ ] confirm retry는 같은 event를 반환하고 resend는 별도 명시 행동이다.
- [ ] selected recipients가 active/same-club/unique/non-empty다.
- [ ] JSON/AI commit은 draft만 만들고 final apply만 composer를 연다.
- [ ] reminder는 missing/OFF policy에서 0, ON에서 dedupe된 1 event다.
- [ ] close/Escape/back/skip가 confirm API를 호출하지 않는다.
- [ ] desktop/mobile, keyboard focus, screen reader label, Korean/English wrapping을 확인했다.
- [ ] server CI, full integration, front lint/test/build/E2E, pre-push full release, public-release/gitleaks가 final HEAD에서 통과했다.
- [ ] release-readiness report가 `origin/main..HEAD` 전체를 검토하고 deploy 전/후 residual risk를 구분한다.
