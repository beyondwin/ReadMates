package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryPort
import com.readmates.notification.application.service.NotificationDeliveryProcessingService
import com.readmates.notification.application.service.ReadmatesOperationalMetrics
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.support.MySqlTestContainer
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.Collections
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

private const val CLEANUP_NOTIFICATION_DELIVERY_SQL = """
    delete from member_notifications
    where club_id = '00000000-0000-0000-0000-000000000001';
    delete from notification_deliveries
    where club_id = '00000000-0000-0000-0000-000000000001';
    delete from notification_event_outbox
    where club_id = '00000000-0000-0000-0000-000000000001';
    delete from notification_preferences
    where club_id = '00000000-0000-0000-0000-000000000001';
    delete session_participants
    from session_participants
    join memberships on memberships.id = session_participants.membership_id
      and memberships.club_id = session_participants.club_id
    join users on users.id = memberships.user_id
    where session_participants.club_id = '00000000-0000-0000-0000-000000000001'
      and users.email like 'joined.after.event.%@example.com';
    delete memberships
    from memberships
    join users on users.id = memberships.user_id
    where memberships.club_id = '00000000-0000-0000-0000-000000000001'
      and users.email like 'joined.after.event.%@example.com';
    delete from users
    where email like 'joined.after.event.%@example.com';
"""

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Sql(
    statements = [CLEANUP_NOTIFICATION_DELIVERY_SQL],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [CLEANUP_NOTIFICATION_DELIVERY_SQL],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
class JdbcNotificationDeliveryAdapterTest(
    @param:Autowired private val deliveryAdapter: JdbcNotificationDeliveryAdapter,
    @param:Autowired private val memberNotificationAdapter: JdbcMemberNotificationAdapter,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val eventId = UUID.fromString("00000000-0000-0000-0000-000000009701")
    private val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")

    @Test
    fun `persistPlannedDeliveries creates idempotent in app notifications and skipped email rows`() {
        insertEventOutboxRow()
        disableMemberPreference("member1@example.com", "feedback_document_published_enabled")
        val member1 = membershipIdForEmail("member1@example.com")
        val member2 = membershipIdForEmail("member2@example.com")

        val first = deliveryAdapter.persistPlannedDeliveries(message())
        val duplicate = deliveryAdapter.persistPlannedDeliveries(message())

        assertThat(first).hasSize(deliveryRows())
        assertThat(duplicate).hasSize(first.size)
        assertThat(deliveryRows()).isEqualTo(6)
        assertThat(memberNotificationRows()).isEqualTo(3)
        assertThat(deliveryRowsFor(member1, NotificationChannel.IN_APP, NotificationDeliveryStatus.SENT)).isEqualTo(1)
        assertThat(deliveryRowsFor(member1, NotificationChannel.EMAIL, NotificationDeliveryStatus.SKIPPED)).isEqualTo(1)
        assertThat(deliveryRowsFor(member2, NotificationChannel.IN_APP, NotificationDeliveryStatus.SENT)).isZero()
        assertThat(deliveryRowsFor(member2, NotificationChannel.EMAIL, NotificationDeliveryStatus.PENDING)).isZero()

        val member1Notifications = memberNotificationAdapter.listForMembership(clubId, member1, limit = 10)
        assertThat(member1Notifications).hasSize(1)
        assertThat(member1Notifications.single().title).isEqualTo("피드백 문서가 올라왔습니다")
        assertThat(member1Notifications.single().deepLinkPath)
            .isEqualTo("/clubs/reading-sai/app/archive?view=report")
        assertThat(memberNotificationAdapter.unreadCount(clubId, member1)).isEqualTo(1)
    }

    @Test
    fun `persistPlannedDeliveries throws when event outbox row is missing`() {
        val missingEventId = UUID.fromString("00000000-0000-0000-0000-000000009799")

        assertThatThrownBy {
            deliveryAdapter.persistPlannedDeliveries(message(eventId = missingEventId))
        }
            .isInstanceOf(MissingNotificationEventOutboxException::class.java)
            .hasMessageContaining("Notification event outbox row not found")
            .hasMessageContaining(missingEventId.toString())

        assertThat(deliveryRows(missingEventId)).isZero()
        assertThat(memberNotificationRows(missingEventId)).isZero()
    }

    @Test
    fun `persistPlannedDeliveries plans from persisted outbox event when Kafka message fields are stale`() {
        insertEventOutboxRow()

        val deliveries = deliveryAdapter.persistPlannedDeliveries(
            message(
                eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
                aggregateId = UUID.fromString("00000000-0000-0000-0000-000000009798"),
                payload = NotificationEventPayload(
                    sessionId = UUID.fromString("00000000-0000-0000-0000-000000009797"),
                    sessionNumber = 99,
                    bookTitle = "Kafka payload book",
                ),
            ),
        )

        assertThat(deliveries).hasSize(6)
        assertThat(deliveries.filter { it.channel == NotificationChannel.EMAIL })
            .extracting<String?> { it.subject }
            .containsOnly("피드백 문서가 올라왔습니다")
        assertThat(deliveries.filter { it.channel == NotificationChannel.EMAIL })
            .extracting<String?> { it.bodyText }
            .allSatisfy {
                assertThat(it).contains("1회차 팩트풀니스")
                assertThat(it).doesNotContain("99회차")
                assertThat(it).doesNotContain("Kafka payload book")
            }

        val member1 = membershipIdForEmail("member1@example.com")
        val member1Notifications = memberNotificationAdapter.listForMembership(clubId, member1, limit = 10)
        assertThat(member1Notifications.single().title).isEqualTo("피드백 문서가 올라왔습니다")
        assertThat(member1Notifications.single().body).contains("1회차 팩트풀니스")
    }

    @Test
    fun `persistPlannedDeliveries replays existing event delivery snapshot without adding newly joined recipient`() {
        insertEventOutboxRow()
        val member1 = membershipIdForEmail("member1@example.com")

        val first = deliveryAdapter.persistPlannedDeliveries(message())
        val newlyJoinedMember = insertActiveMember("joined.after.event")
        try {
            insertAttendedParticipant(newlyJoinedMember.membershipId)
            val duplicate = deliveryAdapter.persistPlannedDeliveries(message())

            assertThat(duplicate).hasSize(first.size)
            assertThat(duplicate.map { it.recipientMembershipId }).doesNotContain(newlyJoinedMember.membershipId)
            assertThat(
                deliveryRowsFor(newlyJoinedMember.membershipId, NotificationChannel.IN_APP, NotificationDeliveryStatus.SENT),
            ).isZero()
            assertThat(
                deliveryRowsFor(newlyJoinedMember.membershipId, NotificationChannel.EMAIL, NotificationDeliveryStatus.PENDING),
            ).isZero()

            val existingEmailDelivery = duplicate.single {
                it.recipientMembershipId == member1 && it.channel == NotificationChannel.EMAIL
            }
            assertThat(existingEmailDelivery.recipientEmail).isEqualTo("member1@example.com")
            assertThat(existingEmailDelivery.subject).isEqualTo("피드백 문서가 올라왔습니다")
            assertThat(existingEmailDelivery.bodyText).contains("팩트풀니스")
        } finally {
            deleteInsertedMember(newlyJoinedMember)
        }
    }

    @Test
    fun `persistPlannedDeliveries excludes viewer memberships from planned recipients`() {
        val viewer = insertMember("joined.after.event.viewer", status = "VIEWER")
        try {
            insertAttendedParticipant(viewer.membershipId)

            val feedbackEventId = UUID.fromString("00000000-0000-0000-0000-000000009711")
            insertEventOutboxRow(feedbackEventId, NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED)
            deliveryAdapter.persistPlannedDeliveries(message(feedbackEventId, NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED))

            val reviewEventId = UUID.fromString("00000000-0000-0000-0000-000000009712")
            insertEventOutboxRow(reviewEventId, NotificationEventType.REVIEW_PUBLISHED)
            deliveryAdapter.persistPlannedDeliveries(
                message(
                    eventId = reviewEventId,
                    eventType = NotificationEventType.REVIEW_PUBLISHED,
                    authorMembershipId = membershipIdForEmail("member1@example.com"),
                ),
            )

            val nextBookEventId = UUID.fromString("00000000-0000-0000-0000-000000009713")
            try {
                updateSessionState("DRAFT")
                insertEventOutboxRow(nextBookEventId, NotificationEventType.NEXT_BOOK_PUBLISHED)
                deliveryAdapter.persistPlannedDeliveries(message(nextBookEventId, NotificationEventType.NEXT_BOOK_PUBLISHED))
            } finally {
                updateSessionState("PUBLISHED")
            }

            assertThat(deliveryRowsFor(feedbackEventId, viewer.membershipId)).isZero()
            assertThat(deliveryRowsFor(reviewEventId, viewer.membershipId)).isZero()
            assertThat(deliveryRowsFor(nextBookEventId, viewer.membershipId)).isZero()
        } finally {
            deleteInsertedMember(viewer)
        }
    }

    @Test
    fun `claimEmailDelivery leases only due email rows and mark sent requires active lease`() {
        insertEventOutboxRow()
        deliveryAdapter.persistPlannedDeliveries(message())
        val emailDeliveryId = pendingEmailDeliveryIdFor("member1@example.com")

        val claimed = deliveryAdapter.claimEmailDelivery(emailDeliveryId)
        val secondClaim = deliveryAdapter.claimEmailDelivery(emailDeliveryId)
        val staleMarked = deliveryAdapter.markDeliverySent(emailDeliveryId, claimed!!.lockedAt.minusSeconds(1))
        val activeMarked = deliveryAdapter.markDeliverySent(emailDeliveryId, claimed.lockedAt)

        assertThat(claimed.recipientEmail).isEqualTo("member1@example.com")
        assertThat(claimed.subject).isEqualTo("피드백 문서가 올라왔습니다")
        assertThat(claimed.bodyText).contains("팩트풀니스")
        assertThat(secondClaim).isNull()
        assertThat(staleMarked).isFalse()
        assertThat(activeMarked).isTrue()
        assertThat(statusFor(emailDeliveryId)).isEqualTo("SENT")
        assertThat(deliveryAdapter.findDeliveryStatus(emailDeliveryId)).isEqualTo(NotificationDeliveryStatus.SENT)
    }

    @Test
    fun `processing service concurrent claims do not send duplicate email delivery recipients`() {
        insertEventOutboxRow()
        deliveryAdapter.persistPlannedDeliveries(message())
        val mailPort = RecordingMailPort()
        val service = NotificationDeliveryProcessingService(
            notificationDeliveryPort = deliveryAdapter,
            mailDeliveryPort = mailPort,
            metrics = ReadmatesOperationalMetrics(SimpleMeterRegistry()),
            maxAttempts = 5,
            deliveryEnabled = true,
        )

        val processedCounts = runConcurrently(workerCount = 2) {
            service.processPending(limit = 2)
        }

        assertThat(processedCounts.sum()).isEqualTo(3)
        assertThat(mailPort.recipients()).hasSize(3).doesNotHaveDuplicates()
        assertThat(emailDeliveryRowsByStatus(NotificationDeliveryStatus.SENT)).isEqualTo(3)
    }

    @Test
    fun `claimEmailDelivery renders email copy from immutable event payload`() {
        insertEventOutboxRow()
        deliveryAdapter.persistPlannedDeliveries(message())
        val emailDeliveryId = pendingEmailDeliveryIdFor("member1@example.com")

        val claimed = withTemporarySessionCopy(number = 99, bookTitle = "변경된 책") {
            deliveryAdapter.claimEmailDelivery(emailDeliveryId)!!
        }

        assertThat(claimed.subject).isEqualTo("피드백 문서가 올라왔습니다")
        assertThat(claimed.bodyText).contains("1회차 팩트풀니스")
        assertThat(claimed.bodyText).doesNotContain("99회차")
        assertThat(claimed.bodyText).doesNotContain("변경된 책")
    }

    @Test
    fun `findDeliveryStatus exposes failed email row that is not due for retry`() {
        insertEventOutboxRow()
        deliveryAdapter.persistPlannedDeliveries(message())
        val emailDeliveryId = pendingEmailDeliveryIdFor("member1@example.com")
        val claimed = deliveryAdapter.claimEmailDelivery(emailDeliveryId)!!

        val failed = deliveryAdapter.markDeliveryFailed(
            id = emailDeliveryId,
            lockedAt = claimed.lockedAt,
            error = "smtp rejected",
            nextAttemptDelayMinutes = 60,
        )
        val notDueClaim = deliveryAdapter.claimEmailDelivery(emailDeliveryId)

        assertThat(failed).isTrue()
        assertThat(notDueClaim).isNull()
        assertThat(deliveryAdapter.findDeliveryStatus(emailDeliveryId)).isEqualTo(NotificationDeliveryStatus.FAILED)
    }

    @Test
    fun `markRead and markAllRead are scoped by club and membership`() {
        insertEventOutboxRow()
        deliveryAdapter.persistPlannedDeliveries(message())
        val member1 = membershipIdForEmail("member1@example.com")
        val notification = memberNotificationAdapter.listForMembership(clubId, member1, limit = 10).single()

        val marked = memberNotificationAdapter.markRead(clubId, member1, notification.id)
        val unreadAfterOne = memberNotificationAdapter.unreadCount(clubId, member1)
        val markedAll = memberNotificationAdapter.markAllRead(clubId, member1)

        assertThat(marked).isTrue()
        assertThat(unreadAfterOne).isZero()
        assertThat(markedAll).isZero()
    }

    private fun insertEventOutboxRow(
        eventId: UUID = this.eventId,
        eventType: NotificationEventType = NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
    ) {
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id,
              club_id,
              event_type,
              aggregate_type,
              aggregate_id,
              payload_json,
              status,
              kafka_topic,
              kafka_key,
              dedupe_key
            ) values (?, ?, ?, 'SESSION', ?, ?, 'PUBLISHED', 'readmates.notification.events.v1', ?, ?)
            """.trimIndent(),
            eventId.toString(),
            clubId.toString(),
            eventType.name,
            sessionId.toString(),
            """
            {
              "sessionId": "$sessionId",
              "sessionNumber": 1,
              "bookTitle": "팩트풀니스",
              "documentVersion": null,
              "authorMembershipId": null,
              "targetDate": null
            }
            """.trimIndent(),
            clubId.toString(),
            "delivery-adapter-test-$eventId",
        )
    }

    private fun message(
        eventId: UUID = this.eventId,
        eventType: NotificationEventType = NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
        authorMembershipId: UUID? = null,
        aggregateId: UUID = sessionId,
        payload: NotificationEventPayload = NotificationEventPayload(
            sessionId = sessionId,
            sessionNumber = 1,
            bookTitle = "팩트풀니스",
            authorMembershipId = authorMembershipId,
        ),
    ): NotificationEventMessage =
        NotificationEventMessage(
            eventId = eventId,
            clubId = clubId,
            eventType = eventType,
            aggregateType = "SESSION",
            aggregateId = aggregateId,
            occurredAt = OffsetDateTime.of(2026, 4, 29, 3, 0, 0, 0, ZoneOffset.UTC),
            payload = payload,
        )

    private fun disableMemberPreference(email: String, column: String) {
        val membership = membershipForEmail(email)
        jdbcTemplate.update(
            """
            insert into notification_preferences (membership_id, club_id)
            values (?, ?)
            on duplicate key update updated_at = utc_timestamp(6)
            """.trimIndent(),
            membership.first.toString(),
            membership.second.toString(),
        )
        jdbcTemplate.update(
            """
            update notification_preferences
            set $column = false
            where membership_id = ?
              and club_id = ?
            """.trimIndent(),
            membership.first.toString(),
            membership.second.toString(),
        )
    }

    private fun insertActiveMember(emailPrefix: String): InsertedMember {
        return insertMember(emailPrefix, status = "ACTIVE")
    }

    private fun insertMember(emailPrefix: String, status: String): InsertedMember {
        val idSuffix = UUID.randomUUID().toString()
        val userId = UUID.randomUUID()
        val membershipId = UUID.randomUUID()
        val email = "$emailPrefix.$idSuffix@example.com"
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, auth_provider)
            values (?, ?, ?, 'Joined After Event', ?, 'GOOGLE')
            """.trimIndent(),
            userId.toString(),
            "google-$idSuffix",
            email,
            "joined-${idSuffix.take(8)}",
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name)
            values (?, ?, ?, 'MEMBER', ?, utc_timestamp(6), ?)
            """.trimIndent(),
            membershipId.toString(),
            clubId.toString(),
            userId.toString(),
            status,
            "joined-${idSuffix.take(8)}",
        )
        return InsertedMember(userId = userId, membershipId = membershipId)
    }

    private fun insertAttendedParticipant(membershipId: UUID) {
        jdbcTemplate.update(
            """
            insert into session_participants (id, club_id, session_id, membership_id, rsvp_status, attendance_status)
            values (?, ?, ?, ?, 'GOING', 'ATTENDED')
            """.trimIndent(),
            UUID.randomUUID().toString(),
            clubId.toString(),
            sessionId.toString(),
            membershipId.toString(),
        )
    }

    private fun updateSessionCopy(number: Int, bookTitle: String) {
        jdbcTemplate.update(
            """
            update sessions
            set number = ?,
                book_title = ?
            where id = ?
              and club_id = ?
            """.trimIndent(),
            number,
            bookTitle,
            sessionId.toString(),
            clubId.toString(),
        )
    }

    private fun <T> withTemporarySessionCopy(number: Int, bookTitle: String, block: () -> T): T {
        val original = jdbcTemplate.queryForMap(
            """
            select number, book_title
            from sessions
            where id = ?
              and club_id = ?
            """.trimIndent(),
            sessionId.toString(),
            clubId.toString(),
        )
        return try {
            updateSessionCopy(number, bookTitle)
            block()
        } finally {
            updateSessionCopy(
                number = (original["number"] as Number).toInt(),
                bookTitle = original["book_title"].toString(),
            )
        }
    }

    private fun updateSessionState(state: String) {
        jdbcTemplate.update(
            """
            update sessions
            set state = ?
            where id = ?
              and club_id = ?
            """.trimIndent(),
            state,
            sessionId.toString(),
            clubId.toString(),
        )
    }

    private fun deleteInsertedMember(member: InsertedMember) {
        jdbcTemplate.update(
            "delete from member_notifications where club_id = ? and recipient_membership_id = ?",
            clubId.toString(),
            member.membershipId.toString(),
        )
        jdbcTemplate.update(
            "delete from notification_deliveries where club_id = ? and recipient_membership_id = ?",
            clubId.toString(),
            member.membershipId.toString(),
        )
        jdbcTemplate.update(
            "delete from session_participants where club_id = ? and membership_id = ?",
            clubId.toString(),
            member.membershipId.toString(),
        )
        jdbcTemplate.update(
            "delete from memberships where club_id = ? and id = ?",
            clubId.toString(),
            member.membershipId.toString(),
        )
        jdbcTemplate.update("delete from users where id = ?", member.userId.toString())
    }

    private fun membershipIdForEmail(email: String): UUID = membershipForEmail(email).first

    private fun membershipForEmail(email: String): Pair<UUID, UUID> {
        val row = jdbcTemplate.queryForMap(
            """
            select memberships.id as membership_id, memberships.club_id
            from memberships
            join users on users.id = memberships.user_id
            where users.email = ?
              and memberships.club_id = ?
            """.trimIndent(),
            email,
            clubId.toString(),
        )
        return UUID.fromString(row["membership_id"].toString()) to UUID.fromString(row["club_id"].toString())
    }

    private fun deliveryRows(eventId: UUID = this.eventId): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from notification_deliveries where event_id = ?",
            Int::class.java,
            eventId.toString(),
        ) ?: 0

    private fun memberNotificationRows(eventId: UUID = this.eventId): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from member_notifications where event_id = ?",
            Int::class.java,
            eventId.toString(),
        ) ?: 0

    private fun deliveryRowsFor(
        membershipId: UUID,
        channel: NotificationChannel,
        status: NotificationDeliveryStatus,
    ): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from notification_deliveries
            where event_id = ?
              and recipient_membership_id = ?
              and channel = ?
              and status = ?
            """.trimIndent(),
            Int::class.java,
            eventId.toString(),
            membershipId.toString(),
            channel.name,
            status.name,
        ) ?: 0

    private fun deliveryRowsFor(eventId: UUID, membershipId: UUID): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from notification_deliveries
            where event_id = ?
              and recipient_membership_id = ?
            """.trimIndent(),
            Int::class.java,
            eventId.toString(),
            membershipId.toString(),
        ) ?: 0

    private fun pendingEmailDeliveryIdFor(email: String): UUID =
        UUID.fromString(
            jdbcTemplate.queryForObject(
                """
                select notification_deliveries.id
                from notification_deliveries
                join memberships on memberships.id = notification_deliveries.recipient_membership_id
                  and memberships.club_id = notification_deliveries.club_id
                join users on users.id = memberships.user_id
                where notification_deliveries.event_id = ?
                  and notification_deliveries.channel = 'EMAIL'
                  and notification_deliveries.status = 'PENDING'
                  and users.email = ?
                """.trimIndent(),
                String::class.java,
                eventId.toString(),
                email,
            ),
        )

    private fun statusFor(id: UUID): String =
        jdbcTemplate.queryForObject(
            "select status from notification_deliveries where id = ?",
            String::class.java,
            id.toString(),
        )!!

    private fun emailDeliveryRowsByStatus(status: NotificationDeliveryStatus): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from notification_deliveries
            where event_id = ?
              and club_id = ?
              and channel = 'EMAIL'
              and status = ?
            """.trimIndent(),
            Int::class.java,
            eventId.toString(),
            clubId.toString(),
            status.name,
        ) ?: 0

    private fun <T> runConcurrently(workerCount: Int, action: () -> T): List<T> {
        val executor = Executors.newFixedThreadPool(workerCount)
        val ready = CountDownLatch(workerCount)
        val start = CountDownLatch(1)
        return try {
            val futures = (1..workerCount).map {
                executor.submit<T> {
                    ready.countDown()
                    check(start.await(5, TimeUnit.SECONDS)) { "Timed out waiting to start concurrent work" }
                    action()
                }
            }
            check(ready.await(5, TimeUnit.SECONDS)) { "Timed out waiting for concurrent workers" }
            start.countDown()
            futures.map { it.get(10, TimeUnit.SECONDS) }
        } finally {
            executor.shutdownNow()
        }
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }

    private data class InsertedMember(
        val userId: UUID,
        val membershipId: UUID,
    )

    private class RecordingMailPort : MailDeliveryPort {
        private val recipients = Collections.synchronizedList(mutableListOf<String>())

        override fun send(command: MailDeliveryCommand) {
            recipients += command.to
        }

        fun recipients(): List<String> = recipients.toList()
    }
}
