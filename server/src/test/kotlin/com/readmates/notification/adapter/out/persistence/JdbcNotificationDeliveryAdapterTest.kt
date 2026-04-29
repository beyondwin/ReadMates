package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventType
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

private const val CLEANUP_NOTIFICATION_DELIVERY_SQL = """
    delete from member_notifications
    where club_id = '00000000-0000-0000-0000-000000000001';
    delete from notification_deliveries
    where club_id = '00000000-0000-0000-0000-000000000001';
    delete from notification_event_outbox
    where club_id = '00000000-0000-0000-0000-000000000001';
    delete from notification_preferences
    where club_id = '00000000-0000-0000-0000-000000000001';
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
        assertThat(memberNotificationAdapter.unreadCount(clubId, member1)).isEqualTo(1)
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

    private fun insertEventOutboxRow() {
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
            NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED.name,
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

    private fun message(): NotificationEventMessage =
        NotificationEventMessage(
            eventId = eventId,
            clubId = clubId,
            eventType = NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
            aggregateType = "SESSION",
            aggregateId = sessionId,
            occurredAt = OffsetDateTime.of(2026, 4, 29, 3, 0, 0, 0, ZoneOffset.UTC),
            payload = NotificationEventPayload(
                sessionId = sessionId,
                sessionNumber = 1,
                bookTitle = "팩트풀니스",
            ),
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

    private fun deliveryRows(): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from notification_deliveries where event_id = ?",
            Int::class.java,
            eventId.toString(),
        ) ?: 0

    private fun memberNotificationRows(): Int =
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

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
