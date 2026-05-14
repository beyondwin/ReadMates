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
import com.readmates.notification.application.port.out.HostNotificationDeliveryLedgerPort
import com.readmates.notification.application.port.out.NotificationDeliveryBacklogPort
import com.readmates.notification.application.port.out.NotificationDeliveryClaimPort
import com.readmates.notification.application.port.out.NotificationDeliveryPlanningPort
import com.readmates.notification.application.port.out.NotificationDeliveryStatusPort
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import org.springframework.beans.factory.annotation.Value
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import tools.jackson.databind.ObjectMapper
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class JdbcNotificationDeliveryAdapter(
    private val jdbcTemplate: JdbcTemplate,
    objectMapper: ObjectMapper,
    @Value("\${readmates.app-base-url:http://localhost:3000}") appBaseUrl: String,
) : NotificationDeliveryPlanningPort,
    NotificationDeliveryClaimPort,
    NotificationDeliveryStatusPort,
    NotificationDeliveryBacklogPort,
    HostNotificationDeliveryLedgerPort {
    private val rowMappers = NotificationDeliveryRowMappers(objectMapper, appBaseUrl)
    private val backlogQueries = NotificationDeliveryBacklogQueries()
    private val ledgerQueries = HostNotificationLedgerQueries(rowMappers, backlogQueries)
    private val planningOperations = NotificationDeliveryPlanningOperations(rowMappers)
    private val claimOperations = NotificationDeliveryClaimOperations(rowMappers)
    private val statusOperations = NotificationDeliveryStatusOperations()

    override fun persistPlannedDeliveries(message: NotificationEventMessage): List<NotificationDeliveryItem> =
        planningOperations.persistPlannedDeliveries(jdbcTemplate, message)

    override fun claimEmailDelivery(id: UUID): ClaimedNotificationDeliveryItem? = claimOperations.claimEmailDelivery(jdbcTemplate, id)

    override fun claimEmailDeliveries(limit: Int): List<ClaimedNotificationDeliveryItem> =
        claimOperations.claimEmailDeliveries(jdbcTemplate, limit)

    override fun claimEmailDeliveriesForClub(
        clubId: UUID,
        limit: Int,
    ): List<ClaimedNotificationDeliveryItem> = claimOperations.claimEmailDeliveriesForClub(jdbcTemplate, clubId, limit)

    override fun claimHostEmailDelivery(
        clubId: UUID,
        id: UUID,
    ): ClaimedNotificationDeliveryItem? = claimOperations.claimHostEmailDelivery(jdbcTemplate, clubId, id)

    override fun findDeliveryStatus(id: UUID): NotificationDeliveryStatus? = statusOperations.findDeliveryStatus(jdbcTemplate, id)

    override fun markDeliverySent(
        id: UUID,
        lockedAt: OffsetDateTime,
    ): Boolean = statusOperations.markDeliverySent(jdbcTemplate, id, lockedAt)

    override fun markDeliveryFailed(
        id: UUID,
        lockedAt: OffsetDateTime,
        error: String,
        nextAttemptDelayMinutes: Long,
    ): Boolean = statusOperations.markDeliveryFailed(jdbcTemplate, id, lockedAt, error, nextAttemptDelayMinutes)

    override fun markDeliveryDead(
        id: UUID,
        lockedAt: OffsetDateTime,
        error: String,
    ): Boolean = statusOperations.markDeliveryDead(jdbcTemplate, id, lockedAt, error)

    override fun restoreDeadEmailDeliveryForClub(
        clubId: UUID,
        id: UUID,
    ): Boolean = statusOperations.restoreDeadEmailDeliveryForClub(jdbcTemplate, clubId, id)

    override fun deliveryBacklog(): NotificationDeliveryBacklog = backlogQueries.deliveryBacklog(jdbcTemplate)

    override fun countByStatus(
        clubId: UUID,
        channel: NotificationChannel?,
        status: NotificationDeliveryStatus,
    ): Int = backlogQueries.countByStatus(jdbcTemplate, clubId, channel, status)

    override fun hostSummary(clubId: UUID): HostNotificationSummary = ledgerQueries.hostSummary(jdbcTemplate, clubId)

    override fun listHostEmailItems(
        clubId: UUID,
        query: HostNotificationItemQuery,
        pageRequest: PageRequest,
    ): HostNotificationItemList = ledgerQueries.listHostEmailItems(jdbcTemplate, clubId, query, pageRequest)

    override fun hostEmailDetail(
        clubId: UUID,
        id: UUID,
    ): HostNotificationDetail? = ledgerQueries.hostEmailDetail(jdbcTemplate, clubId, id)

    override fun listHostDeliveries(
        clubId: UUID,
        status: NotificationDeliveryStatus?,
        channel: NotificationChannel?,
        pageRequest: PageRequest,
    ): CursorPage<HostNotificationDelivery> = ledgerQueries.listHostDeliveries(jdbcTemplate, clubId, status, channel, pageRequest)
}
