package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.MemberNotificationItem
import com.readmates.notification.application.port.out.MemberNotificationPort
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.utcOffsetDateTimeOrNull
import com.readmates.shared.db.uuid
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class JdbcMemberNotificationAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : MemberNotificationPort {
    override fun listForMembership(
        clubId: UUID,
        membershipId: UUID,
        pageRequest: PageRequest,
    ): CursorPage<MemberNotificationItem> {
        val cursor = MemberNotificationCreatedAtDescCursor.from(pageRequest.cursor)
        val rows = jdbcTemplate().query(
            """
            select id, event_id, event_type, title, body, deep_link_path, read_at, created_at
            from member_notifications
            where club_id = ?
              and recipient_membership_id = ?
              and (
                ? is null
                or created_at < ?
                or (created_at = ? and id < ?)
              )
            order by created_at desc, id desc
            limit ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toMemberNotificationItem() },
            clubId.dbString(),
            membershipId.dbString(),
            cursor?.createdAt,
            cursor?.createdAt?.let { java.sql.Timestamp.valueOf(it.atZoneSameInstant(java.time.ZoneOffset.UTC).toLocalDateTime()) },
            cursor?.createdAt?.let { java.sql.Timestamp.valueOf(it.atZoneSameInstant(java.time.ZoneOffset.UTC).toLocalDateTime()) },
            cursor?.id,
            pageRequest.limit + 1,
        )
        return pageFromRows(rows, pageRequest.limit) { row ->
            memberNotificationCreatedAtDescCursor(row.createdAt, row.id.toString())
        }
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

private fun memberNotificationCreatedAtDescCursor(createdAt: OffsetDateTime, id: String): String? =
    CursorCodec.encode(
        mapOf(
            "createdAt" to createdAt.toString(),
            "id" to id,
        ),
    )

private fun <T> pageFromRows(rows: List<T>, limit: Int, cursorFor: (T) -> String?): CursorPage<T> {
    val visibleRows = rows.take(limit)
    return CursorPage(
        items = visibleRows,
        nextCursor = if (rows.size > limit) visibleRows.lastOrNull()?.let(cursorFor) else null,
    )
}

private data class MemberNotificationCreatedAtDescCursor(
    val createdAt: OffsetDateTime,
    val id: String,
) {
    companion object {
        fun from(cursor: Map<String, String>): MemberNotificationCreatedAtDescCursor? {
            val createdAt = cursor["createdAt"]?.let { runCatching { OffsetDateTime.parse(it) }.getOrNull() }
                ?: return null
            val id = cursor["id"]?.takeIf { it.isNotBlank() } ?: return null
            return MemberNotificationCreatedAtDescCursor(createdAt, id)
        }
    }
}
