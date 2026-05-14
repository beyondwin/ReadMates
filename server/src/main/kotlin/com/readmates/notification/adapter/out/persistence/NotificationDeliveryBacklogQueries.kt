package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.NotificationDeliveryBacklog
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.shared.db.dbString
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID

internal class NotificationDeliveryBacklogQueries {
    fun deliveryBacklog(jdbcTemplate: JdbcTemplate): NotificationDeliveryBacklog {
        val counts =
            jdbcTemplate
                .query(
                    """
                    select status, count(*) as status_count
                    from notification_deliveries
                    where channel = 'EMAIL'
                      and status in ('PENDING', 'FAILED', 'DEAD', 'SENDING')
                    group by status
                    """.trimIndent(),
                    { resultSet, _ ->
                        NotificationDeliveryStatus.valueOf(resultSet.getString("status")) to resultSet.getInt("status_count")
                    },
                ).toMap()

        return NotificationDeliveryBacklog(
            pending = counts[NotificationDeliveryStatus.PENDING] ?: 0,
            failed = counts[NotificationDeliveryStatus.FAILED] ?: 0,
            dead = counts[NotificationDeliveryStatus.DEAD] ?: 0,
            sending = counts[NotificationDeliveryStatus.SENDING] ?: 0,
        )
    }

    fun countByStatus(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        channel: NotificationChannel?,
        status: NotificationDeliveryStatus,
    ): Int {
        val channelPredicate = if (channel == null) "" else "and channel = ?"
        val args = mutableListOf<Any>(clubId.dbString(), status.name)
        channel?.let { args += it.name }
        return jdbcTemplate.queryForObject(
            """
            select count(*)
            from notification_deliveries
            where club_id = ?
              and status = ?
              $channelPredicate
            """.trimIndent(),
            Int::class.java,
            *args.toTypedArray(),
        ) ?: 0
    }
}
