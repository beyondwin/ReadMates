package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.ManualNotificationDispatchList
import com.readmates.notification.application.model.ManualNotificationSelection
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.out.ManualNotificationConfirmAttempt
import com.readmates.notification.application.port.out.ManualNotificationConfirmTransactionInput
import com.readmates.notification.application.port.out.ManualNotificationDispatchPort
import com.readmates.notification.application.port.out.ManualNotificationPreviewRecord
import com.readmates.notification.application.port.out.ManualNotificationSessionContext
import com.readmates.notification.application.port.out.ManualNotificationStoredDispatch
import com.readmates.notification.application.port.out.ManualNotificationTargetSnapshot
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import org.springframework.beans.factory.annotation.Value
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class JdbcManualNotificationDispatchAdapter(
    jdbcTemplate: JdbcTemplate,
    objectMapper: ObjectMapper,
    @Value(
        "\${readmates.notifications.kafka.events-topic:readmates.notification.events.v1}",
    )
    eventsTopic: String,
) : ManualNotificationDispatchPort {
    private val rows = ManualNotificationDispatchRows
    private val readQueries = ManualNotificationDispatchReadQueries(jdbcTemplate, rows)
    private val audienceQueries = ManualNotificationAudienceQueries(jdbcTemplate)
    private val previewStore = ManualNotificationPreviewStore(jdbcTemplate)
    private val confirmStore =
        ManualNotificationConfirmStore(
            jdbcTemplate = jdbcTemplate,
            objectMapper = objectMapper,
            eventsTopic = eventsTopic,
            readQueries = readQueries,
            audienceQueries = audienceQueries,
            previewStore = previewStore,
            rows = rows,
        )

    override fun findSessionContext(
        clubId: UUID,
        sessionId: UUID,
    ): ManualNotificationSessionContext? = readQueries.findSessionContext(clubId, sessionId, forUpdate = false)

    override fun listMembers(
        clubId: UUID,
        sessionId: UUID?,
        search: String?,
        pageRequest: PageRequest,
    ) = readQueries.listMembers(clubId, sessionId, search, pageRequest)

    override fun listDispatches(
        clubId: UUID,
        sessionId: UUID?,
        eventType: NotificationEventType?,
        pageRequest: PageRequest,
    ): ManualNotificationDispatchList = readQueries.listDispatches(clubId, sessionId, eventType, pageRequest)

    override fun validateMembershipEdits(
        clubId: UUID,
        membershipIds: Set<UUID>,
    ): Boolean = audienceQueries.validateMembershipEdits(clubId, membershipIds)

    override fun previewTargets(
        clubId: UUID,
        selection: ManualNotificationSelection,
    ): ManualNotificationTargetSnapshot = audienceQueries.previewTargets(clubId, selection)

    override fun recentDispatches(
        clubId: UUID,
        sessionId: UUID,
        eventType: NotificationEventType,
        contentRevision: String,
    ) = readQueries.recentDispatches(clubId, sessionId, eventType, contentRevision)

    override fun insertPreview(
        clubId: UUID,
        hostMembershipId: UUID,
        selectionHash: String,
        targetSnapshotHash: String,
        expiresAt: OffsetDateTime,
    ): UUID = previewStore.insertPreview(clubId, hostMembershipId, selectionHash, targetSnapshotHash, expiresAt)

    override fun findPreview(
        id: UUID,
        clubId: UUID,
        hostMembershipId: UUID,
    ): ManualNotificationPreviewRecord? = previewStore.findPreview(id, clubId, hostMembershipId)

    @Transactional
    override fun confirmManualDispatch(input: ConfirmInput) = confirmStore.confirmManualDispatch(input)

    @Transactional
    override fun insertManualDispatch(
        clubId: UUID,
        hostMembershipId: UUID,
        selection: ManualNotificationSelection,
        payload: NotificationEventPayload,
        targetSnapshot: ManualNotificationTargetSnapshot,
        resend: Boolean,
    ): ManualNotificationStoredDispatch =
        confirmStore.insertManualDispatch(clubId, hostMembershipId, selection, payload, targetSnapshot, resend)
}

private typealias ConfirmInput = ManualNotificationConfirmTransactionInput
