package com.readmates.notification.api

import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryPort
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.notification.domain.NotificationOutboxStatus
import com.readmates.support.MySqlTestContainer
import org.assertj.core.api.Assertions.assertThat
import jakarta.mail.Session
import jakarta.mail.internet.MimeMessage
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mail.SimpleMailMessage
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.mail.javamail.MimeMessagePreparator
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.io.InputStream
import java.util.Properties
import java.util.UUID

private const val CLEANUP_HOST_NOTIFICATIONS_SQL = """
    delete from notification_test_mail_audit
    where club_id = '00000000-0000-0000-0000-000000000001';
    delete from notification_deliveries
    where dedupe_key like 'host-notification-controller-test-%';
    delete from notification_event_outbox
    where dedupe_key like 'host-notification-controller-test-%';
    delete from memberships
    where club_id = '00000000-0000-0000-0000-000000000902';
    delete from users
    where id = '00000000-0000-0000-0000-000000009102';
    delete from clubs
    where id = '00000000-0000-0000-0000-000000000902';
"""
private const val FAILING_TEST_MAIL_RECIPIENT = "failure@example.com"
private const val SENSITIVE_TEST_MAIL_ERROR =
    "smtp rejected external@example.com password=marker Bearer marker api_key=marker authorization=Basic marker " +
        "-----BEGIN " + "PRIVATE KEY----- marker"

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.notifications.enabled=true",
        "readmates.notifications.sender-email=no-reply@example.com",
        "readmates.notifications.sender-name=ReadMates",
    ],
)
@AutoConfigureMockMvc
@Sql(
    statements = [
        CLEANUP_HOST_NOTIFICATIONS_SQL,
    ],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [
        CLEANUP_HOST_NOTIFICATIONS_SQL,
    ],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
class HostNotificationControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `host can read notification status summary`() {
        insertNotification(
            id = "00000000-0000-0000-0000-000000009001",
            clubId = "00000000-0000-0000-0000-000000000001",
            status = NotificationOutboxStatus.FAILED,
            dedupeKey = "host-notification-controller-test-failed",
            lastError = "SMTP temporary failure",
            attemptCount = 2,
        )

        val response = mockMvc.get("/api/host/notifications/summary") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.pending") { value(0) }
            jsonPath("$.failed") { value(1) }
            jsonPath("$.dead") { value(0) }
            jsonPath("$.sentLast24h") { value(0) }
            jsonPath("$.latestFailures[0].eventType") { value("FEEDBACK_DOCUMENT_PUBLISHED") }
            jsonPath("$.latestFailures[0].attemptCount") { value(2) }
            jsonPath("$.latestFailures[0].recipientEmail") { value("m***@example.com") }
        }.andReturn().response.contentAsString

        assertThat(response).doesNotContain("member@example.com")
        assertThat(response).doesNotContain("lastError")
        assertThat(response).doesNotContain("SMTP temporary failure")
    }

    @Test
    fun `host can process notifications without csrf`() {
        mockMvc.post("/api/host/notifications/process") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.processed") { value(0) }
        }
    }

    @Test
    fun `host can list notification event and delivery ledgers with masked recipients`() {
        insertOtherClub()
        insertNotificationEvent(
            id = "00000000-0000-0000-0000-000000009501",
            clubId = "00000000-0000-0000-0000-000000000001",
            eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
            status = NotificationEventOutboxStatus.PUBLISHED,
            dedupeKey = "host-notification-controller-test-event-list",
        )
        insertNotificationEvent(
            id = "00000000-0000-0000-0000-000000009502",
            clubId = "00000000-0000-0000-0000-000000000902",
            eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
            status = NotificationEventOutboxStatus.PUBLISHED,
            dedupeKey = "host-notification-controller-test-event-list-other-club",
        )
        insertNotificationDelivery(
            id = "00000000-0000-0000-0000-000000009601",
            eventId = "00000000-0000-0000-0000-000000009501",
            clubId = "00000000-0000-0000-0000-000000000001",
            recipientMembershipId = "00000000-0000-0000-0000-000000000202",
            channel = NotificationChannel.EMAIL,
            status = NotificationDeliveryStatus.SENT,
            dedupeKey = "host-notification-controller-test-delivery-list",
        )

        mockMvc.get("/api/host/notifications/events") {
            with(user("host@example.com"))
            param("limit", "2")
        }.andExpect {
            status { isOk() }
            jsonPath("$.items.length()") { value(1) }
            jsonPath("$.items[0].id") { value("00000000-0000-0000-0000-000000009501") }
            jsonPath("$.items[0].eventType") { value("NEXT_BOOK_PUBLISHED") }
            jsonPath("$.items[0].status") { value("PUBLISHED") }
            jsonPath("$.nextCursor") { value(null) }
        }

        val response = mockMvc.get("/api/host/notifications/deliveries") {
            with(user("host@example.com"))
            param("limit", "2")
        }.andExpect {
            status { isOk() }
            jsonPath("$.items[0].id") { value("00000000-0000-0000-0000-000000009601") }
            jsonPath("$.items[0].channel") { value("EMAIL") }
            jsonPath("$.items[0].status") { value("SENT") }
            jsonPath("$.items[0].recipientEmail") { value("m***@example.com") }
            jsonPath("$.nextCursor") { value(null) }
        }.andReturn().response.contentAsString

        assertThat(response).doesNotContain("member1@example.com")
    }

    @Test
    fun `host notification items return paged contract with masked recipients`() {
        insertNotification(
            id = "00000000-0000-0000-0000-000000009621",
            clubId = "00000000-0000-0000-0000-000000000001",
            status = NotificationOutboxStatus.PENDING,
            dedupeKey = "host-notification-controller-test-paged-item-1",
        )
        insertNotification(
            id = "00000000-0000-0000-0000-000000009622",
            clubId = "00000000-0000-0000-0000-000000000001",
            status = NotificationOutboxStatus.PENDING,
            dedupeKey = "host-notification-controller-test-paged-item-2",
        )
        insertNotification(
            id = "00000000-0000-0000-0000-000000009623",
            clubId = "00000000-0000-0000-0000-000000000001",
            status = NotificationOutboxStatus.PENDING,
            dedupeKey = "host-notification-controller-test-paged-item-3",
        )

        val response = mockMvc.get("/api/host/notifications/items") {
            with(user("host@example.com"))
            param("limit", "2")
        }.andExpect {
            status { isOk() }
            jsonPath("$.items.length()") { value(2) }
            jsonPath("$.items[0].recipientEmail") { value("m***@example.com") }
            jsonPath("$.nextCursor") { exists() }
        }.andReturn().response.contentAsString

        assertThat(response).doesNotContain("member@example.com")
    }

    @Test
    fun `host sends test mail and audit stores masked recipient only`() {
        mockMvc.post("/api/host/notifications/test-mail") {
            with(user("host@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content = """{"recipientEmail":"external@example.com"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.recipientEmail") { value("e***@example.com") }
            jsonPath("$.status") { value("SENT") }
        }

        val rows = jdbcTemplate.queryForList(
            """
            select recipient_masked_email, recipient_email_hash
            from notification_test_mail_audit
            where club_id = '00000000-0000-0000-0000-000000000001'
            """.trimIndent(),
        )

        assertThat(rows).hasSize(1)
        assertThat(rows.single()["recipient_masked_email"]).isEqualTo("e***@example.com")
        assertThat(rows.single()["recipient_email_hash"].toString()).matches("^[0-9a-f]{64}$")
        assertThat(rows.toString()).doesNotContain("external@example.com")
    }

    @Test
    fun `host test mail rejects second send within cooldown`() {
        repeat(2) { index ->
            mockMvc.post("/api/host/notifications/test-mail") {
                with(user("host@example.com"))
                contentType = MediaType.APPLICATION_JSON
                content = """{"recipientEmail":"host@example.com"}"""
            }.andExpect {
                if (index == 0) {
                    status { isOk() }
                } else {
                    status { isTooManyRequests() }
                }
            }
        }
    }

    @Test
    fun `host test mail failure audit stores and returns sanitized error`() {
        val response = mockMvc.post("/api/host/notifications/test-mail") {
            with(user("host@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content = """{"recipientEmail":"$FAILING_TEST_MAIL_RECIPIENT"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.recipientEmail") { value("f***@example.com") }
            jsonPath("$.status") { value("FAILED") }
        }.andReturn().response.contentAsString

        assertThat(response).contains("[redacted-email]")
        assertThat(response).contains("[redacted-secret]")
        assertNoSensitiveErrorValues(response)

        val rows = jdbcTemplate.queryForList(
            """
            select status, last_error
            from notification_test_mail_audit
            where club_id = '00000000-0000-0000-0000-000000000001'
            """.trimIndent(),
        )

        assertThat(rows).hasSize(1)
        assertThat(rows.single()["status"]).isEqualTo("FAILED")
        val storedError = rows.single()["last_error"].toString()
        assertThat(storedError).contains("[redacted-email]")
        assertThat(storedError).contains("[redacted-secret]")
        assertNoSensitiveErrorValues(storedError)

        val auditResponse = mockMvc.get("/api/host/notifications/test-mail/audit") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.items[0].status") { value("FAILED") }
            jsonPath("$.nextCursor") { value(null) }
        }.andReturn().response.contentAsString

        assertThat(auditResponse).contains("[redacted-email]")
        assertThat(auditResponse).contains("[redacted-secret]")
        assertNoSensitiveErrorValues(auditResponse)
    }

    @Test
    fun `host test mail audit response redacts stored sensitive error`() {
        jdbcTemplate.update(
            """
            insert into notification_test_mail_audit (
              id,
              club_id,
              host_membership_id,
              recipient_masked_email,
              recipient_email_hash,
              status,
              last_error
            ) values (
              '00000000-0000-0000-0000-000000009901',
              '00000000-0000-0000-0000-000000000001',
              '00000000-0000-0000-0000-000000000201',
              'f***@example.com',
              '0000000000000000000000000000000000000000000000000000000000000000',
              'FAILED',
              ?
            )
            """.trimIndent(),
            SENSITIVE_TEST_MAIL_ERROR,
        )

        val response = mockMvc.get("/api/host/notifications/test-mail/audit") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.items[0].status") { value("FAILED") }
            jsonPath("$.nextCursor") { value(null) }
        }.andReturn().response.contentAsString

        assertThat(response).contains("[redacted-email]")
        assertThat(response).contains("[redacted-secret]")
        assertNoSensitiveErrorValues(response)
    }

    @Test
    fun `host can read notification detail without body text or raw email`() {
        insertNotification(
            id = "00000000-0000-0000-0000-000000009402",
            clubId = "00000000-0000-0000-0000-000000000001",
            status = NotificationOutboxStatus.PENDING,
            dedupeKey = "host-notification-controller-test-detail",
            lastError = "SMTP temporary failure for member@example.com",
        )

        val response = mockMvc.get("/api/host/notifications/items/00000000-0000-0000-0000-000000009402") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value("00000000-0000-0000-0000-000000009402") }
            jsonPath("$.recipientEmail") { value("m***@example.com") }
            jsonPath("$.subject") { value("피드백 문서가 올라왔습니다") }
            jsonPath("$.status") { value("PENDING") }
            jsonPath("$.metadata.sessionNumber") { value(3) }
            jsonPath("$.metadata.bookTitle") { value("메타데이터 테스트 책") }
            jsonPath("$.lastError") { value("SMTP temporary failure for [redacted-email]") }
        }.andReturn().response.contentAsString

        assertThat(response).doesNotContain("bodyText")
        assertThat(response).doesNotContain("member@example.com")
        assertThat(response).doesNotContain("ReadMates에서 확인해 주세요.")
        assertThat(response).doesNotContain("inviteToken")
        assertThat(response).doesNotContain("secret marker")
        assertThat(response).doesNotContain("apiKey")
        assertThat(response).doesNotContain("api key marker")
        assertThat(response).doesNotContain("password")
        assertThat(response).doesNotContain("password marker")
        assertThat(response).doesNotContain("accessKeyId")
        assertThat(response).doesNotContain("access key marker")
        assertThat(response).doesNotContain("privateKeyPem")
        assertThat(response).doesNotContain("private key marker")
        assertThat(response).doesNotContain("signingKeyId")
        assertThat(response).doesNotContain("authorization")
        assertThat(response).doesNotContain("credential")
    }

    @Test
    fun `host restores dead notification`() {
        insertNotification(
            id = "00000000-0000-0000-0000-000000009403",
            clubId = "00000000-0000-0000-0000-000000000001",
            status = NotificationOutboxStatus.DEAD,
            dedupeKey = "host-notification-controller-test-restore",
        )

        mockMvc.post("/api/host/notifications/items/00000000-0000-0000-0000-000000009403/restore") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value("00000000-0000-0000-0000-000000009403") }
            jsonPath("$.status") { value("PENDING") }
        }
    }

    @Test
    fun `host retries pending notification`() {
        insertNotification(
            id = "00000000-0000-0000-0000-000000009404",
            clubId = "00000000-0000-0000-0000-000000000001",
            status = NotificationOutboxStatus.PENDING,
            dedupeKey = "host-notification-controller-test-retry",
        )

        val response = mockMvc.post("/api/host/notifications/items/00000000-0000-0000-0000-000000009404/retry") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value("00000000-0000-0000-0000-000000009404") }
            jsonPath("$.status") { value("SENT") }
            jsonPath("$.recipientEmail") { value("m***@example.com") }
        }.andReturn().response.contentAsString

        assertThat(response).doesNotContain("member@example.com")
        assertThat(response).doesNotContain("ReadMates에서 확인해 주세요.")
    }

    @Test
    fun `host cannot retry sent or dead notifications`() {
        insertNotification(
            id = "00000000-0000-0000-0000-000000009405",
            clubId = "00000000-0000-0000-0000-000000000001",
            status = NotificationOutboxStatus.SENT,
            dedupeKey = "host-notification-controller-test-retry-sent",
        )
        insertNotification(
            id = "00000000-0000-0000-0000-000000009406",
            clubId = "00000000-0000-0000-0000-000000000001",
            status = NotificationOutboxStatus.DEAD,
            dedupeKey = "host-notification-controller-test-retry-dead",
        )

        listOf(
            "00000000-0000-0000-0000-000000009405",
            "00000000-0000-0000-0000-000000009406",
        ).forEach { id ->
            mockMvc.post("/api/host/notifications/items/$id/retry") {
                with(user("host@example.com"))
            }.andExpect {
                status { isForbidden() }
            }
        }
    }

    @Test
    fun `manual host process only processes notifications for host club`() {
        insertOtherClub()
        insertPendingNotification(
            id = "00000000-0000-0000-0000-000000009101",
            clubId = "00000000-0000-0000-0000-000000000001",
            dedupeKey = "host-notification-controller-test-host-club",
        )
        insertPendingNotification(
            id = "00000000-0000-0000-0000-000000009102",
            clubId = "00000000-0000-0000-0000-000000000902",
            dedupeKey = "host-notification-controller-test-other-club",
        )

        mockMvc.post("/api/host/notifications/process") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.processed") { value(1) }
        }

        val otherClubStatus = jdbcTemplate.queryForObject(
            """
            select status
            from notification_deliveries
            where id = '00000000-0000-0000-0000-000000009102'
            """.trimIndent(),
            String::class.java,
        )
        val hostClubStatus = jdbcTemplate.queryForObject(
            """
            select status
            from notification_deliveries
            where id = '00000000-0000-0000-0000-000000009101'
            """.trimIndent(),
            String::class.java,
        )

        org.assertj.core.api.Assertions.assertThat(hostClubStatus).isEqualTo("SENT")
        org.assertj.core.api.Assertions.assertThat(otherClubStatus).isEqualTo("PENDING")
    }

    @Test
    fun `nearby notification post path without csrf remains protected`() {
        mockMvc.post("/api/host/notifications/process/extra") {
            with(user("host@example.com"))
        }.andExpect {
            status { isForbidden() }
        }
    }

    private fun insertPendingNotification(id: String, clubId: String, dedupeKey: String) {
        insertNotification(id = id, clubId = clubId, status = NotificationOutboxStatus.PENDING, dedupeKey = dedupeKey)
    }

    private fun insertOtherClub() {
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about)
            values (
              '00000000-0000-0000-0000-000000000902',
              'other-club',
              'Other Club',
              'Separate reading club',
              'Separate club for notification scope tests.'
            )
            """.trimIndent(),
        )
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, auth_provider)
            values (
              '00000000-0000-0000-0000-000000009102',
              'google-other-club-member',
              'other-member@example.com',
              'Other Member',
              'Other',
              'GOOGLE'
            )
            """.trimIndent(),
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name)
            values (
              '00000000-0000-0000-0000-000000000292',
              '00000000-0000-0000-0000-000000000902',
              '00000000-0000-0000-0000-000000009102',
              'MEMBER',
              'ACTIVE',
              utc_timestamp(6),
              'Other'
            )
            """.trimIndent(),
        )
    }

    private fun insertNotification(
        id: String,
        clubId: String,
        status: NotificationOutboxStatus,
        dedupeKey: String,
        lastError: String? = null,
        attemptCount: Int = 0,
    ) {
        val eventId = UUID.randomUUID().toString()
        insertNotificationEvent(
            id = eventId,
            clubId = clubId,
            eventType = NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
            status = NotificationEventOutboxStatus.PUBLISHED,
            dedupeKey = "$dedupeKey-event",
        )
        jdbcTemplate.update(
            """
            insert into notification_deliveries (
              id,
              event_id,
              club_id,
              recipient_membership_id,
              channel,
              status,
              attempt_count,
              last_error,
              sent_at,
              dedupe_key
            )
            values (
              ?,
              ?,
              ?,
              ?,
              'EMAIL',
              ?,
              ?,
              ?,
              if(? = 'SENT', utc_timestamp(6), null),
              ?
            )
            """.trimIndent(),
            id,
            eventId,
            clubId,
            recipientMembershipIdForClub(clubId),
            status.name,
            attemptCount,
            lastError,
            status.name,
            dedupeKey,
        )
    }

    private fun insertNotificationEvent(
        id: String,
        clubId: String,
        eventType: NotificationEventType,
        status: NotificationEventOutboxStatus,
        dedupeKey: String,
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
              kafka_key,
              dedupe_key
            )
            values (
              ?,
              ?,
              ?,
              'SESSION',
              '00000000-0000-0000-0000-000000000301',
              json_object(
                'sessionId', '00000000-0000-0000-0000-000000000301',
                'sessionNumber', 3,
                'bookTitle', '메타데이터 테스트 책',
                'documentVersion', null,
                'authorMembershipId', null,
                'targetDate', null
              ),
              ?,
              ?,
              ?
            )
            """.trimIndent(),
            id,
            clubId,
            eventType.name,
            status.name,
            clubId,
            dedupeKey,
        )
    }

    private fun insertNotificationDelivery(
        id: String,
        eventId: String,
        clubId: String,
        recipientMembershipId: String,
        channel: NotificationChannel,
        status: NotificationDeliveryStatus,
        dedupeKey: String,
    ) {
        jdbcTemplate.update(
            """
            insert into notification_deliveries (
              id,
              event_id,
              club_id,
              recipient_membership_id,
              channel,
              status,
              dedupe_key
            )
            values (?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            id,
            eventId,
            clubId,
            recipientMembershipId,
            channel.name,
            status.name,
            dedupeKey,
        )
    }

    private fun recipientMembershipIdForClub(clubId: String): String =
        when (clubId) {
            "00000000-0000-0000-0000-000000000902" -> "00000000-0000-0000-0000-000000000292"
            else -> "00000000-0000-0000-0000-000000000202"
        }

    private fun assertNoSensitiveErrorValues(value: String) {
        assertThat(value).doesNotContain("external@example.com")
        assertThat(value).doesNotContain("password=marker")
        assertThat(value).doesNotContain("Bearer marker")
        assertThat(value).doesNotContain("api_key=marker")
        assertThat(value).doesNotContain("authorization=Basic marker")
        assertThat(value).doesNotContain("BEGIN PRIVATE KEY")
    }

    @TestConfiguration
    class TestMailDeliveryConfig {
        @Bean
        @Primary
        fun testMailDeliveryPort(): MailDeliveryPort =
            object : MailDeliveryPort {
                override fun send(command: MailDeliveryCommand) {
                    if (command.to == FAILING_TEST_MAIL_RECIPIENT) {
                        error(SENSITIVE_TEST_MAIL_ERROR)
                    }
                }
            }

        @Bean
        fun testJavaMailSender(): JavaMailSender =
            object : JavaMailSender {
                override fun createMimeMessage(): MimeMessage =
                    MimeMessage(Session.getInstance(Properties()))

                override fun createMimeMessage(contentStream: InputStream): MimeMessage =
                    MimeMessage(Session.getInstance(Properties()), contentStream)

                override fun send(mimeMessage: MimeMessage) = Unit

                override fun send(vararg mimeMessages: MimeMessage) = Unit

                override fun send(mimeMessagePreparator: MimeMessagePreparator) = Unit

                override fun send(vararg mimeMessagePreparators: MimeMessagePreparator) = Unit

                override fun send(simpleMessage: SimpleMailMessage) = Unit

                override fun send(vararg simpleMessages: SimpleMailMessage) = Unit
            }
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
