package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.NotificationEventOutboxBacklog
import com.readmates.notification.application.port.out.NotificationEventOutboxBacklogPort
import com.readmates.notification.domain.NotificationEventOutboxStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

@Repository
internal class NotificationEventOutboxBacklogQueries(
    private val jdbcTemplate: JdbcTemplate,
) : NotificationEventOutboxBacklogPort {
    override fun eventOutboxBacklog(): NotificationEventOutboxBacklog {
        val counts =
            jdbcTemplate
                .query(
                    """
                    select status, count(*) as status_count
                    from notification_event_outbox
                    where status in ('PENDING', 'FAILED', 'DEAD', 'PUBLISHING')
                    group by status
                    """.trimIndent(),
                    { resultSet, _ ->
                        NotificationEventOutboxStatus.valueOf(resultSet.getString("status")) to
                            resultSet.getInt("status_count")
                    },
                ).toMap()

        return NotificationEventOutboxBacklog(
            pending = counts[NotificationEventOutboxStatus.PENDING] ?: 0,
            failed = counts[NotificationEventOutboxStatus.FAILED] ?: 0,
            dead = counts[NotificationEventOutboxStatus.DEAD] ?: 0,
            publishing = counts[NotificationEventOutboxStatus.PUBLISHING] ?: 0,
        )
    }
}
