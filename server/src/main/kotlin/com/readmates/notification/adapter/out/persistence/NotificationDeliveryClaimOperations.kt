package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.shared.db.dbString
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID

private const val DELIVERY_LEASE_TIMEOUT_MINUTES = 15

internal class NotificationDeliveryClaimOperations(
    private val rowMappers: NotificationDeliveryRowMappers,
) {
    fun claimEmailDelivery(
        jdbcTemplate: JdbcTemplate,
        id: UUID,
    ): ClaimedNotificationDeliveryItem? {
        resetStaleSendingRows(jdbcTemplate)
        val selectedId =
            jdbcTemplate
                .query(
                    """
                    select id
                    from notification_deliveries
                    where id = ?
                      and channel = 'EMAIL'
                      and status in ('PENDING', 'FAILED')
                      and next_attempt_at <= utc_timestamp(6)
                    limit 1
                    for update skip locked
                    """.trimIndent(),
                    { resultSet, _ -> resultSet.getString("id").let(UUID::fromString) },
                    id.dbString(),
                ).firstOrNull() ?: return null

        val updated =
            jdbcTemplate.update(
                """
                update notification_deliveries
                set status = 'SENDING',
                    locked_at = utc_timestamp(6),
                    updated_at = utc_timestamp(6)
                where id = ?
                  and channel = 'EMAIL'
                  and status in ('PENDING', 'FAILED')
                """.trimIndent(),
                selectedId.dbString(),
            )
        if (updated == 0) {
            return null
        }

        return claimedDeliveryItems(jdbcTemplate, listOf(selectedId)).firstOrNull()
    }

    fun claimEmailDeliveries(
        jdbcTemplate: JdbcTemplate,
        limit: Int,
    ): List<ClaimedNotificationDeliveryItem> {
        if (limit <= 0) {
            return emptyList()
        }

        resetStaleSendingRows(jdbcTemplate)
        val ids =
            jdbcTemplate.query(
                """
                select id
                from notification_deliveries
                where channel = 'EMAIL'
                  and status in ('PENDING', 'FAILED')
                  and next_attempt_at <= utc_timestamp(6)
                order by next_attempt_at, created_at
                limit ?
                for update skip locked
                """.trimIndent(),
                { resultSet, _ -> resultSet.getString("id").let(UUID::fromString) },
                limit,
            )
        if (ids.isEmpty()) {
            return emptyList()
        }

        val placeholders = ids.joinToString(",") { "?" }
        jdbcTemplate.update(
            """
            update notification_deliveries
            set status = 'SENDING',
                locked_at = utc_timestamp(6),
                updated_at = utc_timestamp(6)
            where id in ($placeholders)
              and channel = 'EMAIL'
              and status in ('PENDING', 'FAILED')
            """.trimIndent(),
            *ids.map { it.dbString() as Any }.toTypedArray(),
        )

        return claimedDeliveryItems(jdbcTemplate, ids)
    }

    fun claimEmailDeliveriesForClub(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        limit: Int,
    ): List<ClaimedNotificationDeliveryItem> {
        if (limit <= 0) {
            return emptyList()
        }

        resetStaleSendingRows(jdbcTemplate, clubId)
        val ids =
            jdbcTemplate.query(
                """
                select id
                from notification_deliveries
                where club_id = ?
                  and channel = 'EMAIL'
                  and status in ('PENDING', 'FAILED')
                  and next_attempt_at <= utc_timestamp(6)
                order by next_attempt_at, created_at
                limit ?
                for update skip locked
                """.trimIndent(),
                { resultSet, _ -> resultSet.getString("id").let(UUID::fromString) },
                clubId.dbString(),
                limit,
            )
        if (ids.isEmpty()) {
            return emptyList()
        }

        val placeholders = ids.joinToString(",") { "?" }
        jdbcTemplate.update(
            """
            update notification_deliveries
            set status = 'SENDING',
                locked_at = utc_timestamp(6),
                updated_at = utc_timestamp(6)
            where club_id = ?
              and id in ($placeholders)
              and channel = 'EMAIL'
              and status in ('PENDING', 'FAILED')
            """.trimIndent(),
            *(listOf(clubId.dbString() as Any) + ids.map { it.dbString() as Any }).toTypedArray(),
        )

        return claimedDeliveryItems(jdbcTemplate, ids)
    }

    fun claimHostEmailDelivery(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        id: UUID,
    ): ClaimedNotificationDeliveryItem? {
        resetStaleSendingRows(jdbcTemplate, clubId)
        val selectedId =
            jdbcTemplate
                .query(
                    """
                    select id
                    from notification_deliveries
                    where club_id = ?
                      and id = ?
                      and channel = 'EMAIL'
                      and status in ('PENDING', 'FAILED')
                      and next_attempt_at <= utc_timestamp(6)
                    limit 1
                    for update skip locked
                    """.trimIndent(),
                    { resultSet, _ -> resultSet.getString("id").let(UUID::fromString) },
                    clubId.dbString(),
                    id.dbString(),
                ).firstOrNull() ?: return null

        val updated =
            jdbcTemplate.update(
                """
                update notification_deliveries
                set status = 'SENDING',
                    locked_at = utc_timestamp(6),
                    updated_at = utc_timestamp(6)
                where club_id = ?
                  and id = ?
                  and channel = 'EMAIL'
                  and status in ('PENDING', 'FAILED')
                """.trimIndent(),
                clubId.dbString(),
                selectedId.dbString(),
            )
        if (updated == 0) {
            return null
        }

        return claimedDeliveryItems(jdbcTemplate, listOf(selectedId)).firstOrNull()
    }

    private fun claimedDeliveryItems(
        jdbcTemplate: JdbcTemplate,
        ids: List<UUID>,
    ): List<ClaimedNotificationDeliveryItem> {
        if (ids.isEmpty()) {
            return emptyList()
        }

        val placeholders = ids.joinToString(",") { "?" }
        val orderedArgs = (ids.map { it.dbString() as Any } + ids.map { it.dbString() as Any }).toTypedArray()
        return jdbcTemplate.query(
            """
            select
              notification_deliveries.id,
              notification_deliveries.event_id,
              notification_deliveries.club_id,
              notification_deliveries.recipient_membership_id,
              notification_deliveries.channel,
              notification_deliveries.status,
              notification_deliveries.attempt_count,
              notification_deliveries.locked_at,
              notification_event_outbox.event_type,
              notification_event_outbox.aggregate_id,
              notification_event_outbox.payload_json,
              clubs.slug as club_slug,
              clubs.name as club_name,
              users.email as recipient_email,
              coalesce(memberships.short_name, users.name) as display_name
            from notification_deliveries
            join notification_event_outbox on notification_event_outbox.id = notification_deliveries.event_id
              and notification_event_outbox.club_id = notification_deliveries.club_id
            join clubs on clubs.id = notification_event_outbox.club_id
            join memberships on memberships.id = notification_deliveries.recipient_membership_id
              and memberships.club_id = notification_deliveries.club_id
            join users on users.id = memberships.user_id
            where notification_deliveries.id in ($placeholders)
            order by field(notification_deliveries.id, $placeholders)
            """.trimIndent(),
            { resultSet, _ -> with(rowMappers) { resultSet.toClaimedNotificationDeliveryItem() } },
            *orderedArgs,
        )
    }

    private fun resetStaleSendingRows(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID? = null,
    ) {
        val clubPredicate = if (clubId == null) "" else "and club_id = ?"
        val args = if (clubId == null) emptyArray() else arrayOf(clubId.dbString() as Any)
        jdbcTemplate.update(
            """
            update notification_deliveries
            set status = 'PENDING',
                locked_at = null,
                next_attempt_at = utc_timestamp(6),
                updated_at = utc_timestamp(6)
            where channel = 'EMAIL'
              and status = 'SENDING'
              and locked_at < timestampadd(MINUTE, ?, utc_timestamp(6))
              $clubPredicate
            """.trimIndent(),
            -DELIVERY_LEASE_TIMEOUT_MINUTES,
            *args,
        )
    }
}
