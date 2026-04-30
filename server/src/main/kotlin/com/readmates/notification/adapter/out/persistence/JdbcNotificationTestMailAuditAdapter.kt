package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.NotificationTestMailAuditItem
import com.readmates.notification.application.model.NotificationTestMailStatus
import com.readmates.notification.application.port.out.NotificationTestMailAuditPort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.sql.ResultSet
import java.time.OffsetDateTime
import java.util.UUID

private const val TEST_MAIL_AUDIT_LIMIT = 50
private const val MAX_TEST_MAIL_STORAGE_ERROR_LENGTH = 500

@Repository
class JdbcNotificationTestMailAuditAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : NotificationTestMailAuditPort {
    @Transactional
    override fun reserveTestMailAuditAttempt(
        clubId: UUID,
        hostMembershipId: UUID,
        recipientMaskedEmail: String,
        recipientEmailHash: String,
        cooldownStartedAfter: OffsetDateTime,
    ): NotificationTestMailAuditItem? {
        val jdbcTemplate = jdbcTemplate()
        val lockedHostMembershipId = jdbcTemplate.query(
            """
            select id
            from memberships
            where id = ?
              and club_id = ?
            limit 1
            for update
            """.trimIndent(),
            { resultSet, _ -> resultSet.uuid("id") },
            hostMembershipId.dbString(),
            clubId.dbString(),
        ).firstOrNull() ?: return null

        val recentAttemptId = jdbcTemplate.query(
            """
            select id
            from notification_test_mail_audit
            where club_id = ?
              and host_membership_id = ?
              and created_at > ?
            order by created_at desc
            limit 1
            for update
            """.trimIndent(),
            { resultSet, _ -> resultSet.uuid("id") },
            clubId.dbString(),
            lockedHostMembershipId.dbString(),
            cooldownStartedAfter.toUtcLocalDateTime(),
        ).firstOrNull()
        if (recentAttemptId != null) {
            return null
        }

        val id = UUID.randomUUID()
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
            ) values (?, ?, ?, ?, ?, 'SENT', null)
            """.trimIndent(),
            id.dbString(),
            clubId.dbString(),
            lockedHostMembershipId.dbString(),
            recipientMaskedEmail,
            recipientEmailHash,
        )

        return jdbcTemplate.query(
            """
            select id, recipient_masked_email, status, last_error, created_at
            from notification_test_mail_audit
            where id = ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toNotificationTestMailAuditItem() },
            id.dbString(),
        ).single()
    }

    override fun markTestMailAuditFailed(id: UUID, lastError: String): NotificationTestMailAuditItem {
        val updated = jdbcTemplate().update(
            """
            update notification_test_mail_audit
            set status = 'FAILED',
                last_error = ?,
                updated_at = utc_timestamp(6)
            where id = ?
            """.trimIndent(),
            lastError.take(MAX_TEST_MAIL_STORAGE_ERROR_LENGTH),
            id.dbString(),
        )
        if (updated == 0) {
            throw IllegalStateException("Notification test mail audit row not found")
        }

        return jdbcTemplate().query(
            """
            select id, recipient_masked_email, status, last_error, created_at
            from notification_test_mail_audit
            where id = ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toNotificationTestMailAuditItem() },
            id.dbString(),
        ).single()
    }

    override fun listTestMailAudit(clubId: UUID, pageRequest: PageRequest): CursorPage<NotificationTestMailAuditItem> {
        val cursor = TestMailAuditCreatedAtDescCursor.from(pageRequest.cursor)
        val rows = jdbcTemplate().query(
            """
            select id, recipient_masked_email, status, last_error, created_at
            from notification_test_mail_audit
            where club_id = ?
              and (
                ? is null
                or created_at < ?
                or (created_at = ? and id < ?)
              )
            order by created_at desc, id desc
            limit ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toNotificationTestMailAuditItem() },
            clubId.dbString(),
            cursor?.createdAt,
            cursor?.createdAt?.toUtcLocalDateTime(),
            cursor?.createdAt?.toUtcLocalDateTime(),
            cursor?.id,
            pageRequest.limit.coerceAtMost(TEST_MAIL_AUDIT_LIMIT) + 1,
        )
        val limit = pageRequest.limit.coerceAtMost(TEST_MAIL_AUDIT_LIMIT)
        return pageFromRows(rows, limit) { row ->
            testMailAuditCreatedAtDescCursor(row.createdAt, row.id.toString())
        }
    }

    private fun ResultSet.toNotificationTestMailAuditItem(): NotificationTestMailAuditItem =
        NotificationTestMailAuditItem(
            id = uuid("id"),
            recipientEmail = getString("recipient_masked_email"),
            status = NotificationTestMailStatus.valueOf(getString("status")),
            lastError = getString("last_error"),
            createdAt = utcOffsetDateTime("created_at"),
        )

    private fun jdbcTemplate(): JdbcTemplate =
        jdbcTemplateProvider.ifAvailable
            ?: throw IllegalStateException("Notification test mail audit storage is unavailable")
}

private fun testMailAuditCreatedAtDescCursor(createdAt: OffsetDateTime, id: String): String? =
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

private data class TestMailAuditCreatedAtDescCursor(
    val createdAt: OffsetDateTime,
    val id: String,
) {
    companion object {
        fun from(cursor: Map<String, String>): TestMailAuditCreatedAtDescCursor? {
            val createdAt = cursor["createdAt"]?.let { runCatching { OffsetDateTime.parse(it) }.getOrNull() }
                ?: return null
            val id = cursor["id"]?.takeIf { it.isNotBlank() } ?: return null
            return TestMailAuditCreatedAtDescCursor(createdAt, id)
        }
    }
}
