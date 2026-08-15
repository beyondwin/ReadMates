package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.config.NotificationRuntimeProperties
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryFailure
import com.readmates.notification.application.port.out.MailDeliveryFailureKind
import com.readmates.notification.application.port.out.MailDeliveryPort
import com.readmates.notification.application.service.NotificationDeliveryEngine
import com.readmates.notification.application.service.NotificationDeliveryProcessingService
import com.readmates.notification.application.service.NotificationDeliveryTransactionalOperations
import com.readmates.notification.application.service.ReadmatesOperationalMetrics
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import tools.jackson.databind.ObjectMapper
import java.sql.Timestamp
import java.time.Clock
import java.time.Duration
import java.time.Instant
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
    update memberships
    join users on users.id = memberships.user_id
    set memberships.status = 'ACTIVE',
        memberships.updated_at = utc_timestamp(6)
    where memberships.club_id = '00000000-0000-0000-0000-000000000001'
      and users.email in ('host@example.com', 'member1@example.com', 'member5@example.com');
    update session_participants
    join memberships on memberships.id = session_participants.membership_id
      and memberships.club_id = session_participants.club_id
    join users on users.id = memberships.user_id
    set session_participants.participation_status = 'ACTIVE',
        session_participants.attendance_status = 'ATTENDED',
        session_participants.updated_at = utc_timestamp(6)
    where session_participants.club_id = '00000000-0000-0000-0000-000000000001'
      and session_participants.session_id = '00000000-0000-0000-0000-000000000301'
      and users.email in ('host@example.com', 'member1@example.com', 'member5@example.com');
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
@Tag("integration")
class JdbcNotificationDeliveryAdapterTest(
    @param:Autowired private val deliveryAdapter: JdbcNotificationDeliveryAdapter,
    @param:Autowired private val memberNotificationAdapter: JdbcMemberNotificationAdapter,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val transactionalOps: NotificationDeliveryTransactionalOperations,
    @param:Autowired private val objectMapper: ObjectMapper,
) : ReadmatesMySqlIntegrationTestSupport() {
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
        assertThat(member1Notifications.single().title).isEqualTo("1회차 피드백 문서가 올라왔습니다")
        assertThat(member1Notifications.single().deepLinkPath)
            .isEqualTo("/clubs/reading-sai/app/feedback/$sessionId")
        assertThat(memberNotificationAdapter.unreadCount(clubId, member1)).isEqualTo(1)
    }

    @Test
    fun `persistPlannedDeliveries throws when event outbox row is missing`() {
        val missingEventId = UUID.fromString("00000000-0000-0000-0000-000000009799")

        assertThatThrownBy {
            deliveryAdapter.persistPlannedDeliveries(message(eventId = missingEventId))
        }.isInstanceOf(MissingNotificationEventOutboxException::class.java)
            .hasMessageContaining("Notification event outbox row not found")
            .hasMessageContaining(missingEventId.toString())

        assertThat(deliveryRows(missingEventId)).isZero()
        assertThat(memberNotificationRows(missingEventId)).isZero()
    }

    @Test
    fun `persistPlannedDeliveries plans from persisted outbox event when Kafka message fields are stale`() {
        insertEventOutboxRow()

        val deliveries =
            deliveryAdapter.persistPlannedDeliveries(
                message(
                    eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
                    aggregateId = UUID.fromString("00000000-0000-0000-0000-000000009798"),
                    payload =
                        NotificationEventPayload(
                            sessionId = UUID.fromString("00000000-0000-0000-0000-000000009797"),
                            sessionNumber = 99,
                            bookTitle = "Kafka payload book",
                        ),
                ),
            )

        assertThat(deliveries).hasSize(6)
        assertThat(deliveries.filter { it.channel == NotificationChannel.EMAIL })
            .extracting<String?> { it.subject }
            .containsOnly("1회차 피드백 문서가 올라왔습니다")
        assertThat(deliveries.filter { it.channel == NotificationChannel.EMAIL })
            .extracting<String?> { it.bodyHtml }
            .allSatisfy {
                assertThat(it).contains("feedback document", "피드백 문서 확인하기", "/clubs/reading-sai/app/feedback/$sessionId")
                assertThat(it).doesNotContain("Kafka payload book")
            }

        val member1 = membershipIdForEmail("member1@example.com")
        val member1Notifications = memberNotificationAdapter.listForMembership(clubId, member1, limit = 10)
        assertThat(member1Notifications.single().title).isEqualTo("1회차 피드백 문서가 올라왔습니다")
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

            val existingEmailDelivery =
                duplicate.single {
                    it.recipientMembershipId == member1 && it.channel == NotificationChannel.EMAIL
                }
            assertThat(existingEmailDelivery.recipientEmail).isEqualTo("member1@example.com")
            assertThat(existingEmailDelivery.subject).isEqualTo("1회차 피드백 문서가 올라왔습니다")
            assertThat(existingEmailDelivery.bodyText).contains("팩트풀니스")
            assertThat(existingEmailDelivery.bodyHtml).contains("/clubs/reading-sai/app/feedback/$sessionId")
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
    fun `manual dispatch planning respects requested channels and target edits`() {
        val manualEventId = UUID.nameUUIDFromBytes("manual-event".toByteArray())
        val member1 = membershipIdForEmail("member1@example.com")
        val member2 = membershipIdForEmail("member2@example.com")
        insertManualEventOutboxRow(
            eventId = manualEventId,
            requestedChannels = "IN_APP",
            audience = "ALL_ACTIVE_MEMBERS",
            excludedMembershipIds = listOf(member2),
        )

        val deliveries =
            deliveryAdapter.persistPlannedDeliveries(
                message(eventId = manualEventId, eventType = NotificationEventType.SESSION_REMINDER_DUE),
            )

        assertThat(deliveries).allSatisfy { assertThat(it.channel).isEqualTo(NotificationChannel.IN_APP) }
        assertThat(deliveries.map { it.recipientMembershipId }).contains(member1)
        assertThat(deliveries.map { it.recipientMembershipId }).doesNotContain(member2)
        assertThat(memberNotificationRows(manualEventId)).isEqualTo(deliveries.size)
    }

    @Test
    fun `manual dispatch planning uses frozen recipient snapshot instead of recomputing audience`() {
        val manualEventId = UUID.nameUUIDFromBytes("manual-event-frozen".toByteArray())
        val member1 = membershipIdForEmail("member1@example.com")
        insertManualEventOutboxRow(
            eventId = manualEventId,
            requestedChannels = "BOTH",
            audience = "ALL_ACTIVE_MEMBERS",
            targetMembershipIds = listOf(member1),
            inAppMembershipIds = listOf(member1),
            emailMembershipIds = listOf(member1),
        )
        val newlyJoinedMember = insertActiveMember("joined.after.event.manual")
        try {
            val deliveries =
                deliveryAdapter.persistPlannedDeliveries(
                    message(eventId = manualEventId, eventType = NotificationEventType.SESSION_REMINDER_DUE),
                )

            assertThat(deliveries.map { it.recipientMembershipId }).contains(member1)
            assertThat(deliveries.map { it.recipientMembershipId }).doesNotContain(newlyJoinedMember.membershipId)
            assertThat(memberNotificationRows(manualEventId)).isEqualTo(1)
        } finally {
            deleteInsertedMember(newlyJoinedMember)
        }
    }

    @Test
    fun `selected member delivery snapshot stays membership exact and idempotent`() {
        val manualEventId = UUID.nameUUIDFromBytes("manual-event-selected-idempotent".toByteArray())
        val selected = membershipIdForEmail("member1@example.com")
        insertManualEventOutboxRow(
            eventId = manualEventId,
            requestedChannels = "IN_APP",
            audience = "SELECTED_MEMBERS",
            selectedMembershipIds = listOf(selected),
            targetMembershipIds = listOf(selected, selected),
            inAppMembershipIds = listOf(selected, selected),
        )

        val first =
            deliveryAdapter.persistPlannedDeliveries(
                message(eventId = manualEventId, eventType = NotificationEventType.SESSION_REMINDER_DUE),
            )
        val retry =
            deliveryAdapter.persistPlannedDeliveries(
                message(eventId = manualEventId, eventType = NotificationEventType.SESSION_REMINDER_DUE),
            )

        assertThat(first.map { it.recipientMembershipId }).containsExactly(selected)
        assertThat(retry.map { it.recipientMembershipId }).containsExactly(selected)
        assertThat(deliveryRows(manualEventId)).isEqualTo(1)
        assertThat(memberNotificationRows(manualEventId)).isEqualTo(1)
    }

    @Test
    fun `claimEmailDelivery leases only due email rows and mark sent requires active lease`() {
        insertEventOutboxRow()
        deliveryAdapter.persistPlannedDeliveries(message())
        val emailDeliveryId = pendingEmailDeliveryIdFor("member1@example.com")
        val createdAt = OffsetDateTime.of(2026, 4, 28, 1, 2, 3, 456_000_000, ZoneOffset.UTC)
        jdbcTemplate.update(
            "update notification_deliveries set created_at = ? where id = ?",
            Timestamp.from(createdAt.toInstant()),
            emailDeliveryId.toString(),
        )

        val claimed = deliveryAdapter.claimEmailDelivery(emailDeliveryId)
        val secondClaim = deliveryAdapter.claimEmailDelivery(emailDeliveryId)
        val staleMarked = deliveryAdapter.markDeliverySent(emailDeliveryId, claimed!!.lockedAt.minusSeconds(1))
        val activeMarked = deliveryAdapter.markDeliverySent(emailDeliveryId, claimed.lockedAt)

        assertThat(claimed.recipientEmail).isEqualTo("member1@example.com")
        assertThat(claimed.subject).isEqualTo("1회차 피드백 문서가 올라왔습니다")
        assertThat(claimed.bodyText).contains("팩트풀니스")
        assertThat(claimed.bodyHtml).contains("/clubs/reading-sai/app/feedback/$sessionId")
        assertThat(claimed.createdAt).isEqualTo(createdAt)
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
        val service =
            NotificationDeliveryProcessingService(
                deliveryEngine =
                    NotificationDeliveryEngine(
                        deliveryStatusPort = deliveryAdapter,
                        mailDeliveryPort = mailPort,
                        metrics = ReadmatesOperationalMetrics(SimpleMeterRegistry()),
                        runtimeProperties = NotificationRuntimeProperties(),
                        clock = Clock.fixed(Instant.parse("2026-04-29T02:00:00Z"), ZoneOffset.UTC),
                    ),
                transactionalOps = transactionalOps,
                deliveryEnabled = true,
            )

        val processedCounts =
            runConcurrently(workerCount = 2) {
                service.processPending(limit = 2)
            }
        val remainingProcessedCount = service.processPending(limit = 2)

        assertThat(processedCounts.sum() + remainingProcessedCount).isEqualTo(3)
        assertThat(mailPort.recipients()).hasSize(3).doesNotHaveDuplicates()
        assertThat(emailDeliveryRowsByStatus(NotificationDeliveryStatus.SENT)).isEqualTo(3)
    }

    @Test
    fun `claimEmailDelivery reclaims only an expired sending lease`() {
        insertEventOutboxRow()
        deliveryAdapter.persistPlannedDeliveries(message())
        val emailDeliveryId = pendingEmailDeliveryIdFor("member1@example.com")
        jdbcTemplate.update(
            """
            update notification_deliveries
            set status = 'SENDING',
                locked_at = timestampadd(MINUTE, -16, utc_timestamp(6))
            where id = ?
            """.trimIndent(),
            emailDeliveryId.toString(),
        )

        val reclaimed = deliveryAdapter.claimEmailDelivery(emailDeliveryId)

        assertThat(reclaimed).isNotNull
        assertThat(reclaimed!!.status).isEqualTo(NotificationDeliveryStatus.SENDING)
        assertThat(statusFor(emailDeliveryId)).isEqualTo("SENDING")
    }

    @Test
    fun `claimEmailDelivery uses the typed non-default lease for sending boundaries`() {
        insertEventOutboxRow()
        deliveryAdapter.persistPlannedDeliveries(message())
        val lease = Duration.ofMinutes(7).plusSeconds(30).plusMillis(500)
        val leaseMicros = 450_500_000L
        val leaseAdapter =
            JdbcNotificationDeliveryAdapter(
                jdbcTemplate = jdbcTemplate,
                objectMapper = objectMapper,
                appBaseUrl = "http://localhost:3000",
                runtimeProperties = notificationRuntimeProperties(lease),
            )
        val expiredId = pendingEmailDeliveryIdFor("member1@example.com")
        val insideId = pendingEmailDeliveryIdFor("member5@example.com")
        setSendingLease(expiredId, -leaseMicros)
        setSendingLease(insideId, -(leaseMicros - 5_000_000L))
        val insideLeaseBefore = deliveryLockedAt(insideId)

        val reclaimed = leaseAdapter.claimEmailDelivery(expiredId)
        val inside = leaseAdapter.claimEmailDelivery(insideId)

        assertThat(reclaimed).isNotNull
        assertThat(inside).isNull()
        assertThat(statusFor(insideId)).isEqualTo("SENDING")
        assertThat(deliveryLockedAt(insideId)).isEqualTo(insideLeaseBefore)
    }

    @Test
    fun `retryable delivery reaches dead through exact claimed leases at attempt ceiling`() {
        insertEventOutboxRow()
        deliveryAdapter.persistPlannedDeliveries(message())
        val emailDeliveryId = pendingEmailDeliveryIdFor("member1@example.com")
        val createdAt = OffsetDateTime.of(2026, 4, 29, 1, 0, 0, 0, ZoneOffset.UTC)
        jdbcTemplate.update(
            "update notification_deliveries set created_at = ? where id = ?",
            Timestamp.from(createdAt.toInstant()),
            emailDeliveryId.toString(),
        )
        val engine =
            NotificationDeliveryEngine(
                deliveryStatusPort = deliveryAdapter,
                mailDeliveryPort = IntegrationFailingMailPort,
                metrics = ReadmatesOperationalMetrics(SimpleMeterRegistry()),
                runtimeProperties =
                    NotificationRuntimeProperties(
                        kafka = NotificationRuntimeProperties.Kafka(maxDeliveryAttempts = 2),
                    ),
                clock = Clock.fixed(Instant.parse("2026-04-29T02:00:00Z"), ZoneOffset.UTC),
            )

        val first = deliveryAdapter.claimEmailDelivery(emailDeliveryId)!!
        engine.sendClaimed(first)
        jdbcTemplate.update(
            "update notification_deliveries set next_attempt_at = utc_timestamp(6) where id = ?",
            emailDeliveryId.toString(),
        )
        val second = deliveryAdapter.claimEmailDelivery(emailDeliveryId)!!
        engine.sendClaimed(second)

        assertThat(first.attemptCount).isZero()
        assertThat(second.attemptCount).isEqualTo(1)
        assertThat(statusFor(emailDeliveryId)).isEqualTo("DEAD")
        assertThat(lastErrorFor(emailDeliveryId)).isEqualTo("MAIL_RETRYABLE")
    }

    @Test
    fun `claimEmailDelivery renders email copy from immutable event payload`() {
        insertEventOutboxRow()
        deliveryAdapter.persistPlannedDeliveries(message())
        val emailDeliveryId = pendingEmailDeliveryIdFor("member1@example.com")

        val claimed =
            withTemporarySessionCopy(number = 99, bookTitle = "변경된 책") {
                deliveryAdapter.claimEmailDelivery(emailDeliveryId)!!
            }

        assertThat(claimed.subject).isEqualTo("1회차 피드백 문서가 올라왔습니다")
        assertThat(claimed.bodyText).contains("1회차", "팩트풀니스", "확인 링크:")
        assertThat(claimed.bodyHtml).contains("feedback document", "피드백 문서 확인하기", "/clubs/reading-sai/app/feedback/$sessionId")
        assertThat(claimed.bodyText).doesNotContain("99회차")
        assertThat(claimed.bodyHtml).doesNotContain("변경된 책")
    }

    @Test
    fun `findDeliveryStatus exposes failed email row that is not due for retry`() {
        insertEventOutboxRow()
        deliveryAdapter.persistPlannedDeliveries(message())
        val emailDeliveryId = pendingEmailDeliveryIdFor("member1@example.com")
        val claimed = deliveryAdapter.claimEmailDelivery(emailDeliveryId)!!

        val failed =
            deliveryAdapter.markDeliveryFailed(
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

    private fun insertManualEventOutboxRow(
        eventId: UUID,
        requestedChannels: String,
        audience: String,
        selectedMembershipIds: List<UUID> = emptyList(),
        excludedMembershipIds: List<UUID> = emptyList(),
        includedMembershipIds: List<UUID> = emptyList(),
        targetMembershipIds: List<UUID> = emptyList(),
        inAppMembershipIds: List<UUID> = emptyList(),
        emailMembershipIds: List<UUID> = emptyList(),
    ) {
        val manualDispatchId = UUID.nameUUIDFromBytes("manual-dispatch-$eventId".toByteArray())
        val selectedJson = uuidListJson(selectedMembershipIds)
        val excludedJson = uuidListJson(excludedMembershipIds)
        val includedJson = uuidListJson(includedMembershipIds)
        val targetJson = uuidListJson(targetMembershipIds)
        val inAppJson = uuidListJson(inAppMembershipIds)
        val emailJson = uuidListJson(emailMembershipIds)
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id, payload_json, status, kafka_topic, kafka_key, dedupe_key
            ) values (?, ?, 'SESSION_REMINDER_DUE', 'SESSION', ?, json_object(
              'sessionId', ?,
              'sessionNumber', 1,
              'bookTitle', '팩트풀니스',
              'manualDispatch', json_object(
                'id', ?,
                'source', 'MANUAL',
                'requestedByMembershipId', '00000000-0000-0000-0000-000000000201',
                'requestedChannels', ?,
                'audience', ?,
                'selectedMembershipIds', cast(? as json),
                'excludedMembershipIds', cast(? as json),
                'includedMembershipIds', cast(? as json),
                'targetMembershipIds', cast(? as json),
                'inAppMembershipIds', cast(? as json),
                'emailMembershipIds', cast(? as json),
                'resend', false,
                'sendMode', 'NOW'
              )
            ), 'PUBLISHED', 'readmates.notification.events.v1', ?, ?)
            """.trimIndent(),
            eventId.toString(),
            clubId.toString(),
            sessionId.toString(),
            sessionId.toString(),
            manualDispatchId.toString(),
            requestedChannels,
            audience,
            selectedJson,
            excludedJson,
            includedJson,
            targetJson,
            inAppJson,
            emailJson,
            clubId.toString(),
            "delivery-adapter-test-manual-$eventId",
        )
    }

    private fun uuidListJson(ids: List<UUID>): String = ids.joinToString(prefix = "[", postfix = "]") { "\"$it\"" }

    private fun message(
        eventId: UUID = this.eventId,
        eventType: NotificationEventType = NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
        authorMembershipId: UUID? = null,
        aggregateId: UUID = sessionId,
        payload: NotificationEventPayload =
            NotificationEventPayload(
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

    private fun disableMemberPreference(
        email: String,
        column: String,
    ) {
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

    private fun insertActiveMember(emailPrefix: String): InsertedMember = insertMember(emailPrefix, status = "ACTIVE")

    private fun insertMember(
        emailPrefix: String,
        status: String,
    ): InsertedMember {
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
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, ?, 'MEMBER', ?, utc_timestamp(6), ?, 'globe-notebook')
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

    private fun updateSessionCopy(
        number: Int,
        bookTitle: String,
    ) {
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

    private fun <T> withTemporarySessionCopy(
        number: Int,
        bookTitle: String,
        block: () -> T,
    ): T {
        val original =
            jdbcTemplate.queryForMap(
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
        val visibility = if (state == "DRAFT") "MEMBER" else "PUBLIC"
        jdbcTemplate.update(
            """
            update sessions
            set state = ?, visibility = ?
            where id = ?
              and club_id = ?
            """.trimIndent(),
            state,
            visibility,
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
        val row =
            jdbcTemplate.queryForMap(
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

    private fun deliveryRowsFor(
        eventId: UUID,
        membershipId: UUID,
    ): Int =
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

    private fun deliveryLockedAt(id: UUID): Timestamp? =
        jdbcTemplate.queryForObject(
            "select locked_at from notification_deliveries where id = ?",
            Timestamp::class.java,
            id.toString(),
        )

    private fun setSendingLease(
        id: UUID,
        offsetMicros: Long,
    ) {
        jdbcTemplate.update(
            """
            update notification_deliveries
            set status = 'SENDING',
                locked_at = timestampadd(MICROSECOND, ?, utc_timestamp(6))
            where id = ?
            """.trimIndent(),
            offsetMicros,
            id.toString(),
        )
    }

    private fun lastErrorFor(id: UUID): String? =
        jdbcTemplate.queryForObject(
            "select last_error from notification_deliveries where id = ?",
            String::class.java,
            id.toString(),
        )

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

    private fun <T> runConcurrently(
        workerCount: Int,
        action: () -> T,
    ): List<T> {
        val executor = Executors.newFixedThreadPool(workerCount)
        val ready = CountDownLatch(workerCount)
        val start = CountDownLatch(1)
        return try {
            val futures =
                (1..workerCount).map {
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

    private object IntegrationFailingMailPort : MailDeliveryPort {
        override fun send(command: MailDeliveryCommand): Unit = failDelivery()

        private fun failDelivery(): Nothing = throw MailDeliveryFailure(MailDeliveryFailureKind.RETRYABLE)
    }
}

private fun notificationRuntimeProperties(claimLease: Duration): NotificationRuntimeProperties =
    NotificationRuntimeProperties(
        worker = NotificationRuntimeProperties.Worker(claimLease = claimLease),
    )
