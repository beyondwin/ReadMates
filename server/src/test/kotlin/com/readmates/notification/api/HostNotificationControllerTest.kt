package com.readmates.notification.api

import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryPort
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

private const val CLEANUP_HOST_NOTIFICATIONS_SQL = """
    delete from notification_outbox
    where dedupe_key like 'host-notification-controller-test-%';
    delete from clubs
    where id = '00000000-0000-0000-0000-000000000002';
"""

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
        jdbcTemplate.update(
            """
            insert into notification_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id,
              recipient_email, subject, body_text, deep_link_path, status,
              attempt_count, last_error, dedupe_key
            ) values (
              '00000000-0000-0000-0000-000000009001',
              '00000000-0000-0000-0000-000000000001',
              'FEEDBACK_DOCUMENT_PUBLISHED',
              'SESSION',
              '00000000-0000-0000-0000-000000000301',
              'member@example.com',
              '피드백 문서가 올라왔습니다',
              'ReadMates에서 확인해 주세요.',
              '/app/feedback/00000000-0000-0000-0000-000000000301',
              'FAILED',
              2,
              'SMTP temporary failure',
              'host-notification-controller-test-failed'
            )
            """.trimIndent(),
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
    fun `host can list notification outbox items with masked recipients`() {
        insertNotification(
            id = "00000000-0000-0000-0000-000000009401",
            clubId = "00000000-0000-0000-0000-000000000001",
            status = NotificationOutboxStatus.PENDING,
            dedupeKey = "host-notification-controller-test-list",
        )

        val response = mockMvc.get("/api/host/notifications/items?status=PENDING") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.items[0].id") { value("00000000-0000-0000-0000-000000009401") }
            jsonPath("$.items[0].recipientEmail") { value("m***@example.com") }
            jsonPath("$.items[0].eventType") { value("FEEDBACK_DOCUMENT_PUBLISHED") }
            jsonPath("$.items[0].status") { value("PENDING") }
        }.andReturn().response.contentAsString

        assertThat(response).doesNotContain("subject")
        assertThat(response).doesNotContain("member@example.com")
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
        assertThat(response).doesNotContain("sample-secret-value")
        assertThat(response).doesNotContain("apiKey")
        assertThat(response).doesNotContain("sample-api-key")
        assertThat(response).doesNotContain("password")
        assertThat(response).doesNotContain("sample-password")
        assertThat(response).doesNotContain("accessKeyId")
        assertThat(response).doesNotContain("AKIAIOSFODNN7EXAMPLE")
        assertThat(response).doesNotContain("privateKeyPem")
        assertThat(response).doesNotContain("BEGIN PRIVATE KEY")
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
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about)
            values (
              '00000000-0000-0000-0000-000000000002',
              'other-club',
              'Other Club',
              'Separate reading club',
              'Separate club for notification processing scope tests.'
            )
            """.trimIndent(),
        )
        insertPendingNotification(
            id = "00000000-0000-0000-0000-000000009101",
            clubId = "00000000-0000-0000-0000-000000000001",
            dedupeKey = "host-notification-controller-test-host-club",
        )
        insertPendingNotification(
            id = "00000000-0000-0000-0000-000000009102",
            clubId = "00000000-0000-0000-0000-000000000002",
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
            from notification_outbox
            where id = '00000000-0000-0000-0000-000000009102'
            """.trimIndent(),
            String::class.java,
        )
        val hostClubStatus = jdbcTemplate.queryForObject(
            """
            select status
            from notification_outbox
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

    private fun insertNotification(
        id: String,
        clubId: String,
        status: NotificationOutboxStatus,
        dedupeKey: String,
        lastError: String? = null,
    ) {
        jdbcTemplate.update(
            """
            insert into notification_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id,
              recipient_email, subject, body_text, deep_link_path, metadata, status, last_error, dedupe_key
            ) values (
              ?,
              ?,
              'FEEDBACK_DOCUMENT_PUBLISHED',
              'SESSION',
              '00000000-0000-0000-0000-000000000301',
              'member@example.com',
              '피드백 문서가 올라왔습니다',
              'ReadMates에서 확인해 주세요.',
              '/app/feedback/00000000-0000-0000-0000-000000000301',
              json_object(
                'sessionNumber', 3,
                'bookTitle', '메타데이터 테스트 책',
                'recipientEmail', 'member@example.com',
                'bodyText', 'ReadMates에서 확인해 주세요.',
                'inviteToken', 'sample-secret-value',
                'apiKey', 'sample-api-key',
                'password', 'sample-password',
                'accessKeyId', 'AKIAIOSFODNN7EXAMPLE',
                'privateKeyPem', '-----BEGIN PRIVATE KEY-----',
                'signingKeyId', 'signing-key-id',
                'authorization', 'Bearer sample-token',
                'credential', 'sample-credential'
              ),
              ?,
              ?,
              ?
            )
            """.trimIndent(),
            id,
            clubId,
            status.name,
            lastError,
            dedupeKey,
        )
    }

    @TestConfiguration
    class TestMailDeliveryConfig {
        @Bean
        @Primary
        fun testMailDeliveryPort(): MailDeliveryPort =
            object : MailDeliveryPort {
                override fun send(command: MailDeliveryCommand) = Unit
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
