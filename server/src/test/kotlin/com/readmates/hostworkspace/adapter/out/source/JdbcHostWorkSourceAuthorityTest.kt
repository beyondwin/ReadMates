package com.readmates.hostworkspace.adapter.out.source

import com.readmates.auth.application.port.`in`.GetHostMemberApprovalWorkSourceUseCase
import com.readmates.auth.application.port.`in`.ManageMemberApprovalsUseCase
import com.readmates.auth.domain.MembershipRole
import com.readmates.hostworkspace.application.model.HostWorkboxActor
import com.readmates.hostworkspace.application.model.HostWorkboxRequest
import com.readmates.hostworkspace.application.model.HostWorkboxState
import com.readmates.hostworkspace.application.port.`in`.GetHostWorkboxUseCase
import com.readmates.hostworkspace.domain.HostWorkboxOwner
import com.readmates.session.application.model.ExpectedSessionRevision
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.port.`in`.GetHostScheduleSeenWorkSourceUseCase
import com.readmates.session.application.port.`in`.HostSessionLifecycleUseCase
import com.readmates.sessionclosing.application.port.`in`.GetHostRecordClosingWorkSourceUseCase
import com.readmates.shared.security.ClubActor
import com.readmates.shared.security.ClubCapability
import com.readmates.shared.security.CurrentMember
import com.readmates.support.ReadmatesDbIntegrationTest
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.parallel.ResourceLock
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import java.time.OffsetDateTime
import java.util.UUID

@ReadmatesDbIntegrationTest
@ResourceLock("HostWorkSourceAuthorityDatabase")
class JdbcHostWorkSourceAuthorityTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val scheduleSource: GetHostScheduleSeenWorkSourceUseCase,
    @param:Autowired private val memberSource: GetHostMemberApprovalWorkSourceUseCase,
    @param:Autowired private val closingSource: GetHostRecordClosingWorkSourceUseCase,
    @param:Autowired private val memberApprovals: ManageMemberApprovalsUseCase,
    @param:Autowired private val sessionLifecycle: HostSessionLifecycleUseCase,
    @param:Autowired private val workbox: GetHostWorkboxUseCase,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val snapshotIds = mutableListOf<UUID>()

    @AfterEach
    fun cleanup() {
        cleanupSnapshots()
        val authReceiptIds =
            jdbcTemplate.queryForList(
                """
                select id from auth_public_projection_mutation_receipts
                where subject_membership_id_snapshot like '92000000-%'
                """.trimIndent(),
                String::class.java,
            )
        val hostReceiptIds =
            jdbcTemplate.queryForList(
                "select id from host_session_mutation_receipts where resource_id like '93000000-0000-0000-0000-%'",
                String::class.java,
            )
        val receiptIds = authReceiptIds + hostReceiptIds
        if (receiptIds.isNotEmpty()) {
            receiptIds.forEach { receiptId ->
                val convergenceIds =
                    jdbcTemplate.queryForList(
                        "select convergence_id from public_mutation_convergence_links where mutation_receipt_id = ?",
                        String::class.java,
                        receiptId,
                    )
                convergenceIds.forEach { convergenceId ->
                    jdbcTemplate.update("delete from public_convergence_events where convergence_id = ?", convergenceId)
                    jdbcTemplate.update("delete from public_convergence_work where convergence_id = ?", convergenceId)
                }
                jdbcTemplate.update(
                    "delete from public_mutation_convergence_links where mutation_receipt_id = ?",
                    receiptId,
                )
            }
        }
        jdbcTemplate.update(
            """
            delete from auth_public_projection_mutation_receipts
            where subject_membership_id_snapshot like '92000000-%'
            """.trimIndent(),
        )
        cleanupClosingReceipts()
        jdbcTemplate.update(
            "delete from mutation_idempotency_keys where resource_slot like '93000000-0000-0000-0000-%'",
        )
        jdbcTemplate.update(
            "delete from host_session_lifecycle_audit where session_id like '93000000-0000-0000-0000-%'",
        )
        jdbcTemplate.update("delete from notification_event_outbox where aggregate_id like '93000000-0000-0000-0000-%'")
        jdbcTemplate.update("delete from session_feedback_documents where session_id like '93000000-0000-0000-0000-%'")
        jdbcTemplate.update("delete from public_session_publications where session_id like '93000000-0000-0000-0000-%'")
        jdbcTemplate.update(
            "delete from session_publication_versions where session_id like '93000000-0000-0000-0000-%'",
        )
        jdbcTemplate.update("delete from session_participants where session_id like '91000000-0000-0000-0000-%'")
        jdbcTemplate.update("delete from sessions where id like '91000000-0000-0000-0000-%'")
        jdbcTemplate.update("delete from sessions where id like '93000000-0000-0000-0000-%'")
        jdbcTemplate.update("delete from memberships where id like '92000000-%'")
        jdbcTemplate.update("delete from users where id like '92000000-%'")
    }

    private fun cleanupSnapshots() {
        snapshotIds.forEach { snapshotId ->
            jdbcTemplate.update("delete from host_workbox_snapshots where id = ?", snapshotId.toString())
        }
    }

    private fun cleanupClosingReceipts() {
        jdbcTemplate.update(
            "delete from host_session_mutation_receipts where resource_id like '93000000-0000-0000-0000-%'",
        )
    }

    @Test
    fun `schedule source uses the authoritative evaluated availability predicate and leaks no unavailable key`() {
        insertScheduleSession("001", "DRAFT", "HOST_ONLY", 1, "2026-09-01", participant = true)
        insertScheduleSession("002", "DRAFT", "GUEST_READABLE", 1, "2026-09-01", participant = true)
        insertScheduleSession("003", "DRAFT", "GUEST_READABLE", 1, "2026-08-29", participant = true)
        insertScheduleSession("004", "DRAFT", "GUEST_READABLE", 0, "2026-09-01", participant = true)
        insertScheduleSession("005", "OPEN", "GUEST_READABLE", 1, "2026-08-29", participant = true)

        val result = scheduleSource.get(CLUB_ID, EVALUATED_AT, COMPLETED_SINCE)

        assertThat(result.items.map { it.sessionId })
            .containsExactlyInAnyOrder(sessionId("002"), sessionId("005"))
        assertThat(result.items.map { it.sessionId })
            .doesNotContain(sessionId("001"), sessionId("003"), sessionId("004"))
    }

    @Test
    fun `member completion comes from immutable approval and rejection transitions`() {
        val approved = insertViewer("001")
        val rejected = insertViewer("002")
        memberApprovals.activateViewer(hostActor(), approved)
        memberApprovals.deactivateViewer(hostActor(), rejected)
        val approvalReceiptAt = receiptTime(approved, "VIEWER_ACTIVATED")
        val rejectionReceiptAt = receiptTime(rejected, "VIEWER_REJECTED")

        jdbcTemplate.update(
            """
            update memberships
            set status = 'SUSPENDED', joined_at = null, updated_at = '2026-09-20 00:00:00'
            where id = ?
            """.trimIndent(),
            approved.toString(),
        )
        jdbcTemplate.update(
            "update memberships set updated_at = '2026-09-21 00:00:00' where id = ?",
            rejected.toString(),
        )

        val result = memberSource.get(CLUB_ID, EVALUATED_AT.plusMonths(1), COMPLETED_SINCE)
        val approvedItem = result.items.single { it.membershipId == approved }
        val rejectedItem = result.items.single { it.membershipId == rejected }

        assertThat(approvedItem.resolvedAt).isEqualTo(approvalReceiptAt)
        assertThat(approvedItem.receiptAction).isEqualTo("APPROVED")
        assertThat(approvedItem.receiptStatus).isEqualTo("ACTIVE")
        assertThat(rejectedItem.resolvedAt).isEqualTo(rejectionReceiptAt)
        assertThat(rejectedItem.receiptAction).isEqualTo("REJECTED")
        assertThat(rejectedItem.receiptStatus).isEqualTo("INACTIVE")
    }

    @Test
    fun `record source follows closing decisions and preserves the pre publish generation`() {
        val importSession = insertClosingSession("001", visibility = "MEMBER")
        val sendSession = insertClosingSession("002", visibility = "MEMBER", ready = true)
        val publishSession = insertClosingSession("003", visibility = "PUBLIC", ready = true, notified = true)
        val noneSession = insertClosingSession("004", visibility = "MEMBER", ready = true, notified = true)

        val before = closingSource.get(CLUB_ID, EVALUATED_AT, COMPLETED_SINCE)
        assertThat(before.items.filter { it.actionable }.map { it.sessionId })
            .contains(importSession, sendSession, publishSession)
            .doesNotContain(noneSession)
        val prePublishGeneration = before.items.single { it.sessionId == publishSession }.sourceGeneration

        jdbcTemplate.update(
            "update sessions set state = 'PUBLISHED', session_revision = session_revision + 1 where id = ?",
            publishSession.toString(),
        )
        jdbcTemplate.update(
            """
            update public_session_publications
            set is_public = true, site_visibility = 'PUBLIC_RECORD', published_at = ?
            where session_id = ?
            """.trimIndent(),
            EVALUATED_AT.plusHours(1).toLocalDateTime(),
            publishSession.toString(),
        )
        val receiptId = UUID.fromString("93000000-0000-0000-0000-000000009003")
        insertPublishReceipt(receiptId, publishSession, EVALUATED_AT.plusHours(1))

        val after = closingSource.get(CLUB_ID, EVALUATED_AT.plusHours(2), COMPLETED_SINCE)
        val completed = after.items.single { it.sessionId == publishSession && !it.actionable }

        assertThat(completed.sourceGeneration).isEqualTo(prePublishGeneration)
        assertThat(completed.resolvedAt).isEqualTo(EVALUATED_AT.plusHours(1))
        assertThat(completed.receiptId).isEqualTo(receiptId)
        assertThat(completed.receiptState).isEqualTo("PUBLISHED")
    }

    @Test
    fun `record completion deduplicates actual publish and later no op receipt for one workbox snapshot key`() {
        val sessionId = insertClosingSession("005", visibility = "PUBLIC", ready = true, notified = true)
        val prePublishGeneration =
            closingSource
                .get(CLUB_ID, EVALUATED_AT, COMPLETED_SINCE)
                .items
                .single { it.sessionId == sessionId }
                .sourceGeneration

        sessionLifecycle.publish(publishCommand(sessionId, 10, "record-authority-publish-actual"))
        sessionLifecycle.publish(publishCommand(sessionId, 11, "record-authority-publish-no-op"))

        val receiptRows =
            jdbcTemplate.queryForList(
                """
                select id, created_at from host_session_mutation_receipts
                where resource_id = ? and operation = 'SESSION_PUBLISH'
                order by created_at, id
                """.trimIndent(),
                sessionId.toString(),
            )
        assertThat(receiptRows).hasSize(2)
        val firstReceiptAt =
            jdbcTemplate
                .queryForObject(
                    "select created_at from host_session_mutation_receipts where id = ?",
                    java.time.LocalDateTime::class.java,
                    receiptRows.first()["id"],
                )!!
                .atOffset(java.time.ZoneOffset.UTC)

        val completed =
            closingSource
                .get(CLUB_ID, OffsetDateTime.now(), COMPLETED_SINCE)
                .items
                .filter { it.sessionId == sessionId && !it.actionable }
        assertThat(completed).hasSize(1)
        assertThat(completed.single().sourceGeneration).isEqualTo(prePublishGeneration)
        assertThat(completed.single().receiptId.toString()).isEqualTo(receiptRows.first()["id"])
        assertThat(completed.single().resolvedAt).isEqualTo(firstReceiptAt)

        val page =
            workbox.get(
                HostWorkboxRequest(
                    actor = HostWorkboxActor(HostWorkboxOwner(CLUB_ID, HOST_MEMBERSHIP_ID), activeHost = true),
                    state = HostWorkboxState.COMPLETED,
                    limit = 100,
                    continuation = null,
                ),
            )
        snapshotIds += page.snapshotId
        assertThat(page.items.map { it.key }).doesNotHaveDuplicates()
    }

    private fun insertScheduleSession(
        suffix: String,
        state: String,
        accessScope: String,
        participantSetRevision: Long,
        date: String,
        participant: Boolean,
    ) {
        val id = sessionId(suffix)
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, location_label, question_deadline_at, state,
              visibility, access_scope, participant_set_revision, schedule_revision
            ) values (?, ?, ?, 'Schedule authority', 'Book', 'Author', ?, '19:30:00', '21:30:00',
                      'Online', ?, ?, ?, ?, ?, 7)
            """.trimIndent(),
            id.toString(),
            CLUB_ID.toString(),
            9100 + suffix.toInt(),
            date,
            "$date 12:00:00",
            state,
            if (accessScope == "GUEST_READABLE") "MEMBER" else "HOST_ONLY",
            accessScope,
            participantSetRevision,
        )
        if (participant) {
            jdbcTemplate.update(
                """
                insert into session_participants (
                  id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status
                ) values (uuid(), ?, ?, ?, 'NO_RESPONSE', 'UNKNOWN', 'ACTIVE')
                """.trimIndent(),
                CLUB_ID.toString(),
                id.toString(),
                HOST_MEMBERSHIP_ID.toString(),
            )
        }
    }

    private fun insertViewer(suffix: String): UUID {
        val userId = UUID.fromString("92000000-0000-0000-0000-${suffix.padStart(12, '0')}")
        val membershipId = UUID.fromString("92000000-0000-0000-1000-${suffix.padStart(12, '0')}")
        jdbcTemplate.update(
            "insert into users (id, email, name, short_name) values (?, ?, 'Viewer', 'Viewer')",
            userId.toString(),
            "work-source-$suffix@example.com",
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key, created_at)
            values (?, ?, ?, 'MEMBER', 'VIEWER', null, ?, 'apple-green-book', '2026-08-28 00:00:00')
            """.trimIndent(),
            membershipId.toString(),
            CLUB_ID.toString(),
            userId.toString(),
            "Viewer $suffix",
        )
        return membershipId
    }

    private fun receiptTime(
        membershipId: UUID,
        operation: String,
    ): OffsetDateTime =
        jdbcTemplate
            .queryForObject(
                """
                select created_at from auth_public_projection_mutation_receipts
                where subject_membership_id_snapshot = ? and operation = ?
                order by created_at, id limit 1
                """.trimIndent(),
                java.time.LocalDateTime::class.java,
                membershipId.toString(),
                operation,
            )!!
            .atOffset(java.time.ZoneOffset.UTC)

    private fun insertClosingSession(
        suffix: String,
        visibility: String,
        ready: Boolean = false,
        notified: Boolean = false,
    ): UUID {
        val id = closingSessionId(suffix)
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, location_label, question_deadline_at, state,
              visibility, access_scope, session_revision, exposure_revision,
              participant_set_revision, schedule_revision
            ) values (?, ?, ?, 'Closing authority', 'Book', 'Author', '2026-08-28',
                      '19:30:00', '21:30:00', 'Online', '2026-08-28 12:00:00', 'CLOSED',
                      ?, 'GUEST_READABLE', 10, 4, 3, 7)
            """.trimIndent(),
            id.toString(),
            CLUB_ID.toString(),
            9300 + suffix.toInt(),
            visibility,
        )
        jdbcTemplate.update(
            "insert into session_publication_versions (session_id, publication_revision) values (?, 5)",
            id.toString(),
        )
        if (ready) insertReadyClosingArtifacts(id, visibility)
        if (notified) insertClosingNotification(id)
        return id
    }

    private fun insertReadyClosingArtifacts(
        sessionId: UUID,
        visibility: String,
    ) {
        jdbcTemplate.update(
            """
            insert into public_session_publications (
              id, club_id, session_id, public_summary, visibility, site_visibility, is_public
            ) values (uuid(), ?, ?, 'Ready summary', ?, ?, false)
            """.trimIndent(),
            CLUB_ID.toString(),
            sessionId.toString(),
            visibility,
            if (visibility == "PUBLIC") "PUBLIC_RECORD" else "HIDDEN",
        )
        jdbcTemplate.update(
            """
            insert into session_feedback_documents (
              id, club_id, session_id, version, source_text, file_name, content_type, file_size
            ) values (uuid(), ?, ?, 1, 'safe', 'closing.md', 'text/markdown', 4)
            """.trimIndent(),
            CLUB_ID.toString(),
            sessionId.toString(),
        )
    }

    private fun insertClosingNotification(sessionId: UUID) {
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, aggregate_type, aggregate_id, event_type, payload_json, status,
              kafka_key, attempt_count, next_attempt_at, published_at, dedupe_key, created_at, updated_at
            ) values (uuid(), ?, 'SESSION', ?, 'FEEDBACK_DOCUMENT_PUBLISHED', '{}', 'PUBLISHED',
                      ?, 0, utc_timestamp(6), utc_timestamp(6), ?, utc_timestamp(6), utc_timestamp(6))
            """.trimIndent(),
            CLUB_ID.toString(),
            sessionId.toString(),
            sessionId.toString(),
            "work-source-$sessionId",
        )
    }

    private fun insertPublishReceipt(
        receiptId: UUID,
        sessionId: UUID,
        createdAt: OffsetDateTime,
    ) {
        jdbcTemplate.update(
            """
            insert into host_session_mutation_receipts (
              id, club_id, actor_membership_id, operation, resource_id,
              session_revision, exposure_revision, participant_set_revision,
              record_draft_revision, live_record_revision, publication_revision, schedule_revision,
              notification_decision, dispatch_receipt_id, created_at
            ) values (?, ?, ?, 'SESSION_PUBLISH', ?, 11, 4, 3, null, null, 5, 7,
                      'NOT_SENT', null, ?)
            """.trimIndent(),
            receiptId.toString(),
            CLUB_ID.toString(),
            HOST_MEMBERSHIP_ID.toString(),
            sessionId.toString(),
            createdAt.toLocalDateTime(),
        )
    }

    private fun publishCommand(
        sessionId: UUID,
        expectedRevision: Long,
        idempotencyKey: String,
    ) = HostSessionIdCommand(
        host = hostMember(),
        sessionId = sessionId,
        expectedSessionRevision = ExpectedSessionRevision(expectedRevision),
        idempotencyKey = idempotencyKey,
    )

    private fun hostActor() =
        ClubActor(
            userId = HOST_USER_ID,
            membershipId = HOST_MEMBERSHIP_ID,
            clubId = CLUB_ID,
            clubSlug = "reading-sai",
            capabilities = setOf(ClubCapability.MANAGE_MEMBERS),
        )

    private fun hostMember() =
        CurrentMember(
            userId = HOST_USER_ID,
            membershipId = HOST_MEMBERSHIP_ID,
            clubId = CLUB_ID,
            clubSlug = "reading-sai",
            email = "host@example.com",
            displayName = "Host",
            accountName = "Host",
            role = MembershipRole.HOST,
        )

    private fun sessionId(suffix: String) = UUID.fromString("91000000-0000-0000-0000-${suffix.padStart(12, '0')}")

    private fun closingSessionId(suffix: String) =
        UUID.fromString("93000000-0000-0000-0000-${suffix.padStart(12, '0')}")

    companion object {
        private val CLUB_ID = UUID.fromString("00000000-0000-0000-0000-000000000001")
        private val HOST_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000101")
        private val HOST_MEMBERSHIP_ID = UUID.fromString("00000000-0000-0000-0000-000000000201")
        private val EVALUATED_AT = OffsetDateTime.parse("2026-08-30T09:00:00Z")
        private val COMPLETED_SINCE = EVALUATED_AT.minusDays(30)
    }
}
