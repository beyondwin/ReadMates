package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.model.HostNotificationDelivery
import com.readmates.notification.application.model.HostNotificationDetail
import com.readmates.notification.application.model.HostNotificationItemList
import com.readmates.notification.application.model.HostNotificationItemQuery
import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.model.NotificationDeliveryBacklog
import com.readmates.notification.application.model.NotificationDeliveryItem
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.port.out.NotificationDeliveryPort
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class JdbcNotificationDeliveryAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
    objectMapper: ObjectMapper,
) : NotificationDeliveryPort {
    private val rowMappers = NotificationDeliveryRowMappers(objectMapper)
    private val queries = NotificationDeliveryQueries(rowMappers)
    private val writeOperations = NotificationDeliveryWriteOperations(queries, rowMappers)

    @Transactional
    override fun persistPlannedDeliveries(message: NotificationEventMessage): List<NotificationDeliveryItem> =
        writeOperations.persistPlannedDeliveries(jdbcTemplate(), message)

    @Transactional
    override fun claimEmailDelivery(id: UUID): ClaimedNotificationDeliveryItem? =
        writeOperations.claimEmailDelivery(jdbcTemplate(), id)

    @Transactional
    override fun claimEmailDeliveries(limit: Int): List<ClaimedNotificationDeliveryItem> =
        writeOperations.claimEmailDeliveries(jdbcTemplate(), limit)

    @Transactional
    override fun claimEmailDeliveriesForClub(clubId: UUID, limit: Int): List<ClaimedNotificationDeliveryItem> =
        writeOperations.claimEmailDeliveriesForClub(jdbcTemplate(), clubId, limit)

    @Transactional
    override fun claimHostEmailDelivery(clubId: UUID, id: UUID): ClaimedNotificationDeliveryItem? =
        writeOperations.claimHostEmailDelivery(jdbcTemplate(), clubId, id)

    override fun findDeliveryStatus(id: UUID): NotificationDeliveryStatus? =
        queries.findDeliveryStatus(jdbcTemplate(), id)

    override fun markDeliverySent(id: UUID, lockedAt: OffsetDateTime): Boolean =
        writeOperations.markDeliverySent(jdbcTemplate(), id, lockedAt)

    override fun markDeliveryFailed(
        id: UUID,
        lockedAt: OffsetDateTime,
        error: String,
        nextAttemptDelayMinutes: Long,
    ): Boolean =
        writeOperations.markDeliveryFailed(jdbcTemplate(), id, lockedAt, error, nextAttemptDelayMinutes)

    override fun markDeliveryDead(id: UUID, lockedAt: OffsetDateTime, error: String): Boolean =
        writeOperations.markDeliveryDead(jdbcTemplate(), id, lockedAt, error)

    override fun restoreDeadEmailDeliveryForClub(clubId: UUID, id: UUID): Boolean =
        writeOperations.restoreDeadEmailDeliveryForClub(jdbcTemplate(), clubId, id)

    override fun deliveryBacklog(): NotificationDeliveryBacklog =
        queries.deliveryBacklog(jdbcTemplate())

    override fun countByStatus(
        clubId: UUID,
        channel: NotificationChannel?,
        status: NotificationDeliveryStatus,
    ): Int =
        queries.countByStatus(jdbcTemplate(), clubId, channel, status)

    override fun hostSummary(clubId: UUID): HostNotificationSummary =
        queries.hostSummary(jdbcTemplate(), clubId)

    override fun listHostEmailItems(
        clubId: UUID,
        query: HostNotificationItemQuery,
        pageRequest: PageRequest,
    ): HostNotificationItemList =
        queries.listHostEmailItems(jdbcTemplate(), clubId, query, pageRequest)

    override fun hostEmailDetail(clubId: UUID, id: UUID): HostNotificationDetail? =
        queries.hostEmailDetail(jdbcTemplate(), clubId, id)

    override fun listHostDeliveries(
        clubId: UUID,
        status: NotificationDeliveryStatus?,
        channel: NotificationChannel?,
        pageRequest: PageRequest,
    ): CursorPage<HostNotificationDelivery> =
        queries.listHostDeliveries(jdbcTemplate(), clubId, status, channel, pageRequest)

    private fun jdbcTemplate(): JdbcTemplate =
        jdbcTemplateProvider.ifAvailable
            ?: throw IllegalStateException("Notification delivery storage is unavailable")
}

class MissingNotificationEventOutboxException(
    message: String,
) : RuntimeException(message)
