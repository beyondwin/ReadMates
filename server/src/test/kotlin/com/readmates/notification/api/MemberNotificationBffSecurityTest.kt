package com.readmates.notification.api

import com.readmates.support.MySqlTestContainer
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post

private const val MEMBER_NOTIFICATION_BFF_CLUB_ID = "00000000-0000-0000-0000-000000000001"
private const val MEMBER_NOTIFICATION_BFF_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000000202"
private const val MEMBER_NOTIFICATION_BFF_ID = "00000000-0000-0000-0000-000000009201"
private const val MEMBER_NOTIFICATION_BFF_EVENT_ID = "00000000-0000-0000-0000-000000008201"
private const val MEMBER_NOTIFICATION_BFF_DELIVERY_ID = "00000000-0000-0000-0000-000000007201"
private const val SECOND_MEMBER_NOTIFICATION_BFF_ID = "00000000-0000-0000-0000-000000009202"
private const val SECOND_MEMBER_NOTIFICATION_BFF_EVENT_ID = "00000000-0000-0000-0000-000000008202"
private const val SECOND_MEMBER_NOTIFICATION_BFF_DELIVERY_ID = "00000000-0000-0000-0000-000000007202"

private const val CLEANUP_MEMBER_NOTIFICATION_BFF_SECURITY_SQL = """
    delete from member_notifications
    where id in (
      '00000000-0000-0000-0000-000000009201',
      '00000000-0000-0000-0000-000000009202'
    );
    delete from notification_deliveries
    where id in (
      '00000000-0000-0000-0000-000000007201',
      '00000000-0000-0000-0000-000000007202'
    );
    delete from notification_event_outbox
    where id in (
      '00000000-0000-0000-0000-000000008201',
      '00000000-0000-0000-0000-000000008202'
    );
"""

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.bff-secret=test-bff-secret",
        "readmates.allowed-origins=http://localhost:3000",
    ],
)
@AutoConfigureMockMvc
@Sql(
    statements = [
        CLEANUP_MEMBER_NOTIFICATION_BFF_SECURITY_SQL,
    ],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [
        CLEANUP_MEMBER_NOTIFICATION_BFF_SECURITY_SQL,
    ],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
class MemberNotificationBffSecurityTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `mark notification read without bff secret is rejected`() {
        insertUnreadNotification()

        mockMvc.post("/api/me/notifications/$MEMBER_NOTIFICATION_BFF_ID/read") {
            with(user("member1@example.com"))
            header("Origin", "http://localhost:3000")
        }.andExpect {
            status { isUnauthorized() }
        }

        assertEquals(1, unreadCount(MEMBER_NOTIFICATION_BFF_ID))
    }

    @Test
    fun `mark notification read without allowed origin is rejected`() {
        insertUnreadNotification()

        mockMvc.post("/api/me/notifications/$MEMBER_NOTIFICATION_BFF_ID/read") {
            with(user("member1@example.com"))
            header("X-Readmates-Bff-Secret", "test-bff-secret")
        }.andExpect {
            status { isForbidden() }
        }

        assertEquals(1, unreadCount(MEMBER_NOTIFICATION_BFF_ID))
    }

    @Test
    fun `mark notification read bff request reaches controller without spring csrf token`() {
        insertUnreadNotification()

        mockMvc.post("/api/me/notifications/$MEMBER_NOTIFICATION_BFF_ID/read") {
            with(user("member1@example.com"))
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
        }.andExpect {
            status { isNoContent() }
        }

        assertEquals(0, unreadCount(MEMBER_NOTIFICATION_BFF_ID))
    }

    @Test
    fun `mark all notifications read without bff secret is rejected`() {
        insertUnreadNotifications()

        mockMvc.post("/api/me/notifications/read-all") {
            with(user("member1@example.com"))
            header("Origin", "http://localhost:3000")
        }.andExpect {
            status { isUnauthorized() }
        }

        assertEquals(2, unreadCount())
    }

    @Test
    fun `mark all notifications read without allowed origin is rejected`() {
        insertUnreadNotifications()

        mockMvc.post("/api/me/notifications/read-all") {
            with(user("member1@example.com"))
            header("X-Readmates-Bff-Secret", "test-bff-secret")
        }.andExpect {
            status { isForbidden() }
        }

        assertEquals(2, unreadCount())
    }

    @Test
    fun `mark all notifications read bff request reaches controller without spring csrf token`() {
        insertUnreadNotifications()

        mockMvc.post("/api/me/notifications/read-all") {
            with(user("member1@example.com"))
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
        }.andExpect {
            status { isOk() }
            jsonPath("$.updatedCount") { value(2) }
        }

        assertEquals(0, unreadCount())
    }

    private fun insertUnreadNotifications() {
        insertUnreadNotification()
        insertUnreadNotification(
            notificationId = SECOND_MEMBER_NOTIFICATION_BFF_ID,
            eventId = SECOND_MEMBER_NOTIFICATION_BFF_EVENT_ID,
            deliveryId = SECOND_MEMBER_NOTIFICATION_BFF_DELIVERY_ID,
            dedupeSuffix = "second",
        )
    }

    private fun insertUnreadNotification(
        notificationId: String = MEMBER_NOTIFICATION_BFF_ID,
        eventId: String = MEMBER_NOTIFICATION_BFF_EVENT_ID,
        deliveryId: String = MEMBER_NOTIFICATION_BFF_DELIVERY_ID,
        dedupeSuffix: String = "first",
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
            ) values (
              ?,
              ?,
              'NEXT_BOOK_PUBLISHED',
              'SESSION',
              '00000000-0000-0000-0000-000000000301',
              json_object('source', 'member-notification-bff-security-test'),
              'PUBLISHED',
              ?,
              ?
            )
            """.trimIndent(),
            eventId,
            MEMBER_NOTIFICATION_BFF_CLUB_ID,
            "member-notification-bff-security-test-$dedupeSuffix",
            "member-notification-bff-security-test-$dedupeSuffix",
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
              dedupe_key
            ) values (
              ?,
              ?,
              ?,
              ?,
              'IN_APP',
              'SENT',
              ?
            )
            """.trimIndent(),
            deliveryId,
            eventId,
            MEMBER_NOTIFICATION_BFF_CLUB_ID,
            MEMBER_NOTIFICATION_BFF_MEMBERSHIP_ID,
            "member-notification-bff-security-delivery-$dedupeSuffix",
        )
        jdbcTemplate.update(
            """
            insert into member_notifications (
              id,
              event_id,
              delivery_id,
              club_id,
              recipient_membership_id,
              event_type,
              title,
              body,
              deep_link_path
            ) values (
              ?,
              ?,
              ?,
              ?,
              ?,
              'NEXT_BOOK_PUBLISHED',
              'BFF security test',
              'Security regression notification',
              '/app/sessions/current'
            )
            """.trimIndent(),
            notificationId,
            eventId,
            deliveryId,
            MEMBER_NOTIFICATION_BFF_CLUB_ID,
            MEMBER_NOTIFICATION_BFF_MEMBERSHIP_ID,
        )
    }

    private fun unreadCount(vararg ids: String): Int {
        val idPredicate = if (ids.isEmpty()) {
            """
              and id in (
                '$MEMBER_NOTIFICATION_BFF_ID',
                '$SECOND_MEMBER_NOTIFICATION_BFF_ID'
              )
            """.trimIndent()
        } else {
            "and id in (${ids.joinToString(",") { "'$it'" }})"
        }
        return jdbcTemplate.queryForObject(
            """
            select count(*)
            from member_notifications
            where club_id = ?
              and recipient_membership_id = ?
              and read_at is null
              $idPredicate
            """.trimIndent(),
            Int::class.java,
            MEMBER_NOTIFICATION_BFF_CLUB_ID,
            MEMBER_NOTIFICATION_BFF_MEMBERSHIP_ID,
        ) ?: 0
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
