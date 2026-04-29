package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.MemberNotificationItem
import com.readmates.notification.application.port.out.MemberNotificationPort
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.utcOffsetDateTimeOrNull
import com.readmates.shared.db.uuid
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.util.UUID

@Repository
class JdbcMemberNotificationAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : MemberNotificationPort {
    override fun listForMembership(clubId: UUID, membershipId: UUID, limit: Int): List<MemberNotificationItem> {
        if (limit <= 0) {
            return emptyList()
        }

        return jdbcTemplate().query(
            """
            select id, event_id, event_type, title, body, deep_link_path, read_at, created_at
            from member_notifications
            where club_id = ?
              and recipient_membership_id = ?
            order by created_at desc, id desc
            limit ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toMemberNotificationItem() },
            clubId.dbString(),
            membershipId.dbString(),
            limit.coerceIn(1, 100),
        )
    }

    override fun unreadCount(clubId: UUID, membershipId: UUID): Int =
        jdbcTemplate().queryForObject(
            """
            select count(*)
            from member_notifications
            where club_id = ?
              and recipient_membership_id = ?
              and read_at is null
            """.trimIndent(),
            Int::class.java,
            clubId.dbString(),
            membershipId.dbString(),
        ) ?: 0

    override fun markRead(clubId: UUID, membershipId: UUID, notificationId: UUID): Boolean =
        jdbcTemplate().update(
            """
            update member_notifications
            set read_at = coalesce(read_at, utc_timestamp(6))
            where club_id = ?
              and recipient_membership_id = ?
              and id = ?
            """.trimIndent(),
            clubId.dbString(),
            membershipId.dbString(),
            notificationId.dbString(),
        ) > 0

    override fun markAllRead(clubId: UUID, membershipId: UUID): Int =
        jdbcTemplate().update(
            """
            update member_notifications
            set read_at = utc_timestamp(6)
            where club_id = ?
              and recipient_membership_id = ?
              and read_at is null
            """.trimIndent(),
            clubId.dbString(),
            membershipId.dbString(),
        )

    private fun ResultSet.toMemberNotificationItem(): MemberNotificationItem =
        MemberNotificationItem(
            id = uuid("id"),
            eventId = uuid("event_id"),
            eventType = NotificationEventType.valueOf(getString("event_type")),
            title = getString("title"),
            body = getString("body"),
            deepLinkPath = getString("deep_link_path"),
            readAt = utcOffsetDateTimeOrNull("read_at"),
            createdAt = utcOffsetDateTime("created_at"),
        )

    private fun jdbcTemplate(): JdbcTemplate =
        jdbcTemplateProvider.ifAvailable
            ?: throw IllegalStateException("Member notification storage is unavailable")
}
