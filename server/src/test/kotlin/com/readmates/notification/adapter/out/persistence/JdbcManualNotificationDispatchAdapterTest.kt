package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.ManualNotificationAudience
import com.readmates.notification.application.model.ManualNotificationRequestedChannels
import com.readmates.notification.application.model.ManualNotificationSelection
import com.readmates.notification.application.model.ManualNotificationSendMode
import com.readmates.notification.application.model.NotificationDispatchSource
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.model.NotificationManualDispatchPayload
import com.readmates.notification.application.port.out.ManualNotificationConfirmInsertStatus
import com.readmates.notification.application.port.out.ManualNotificationTargetSnapshot
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.paging.PageRequest
import com.readmates.support.MySqlTestContainer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

private const val CLEANUP_MANUAL_DISPATCH_SQL = """
    delete from notification_manual_dispatches where club_id = '00000000-0000-0000-0000-000000000001';
    delete from notification_manual_dispatch_previews where club_id = '00000000-0000-0000-0000-000000000001';
    delete from notification_deliveries where club_id = '00000000-0000-0000-0000-000000000001';
    delete from member_notifications where club_id = '00000000-0000-0000-0000-000000000001';
    delete from notification_event_outbox
    where club_id = '00000000-0000-0000-0000-000000000001'
      and (dedupe_key like 'manual:%' or dedupe_key like 'manual-dispatch-test-%');
"""

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(statements = [CLEANUP_MANUAL_DISPATCH_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_MANUAL_DISPATCH_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
class JdbcManualNotificationDispatchAdapterTest(
    @param:Autowired private val adapter: JdbcManualNotificationDispatchAdapter,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val hostMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000201")
    private val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")

    @Test
    fun `findSessionContext returns session metadata and feedback document state`() {
        val context = adapter.findSessionContext(clubId, sessionId)

        assertThat(context).isNotNull
        assertThat(context!!.sessionNumber).isGreaterThan(0)
        assertThat(context.bookTitle).isNotBlank()
        assertThat(context.feedbackDocumentUploaded).isTrue()
    }

    @Test
    fun `previewTargets applies audience edits and email preference counts`() {
        disablePreference("member1@example.com")
        val selection = selection(
            excludedMembershipIds = listOf(membershipId("member2@example.com")),
            includedMembershipIds = emptyList(),
        )

        val snapshot = adapter.previewTargets(clubId, selection)

        assertThat(snapshot.finalTargetCount).isGreaterThan(0)
        assertThat(snapshot.excludedCount).isEqualTo(1)
        assertThat(snapshot.emailSkippedByPreferenceCount).isGreaterThanOrEqualTo(1)
        assertThat(snapshot.targetMembershipIds).hasSize(snapshot.finalTargetCount)
        assertThat(snapshot.inAppMembershipIds).hasSize(snapshot.inAppEligibleCount)
        assertThat(snapshot.emailMembershipIds).hasSize(snapshot.emailEligibleCount)
        assertThat(snapshot.targetMembershipIds).doesNotContain(membershipId("member2@example.com"))
    }

    @Test
    fun `previewTargets freezes only email eligible ids for email only requests`() {
        disablePreference("member1@example.com")
        val snapshot = adapter.previewTargets(
            clubId,
            selection(requestedChannels = ManualNotificationRequestedChannels.EMAIL),
        )

        assertThat(snapshot.inAppMembershipIds).isEmpty()
        assertThat(snapshot.emailMembershipIds).hasSize(snapshot.emailEligibleCount)
        assertThat(snapshot.targetMembershipIds).hasSize(snapshot.finalTargetCount)
    }

    @Test
    fun `listMembers filters by display name or email with stable cursor`() {
        val page = adapter.listMembers(clubId, sessionId, "member", PageRequest.cursor(1, null, defaultLimit = 50, maxLimit = 100))

        assertThat(page.items).hasSize(1)
        assertThat(page.nextCursor).isNotBlank()

        val next = adapter.listMembers(clubId, sessionId, "member", PageRequest.cursor(10, page.nextCursor, defaultLimit = 50, maxLimit = 100))
        assertThat(next.items.map { it.membershipId }).doesNotContain(page.items.single().membershipId)
    }

    @Test
    fun `validateMembershipEdits rejects out of club ids`() {
        val otherClubMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000901")

        assertThat(adapter.validateMembershipEdits(clubId, setOf(otherClubMembershipId))).isFalse()
    }

    @Test
    fun `listDispatches returns masked audit rows`() {
        val stored = insertManualDispatchFixture()

        val page = adapter.listDispatches(
            clubId,
            sessionId,
            NotificationEventType.SESSION_REMINDER_DUE,
            PageRequest.cursor(10, null, defaultLimit = 50, maxLimit = 100),
        )

        assertThat(page.items.map { it.manualDispatchId }).contains(stored.manualDispatchId)
        assertThat(page.items.single { it.manualDispatchId == stored.manualDispatchId }.requestedBy).contains("***@")
    }

    @Test
    fun `insertPreview and findPreview round trip host scoped preview`() {
        val expiresAt = OffsetDateTime.of(2026, 5, 13, 9, 10, 0, 0, ZoneOffset.UTC)

        val id = adapter.insertPreview(clubId, hostMembershipId, "a".repeat(64), expiresAt)
        val record = adapter.findPreview(id, clubId, hostMembershipId)

        assertThat(record!!.selectionHash).isEqualTo("a".repeat(64))
        assertThat(record.expiresAt).isEqualTo(expiresAt)
    }

    @Test
    fun `insertManualDispatch writes event outbox and audit row`() {
        val dispatchId = UUID.nameUUIDFromBytes("manual-dispatch".toByteArray())
        val payload = NotificationEventPayload(
            sessionId = sessionId,
            sessionNumber = 7,
            bookTitle = "Example Book",
            manualDispatch = NotificationManualDispatchPayload(
                id = dispatchId,
                source = NotificationDispatchSource.MANUAL,
                requestedByMembershipId = hostMembershipId,
                requestedChannels = ManualNotificationRequestedChannels.BOTH,
                audience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
                resend = true,
                sendMode = ManualNotificationSendMode.NOW,
            ),
        )

        val stored = adapter.insertManualDispatch(
            clubId = clubId,
            hostMembershipId = hostMembershipId,
            selection = selection(),
            payload = payload,
            targetSnapshot = ManualNotificationTargetSnapshot(3, 0, 0, 3, 3, 2, 1, 0),
            resend = true,
        )

        assertThat(stored.manualDispatchId).isEqualTo(dispatchId)
        assertThat(eventCount(stored.eventId)).isEqualTo(1)
        assertThat(manualDispatchCount(dispatchId)).isEqualTo(1)
    }

    @Test
    fun `confirmManualDispatch consumes preview once and returns existing dispatch on retry`() {
        val previewId = adapter.insertPreview(
            clubId,
            hostMembershipId,
            "a".repeat(64),
            OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(10),
        )
        val snapshot = adapter.previewTargets(clubId, selection())
        val payload = NotificationEventPayload(
            sessionId = sessionId,
            sessionNumber = 7,
            bookTitle = "Example Book",
            manualDispatch = NotificationManualDispatchPayload(
                id = UUID.nameUUIDFromBytes("manual-dispatch-idempotent".toByteArray()),
                source = NotificationDispatchSource.MANUAL,
                requestedByMembershipId = hostMembershipId,
                requestedChannels = ManualNotificationRequestedChannels.BOTH,
                audience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
                targetMembershipIds = snapshot.targetMembershipIds,
                inAppMembershipIds = snapshot.inAppMembershipIds,
                emailMembershipIds = snapshot.emailMembershipIds,
                resend = false,
                sendMode = ManualNotificationSendMode.NOW,
            ),
        )

        val first = adapter.confirmManualDispatch(
            previewId = previewId,
            clubId = clubId,
            hostMembershipId = hostMembershipId,
            selectionHash = "a".repeat(64),
            now = OffsetDateTime.now(ZoneOffset.UTC),
            selection = selection(),
            payload = payload,
            targetSnapshot = snapshot,
            resend = false,
        )
        val second = adapter.confirmManualDispatch(
            previewId = previewId,
            clubId = clubId,
            hostMembershipId = hostMembershipId,
            selectionHash = "a".repeat(64),
            now = OffsetDateTime.now(ZoneOffset.UTC),
            selection = selection(),
            payload = payload.copy(
                manualDispatch = payload.manualDispatch!!.copy(id = UUID.randomUUID()),
            ),
            targetSnapshot = snapshot,
            resend = false,
        )

        assertThat(first!!.status).isEqualTo(ManualNotificationConfirmInsertStatus.CREATED)
        assertThat(second!!.status).isEqualTo(ManualNotificationConfirmInsertStatus.ALREADY_CONSUMED)
        assertThat(first.eventId).isEqualTo(second.eventId)
        assertThat(eventCount(first.eventId)).isEqualTo(1)
        assertThat(previewManualDispatchCount(previewId)).isEqualTo(1)
    }

    private fun insertManualDispatchFixture() =
        adapter.insertManualDispatch(
            clubId = clubId,
            hostMembershipId = hostMembershipId,
            selection = selection(),
            payload = NotificationEventPayload(
                sessionId = sessionId,
                sessionNumber = 7,
                bookTitle = "Example Book",
                manualDispatch = NotificationManualDispatchPayload(
                    id = UUID.nameUUIDFromBytes("manual-dispatch-list".toByteArray()),
                    source = NotificationDispatchSource.MANUAL,
                    requestedByMembershipId = hostMembershipId,
                    requestedChannels = ManualNotificationRequestedChannels.BOTH,
                    audience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
                    resend = true,
                    sendMode = ManualNotificationSendMode.NOW,
                ),
            ),
            targetSnapshot = ManualNotificationTargetSnapshot(3, 0, 0, 3, 3, 2, 1, 0),
            resend = true,
        )

    private fun selection(
        requestedChannels: ManualNotificationRequestedChannels = ManualNotificationRequestedChannels.BOTH,
        excludedMembershipIds: List<UUID> = emptyList(),
        includedMembershipIds: List<UUID> = emptyList(),
    ) = ManualNotificationSelection(
        sessionId = sessionId,
        eventType = NotificationEventType.SESSION_REMINDER_DUE,
        audience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
        requestedChannels = requestedChannels,
        excludedMembershipIds = excludedMembershipIds,
        includedMembershipIds = includedMembershipIds,
        sendMode = ManualNotificationSendMode.NOW,
    )

    private fun disablePreference(email: String) {
        val membershipId = membershipId(email)
        jdbcTemplate.update(
            """
            insert into notification_preferences (membership_id, club_id, email_enabled, session_reminder_due_enabled)
            values (?, ?, false, false)
            on duplicate key update email_enabled = false, session_reminder_due_enabled = false
            """.trimIndent(),
            membershipId.toString(),
            clubId.toString(),
        )
    }

    private fun membershipId(email: String): UUID =
        UUID.fromString(
            jdbcTemplate.queryForObject(
                """
                select memberships.id
                from memberships
                join users on users.id = memberships.user_id
                where memberships.club_id = ?
                  and users.email = ?
                """.trimIndent(),
                String::class.java,
                clubId.toString(),
                email,
            )!!,
        )

    private fun eventCount(eventId: UUID): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from notification_event_outbox where id = ?",
            Int::class.java,
            eventId.toString(),
        ) ?: 0

    private fun manualDispatchCount(dispatchId: UUID): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from notification_manual_dispatches where id = ?",
            Int::class.java,
            dispatchId.toString(),
        ) ?: 0

    private fun previewManualDispatchCount(previewId: UUID): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from notification_manual_dispatches where preview_id = ?",
            Int::class.java,
            previewId.toString(),
        ) ?: 0

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
