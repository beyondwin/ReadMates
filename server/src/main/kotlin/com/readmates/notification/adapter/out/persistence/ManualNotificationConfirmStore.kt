package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.ManualNotificationAudience
import com.readmates.notification.application.model.ManualNotificationConfirmSummary
import com.readmates.notification.application.model.ManualNotificationRequestedChannels
import com.readmates.notification.application.model.ManualNotificationSelection
import com.readmates.notification.application.model.NotificationDispatchSource
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.model.NotificationManualDispatchPayload
import com.readmates.notification.application.model.allowedManualAudiences
import com.readmates.notification.application.port.out.ManualNotificationConfirmAttempt
import com.readmates.notification.application.port.out.ManualNotificationConfirmInsertStatus
import com.readmates.notification.application.port.out.ManualNotificationConfirmRejection
import com.readmates.notification.application.port.out.ManualNotificationConfirmTransactionInput
import com.readmates.notification.application.port.out.ManualNotificationConfirmedDispatch
import com.readmates.notification.application.port.out.ManualNotificationSessionContext
import com.readmates.notification.application.port.out.ManualNotificationStoredDispatch
import com.readmates.notification.application.port.out.ManualNotificationTargetSnapshot
import com.readmates.notification.application.port.out.contentRevision
import com.readmates.notification.application.port.out.manualDispatchDisabledReason
import com.readmates.notification.application.port.out.snapshotHash
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import org.springframework.jdbc.core.JdbcTemplate
import tools.jackson.databind.ObjectMapper
import java.security.MessageDigest
import java.time.OffsetDateTime
import java.util.UUID

internal class ManualNotificationConfirmStore(
    jdbcTemplate: JdbcTemplate,
    objectMapper: ObjectMapper,
    eventsTopic: String,
    readQueries: ManualNotificationDispatchReadQueries,
    audienceQueries: ManualNotificationAudienceQueries,
    previewStore: ManualNotificationPreviewStore,
    rows: ManualNotificationDispatchRows,
    sessionGuard: SessionScopedNotificationGuard,
) {
    private val writer = ManualNotificationConfirmWriter(jdbcTemplate, objectMapper, eventsTopic, sessionGuard)
    private val confirmation =
        ManualNotificationConfirmation(
            jdbcTemplate = jdbcTemplate,
            readQueries = readQueries,
            audienceQueries = audienceQueries,
            previewStore = previewStore,
            rows = rows,
            writer = writer,
        )

    fun confirmManualDispatch(input: ManualNotificationConfirmTransactionInput): ManualNotificationConfirmAttempt =
        confirmation.confirmManualDispatch(input)

    fun insertManualDispatch(
        clubId: UUID,
        hostMembershipId: UUID,
        selection: ManualNotificationSelection,
        payload: NotificationEventPayload,
        targetSnapshot: ManualNotificationTargetSnapshot,
        resend: Boolean,
    ): ManualNotificationStoredDispatch =
        writer.insertManualDispatch(
            clubId,
            hostMembershipId,
            selection,
            payload,
            targetSnapshot,
            resend,
        )
}

private class ManualNotificationConfirmation(
    private val jdbcTemplate: JdbcTemplate,
    private val readQueries: ManualNotificationDispatchReadQueries,
    private val audienceQueries: ManualNotificationAudienceQueries,
    private val previewStore: ManualNotificationPreviewStore,
    private val rows: ManualNotificationDispatchRows,
    private val writer: ManualNotificationConfirmWriter,
) {
    fun confirmManualDispatch(input: ManualNotificationConfirmTransactionInput): ManualNotificationConfirmAttempt {
        writer.lockClubForAudienceMutation(input.clubId)
        val session =
            readQueries.findSessionContext(input.clubId, input.selection.sessionId, forUpdate = true)
                ?: return rejected(ManualNotificationConfirmRejection.SESSION_STATE_INVALID)
        val preview = previewStore.lockPreview(input.previewId, input.clubId, input.hostMembershipId)
        return confirmPreview(input, preview, session)
    }

    private fun confirmPreview(
        input: ManualNotificationConfirmTransactionInput,
        preview: LockedManualNotificationPreview?,
        session: ManualNotificationSessionContext,
    ): ManualNotificationConfirmAttempt =
        when {
            preview == null -> rejected(ManualNotificationConfirmRejection.PREVIEW_NOT_FOUND)
            else ->
                previewRejection(preview, input)
                    ?.let(::rejected)
                    ?: confirmSession(input, preview, session)
        }

    private fun confirmSession(
        input: ManualNotificationConfirmTransactionInput,
        preview: LockedManualNotificationPreview,
        session: ManualNotificationSessionContext,
    ): ManualNotificationConfirmAttempt =
        when {
            !audienceQueries.isCurrentHost(input.clubId, input.hostMembershipId) ->
                rejected(ManualNotificationConfirmRejection.HOST_NOT_AUTHORIZED)
            preview.consumedEventId != null -> replayConsumed(input.clubId, preview.consumedEventId)
            else -> confirmFreshPreview(input, preview, session)
        }

    private fun confirmFreshPreview(
        input: ManualNotificationConfirmTransactionInput,
        preview: LockedManualNotificationPreview,
        session: ManualNotificationSessionContext,
    ): ManualNotificationConfirmAttempt {
        val rejection = sessionRejection(session, input.selection)
        return if (rejection != null) {
            rejected(rejection)
        } else {
            audienceQueries.lockAudienceInputs(input.clubId, input.selection.sessionId)
            when (val target = resolveTarget(input.clubId, preview, input.selection)) {
                is TargetResolution.Rejected -> rejected(target.reason)
                is TargetResolution.Eligible -> confirmEligible(input, session, target.snapshot)
            }
        }
    }

    private fun resolveTarget(
        clubId: UUID,
        preview: LockedManualNotificationPreview,
        selection: ManualNotificationSelection,
    ): TargetResolution {
        val editedIds =
            (
                selection.selectedMembershipIds +
                    selection.includedMembershipIds +
                    selection.excludedMembershipIds
            ).toSet()
        return if (audienceQueries.activeMembershipIds(clubId, editedIds.toList()).size != editedIds.size) {
            TargetResolution.Rejected(ManualNotificationConfirmRejection.RECIPIENT_INVALID)
        } else {
            val snapshot = audienceQueries.previewTargets(clubId, selection)
            when {
                preview.targetSnapshotHash == null || preview.targetSnapshotHash != snapshot.snapshotHash() ->
                    TargetResolution.Rejected(ManualNotificationConfirmRejection.RECIPIENTS_CHANGED)
                snapshot.hasEligibleTarget(selection.requestedChannels) -> TargetResolution.Eligible(snapshot)
                else -> TargetResolution.Rejected(ManualNotificationConfirmRejection.AUDIENCE_EMPTY)
            }
        }
    }

    private fun confirmEligible(
        input: ManualNotificationConfirmTransactionInput,
        session: ManualNotificationSessionContext,
        targetSnapshot: ManualNotificationTargetSnapshot,
    ): ManualNotificationConfirmAttempt {
        val duplicate = findStoredDispatchByRevision(input.clubId, input.selection)
        return if (duplicate != null && !input.resendConfirmed) {
            ManualNotificationConfirmAttempt.Confirmed(
                duplicate.copy(status = ManualNotificationConfirmInsertStatus.DUPLICATE),
            )
        } else {
            createConfirmedDispatch(input, session, targetSnapshot)
        }
    }

    private fun createConfirmedDispatch(
        input: ManualNotificationConfirmTransactionInput,
        session: ManualNotificationSessionContext,
        targetSnapshot: ManualNotificationTargetSnapshot,
    ): ManualNotificationConfirmAttempt {
        val eventId = UUID.randomUUID()
        val dispatchId = UUID.randomUUID()
        val payload = eventPayload(input, session, targetSnapshot, dispatchId)
        writer.insertOutbox(
            eventId = eventId,
            clubId = input.clubId,
            selection = input.selection,
            payload = payload,
            dedupeKey =
                "manual:${input.selection.eventType}:${input.selection.sessionId}:preview:${input.previewId}",
        )
        writer.insertPreviewDispatch(dispatchId, eventId, input, targetSnapshot)
        previewStore.consume(input.previewId, input.clubId, input.hostMembershipId, eventId)
        return ManualNotificationConfirmAttempt.Confirmed(
            ManualNotificationConfirmedDispatch(
                manualDispatchId = dispatchId,
                eventId = eventId,
                createdAt = writer.createdAt(dispatchId),
                status = ManualNotificationConfirmInsertStatus.CREATED,
                summary = targetSnapshot.toConfirmSummary(input.selection.requestedChannels),
            ),
        )
    }

    private fun findStoredDispatchByEventId(
        clubId: UUID,
        eventId: UUID,
    ): ManualNotificationConfirmedDispatch? =
        jdbcTemplate
            .query(
                """
                select
                  id,
                  event_id,
                  created_at,
                  requested_channels,
                  target_count,
                  expected_in_app_count,
                  expected_email_count
                from notification_manual_dispatches
                where club_id = ?
                  and event_id = ?
                """.trimIndent(),
                { resultSet, _ ->
                    rows.confirmedDispatch(resultSet, ManualNotificationConfirmInsertStatus.ALREADY_CONSUMED)
                },
                clubId.dbString(),
                eventId.dbString(),
            ).firstOrNull()

    private fun findStoredDispatchByRevision(
        clubId: UUID,
        selection: ManualNotificationSelection,
    ): ManualNotificationConfirmedDispatch? =
        jdbcTemplate
            .query(
                """
                select
                  id,
                  event_id,
                  created_at,
                  requested_channels,
                  target_count,
                  expected_in_app_count,
                  expected_email_count
                from notification_manual_dispatches
                where club_id = ?
                  and session_id = ?
                  and event_type = ?
                  and content_revision = ?
                order by created_at desc, id desc
                limit 1
                """.trimIndent(),
                { resultSet, _ -> rows.confirmedDispatch(resultSet, ManualNotificationConfirmInsertStatus.DUPLICATE) },
                clubId.dbString(),
                selection.sessionId.dbString(),
                selection.eventType.name,
                selection.contentRevision,
            ).firstOrNull()

    private fun replayConsumed(
        clubId: UUID,
        eventId: UUID,
    ): ManualNotificationConfirmAttempt =
        findStoredDispatchByEventId(clubId, eventId)
            ?.copy(status = ManualNotificationConfirmInsertStatus.ALREADY_CONSUMED)
            ?.let(ManualNotificationConfirmAttempt::Confirmed)
            ?: rejected(ManualNotificationConfirmRejection.PREVIEW_NOT_FOUND)
}

private class ManualNotificationConfirmWriter(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
    private val eventsTopic: String,
    private val sessionGuard: SessionScopedNotificationGuard,
) {
    fun insertManualDispatch(
        clubId: UUID,
        hostMembershipId: UUID,
        selection: ManualNotificationSelection,
        payload: NotificationEventPayload,
        targetSnapshot: ManualNotificationTargetSnapshot,
        resend: Boolean,
    ): ManualNotificationStoredDispatch {
        sessionGuard.lockExisting(clubId, selection.sessionId)
        val eventId = UUID.randomUUID()
        val dispatchId = requireNotNull(payload.manualDispatch?.id) { "Manual dispatch payload id is required" }
        insertOutbox(
            eventId = eventId,
            clubId = clubId,
            selection = selection,
            payload = payload,
            dedupeKey = "manual:${selection.eventType}:${selection.sessionId}:$dispatchId",
        )
        insertLegacyDispatch(dispatchId, eventId, clubId, hostMembershipId, selection, targetSnapshot, resend)
        return ManualNotificationStoredDispatch(dispatchId, eventId, createdAt(dispatchId))
    }

    fun lockClubForAudienceMutation(clubId: UUID) {
        jdbcTemplate.queryForObject(
            "select id from clubs where id = ? for update",
            String::class.java,
            clubId.dbString(),
        )
    }

    fun insertOutbox(
        eventId: UUID,
        clubId: UUID,
        selection: ManualNotificationSelection,
        payload: NotificationEventPayload,
        dedupeKey: String,
    ) {
        sessionGuard.lockExisting(clubId, selection.sessionId)
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id, payload_json, kafka_topic, kafka_key, status, dedupe_key
            )
            values (?, ?, ?, 'SESSION', ?, ?, ?, ?, 'PENDING', ?)
            """.trimIndent(),
            eventId.dbString(),
            clubId.dbString(),
            selection.eventType.name,
            selection.sessionId.dbString(),
            objectMapper.writeValueAsString(payload),
            eventsTopic,
            clubId.dbString(),
            dedupeKey,
        )
    }

    fun insertPreviewDispatch(
        dispatchId: UUID,
        eventId: UUID,
        input: ManualNotificationConfirmTransactionInput,
        targetSnapshot: ManualNotificationTargetSnapshot,
    ) {
        jdbcTemplate.update(
            """
            insert into notification_manual_dispatches (
              id, club_id, event_id, preview_id, session_id, event_type, content_revision, requested_by_membership_id,
              requested_channels, audience, excluded_count, included_count, target_count,
              expected_in_app_count, expected_email_count, resend, send_mode
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            dispatchId.dbString(),
            input.clubId.dbString(),
            eventId.dbString(),
            input.previewId.dbString(),
            input.selection.sessionId.dbString(),
            input.selection.eventType.name,
            input.selection.contentRevision,
            input.hostMembershipId.dbString(),
            input.selection.requestedChannels.name,
            input.selection.audience.name,
            targetSnapshot.excludedCount,
            targetSnapshot.includedCount,
            targetSnapshot.finalTargetCount,
            targetSnapshot.inAppEligibleCount,
            targetSnapshot.emailEligibleCount,
            input.resendConfirmed,
            input.selection.sendMode.name,
        )
    }

    fun createdAt(dispatchId: UUID): OffsetDateTime =
        requireNotNull(
            jdbcTemplate.queryForObject(
                "select created_at from notification_manual_dispatches where id = ?",
                { resultSet, _ -> resultSet.utcOffsetDateTime("created_at") },
                dispatchId.dbString(),
            ),
        )

    private fun insertLegacyDispatch(
        dispatchId: UUID,
        eventId: UUID,
        clubId: UUID,
        hostMembershipId: UUID,
        selection: ManualNotificationSelection,
        targetSnapshot: ManualNotificationTargetSnapshot,
        resend: Boolean,
    ) {
        jdbcTemplate.update(
            """
            insert into notification_manual_dispatches (
              id, club_id, event_id, session_id, event_type, content_revision, requested_by_membership_id,
              requested_channels, audience, excluded_count, included_count, target_count,
              expected_in_app_count, expected_email_count, resend, send_mode
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            dispatchId.dbString(),
            clubId.dbString(),
            eventId.dbString(),
            selection.sessionId.dbString(),
            selection.eventType.name,
            selection.contentRevision,
            hostMembershipId.dbString(),
            selection.requestedChannels.name,
            selection.audience.name,
            targetSnapshot.excludedCount,
            targetSnapshot.includedCount,
            targetSnapshot.finalTargetCount,
            targetSnapshot.inAppEligibleCount,
            targetSnapshot.emailEligibleCount,
            resend,
            selection.sendMode.name,
        )
    }
}

private fun previewRejection(
    preview: LockedManualNotificationPreview,
    input: ManualNotificationConfirmTransactionInput,
): ManualNotificationConfirmRejection? =
    when {
        preview.selectionHash != input.selectionHash && preview.consumedEventId == null ->
            ManualNotificationConfirmRejection.PREVIEW_SELECTION_MISMATCH
        preview.selectionHash != input.selectionHash ->
            ManualNotificationConfirmRejection.PREVIEW_ALREADY_CONSUMED
        preview.consumedEventId == null && preview.expiresAt.isBefore(input.now) ->
            ManualNotificationConfirmRejection.PREVIEW_EXPIRED
        preview.consumedEventId == null && !hasValidSelectionShape(input.selection) ->
            ManualNotificationConfirmRejection.RECIPIENT_INVALID
        else -> null
    }

private fun sessionRejection(
    session: ManualNotificationSessionContext,
    selection: ManualNotificationSelection,
): ManualNotificationConfirmRejection? {
    val disabled = session.manualDispatchDisabledReason(selection.eventType) != null
    val currentRevision = session.contentRevision(selection.eventType)
    return when {
        disabled -> ManualNotificationConfirmRejection.SESSION_STATE_INVALID
        currentRevision == null -> ManualNotificationConfirmRejection.CONTENT_REVISION_STALE
        !sameRevision(selection.contentRevision, currentRevision) ->
            ManualNotificationConfirmRejection.CONTENT_REVISION_STALE
        else -> null
    }
}

private fun sameRevision(
    selectedRevision: String,
    currentRevision: String,
): Boolean =
    MessageDigest.isEqual(
        selectedRevision.toByteArray(),
        currentRevision.toByteArray(),
    )

private fun hasValidSelectionShape(selection: ManualNotificationSelection): Boolean {
    val selected = selection.selectedMembershipIds
    val included = selection.includedMembershipIds
    val excluded = selection.excludedMembershipIds
    val legacyEditsAreInvalid =
        included.size != included.toSet().size ||
            excluded.size != excluded.toSet().size ||
            included.toSet().intersect(excluded.toSet()).isNotEmpty()
    val audienceShapeIsValid =
        if (selection.audience == ManualNotificationAudience.SELECTED_MEMBERS) {
            selected.isNotEmpty() &&
                selected.size == selected.toSet().size &&
                included.isEmpty() &&
                excluded.isEmpty()
        } else {
            selected.isEmpty()
        }
    return selection.audience in allowedManualAudiences(selection.eventType) &&
        !legacyEditsAreInvalid &&
        audienceShapeIsValid
}

private fun ManualNotificationTargetSnapshot.hasEligibleTarget(requestedChannels: RequestedChannels): Boolean =
    finalTargetCount > 0 &&
        when (requestedChannels) {
            ManualNotificationRequestedChannels.IN_APP -> inAppEligibleCount > 0
            ManualNotificationRequestedChannels.EMAIL -> emailEligibleCount > 0
            ManualNotificationRequestedChannels.BOTH -> inAppEligibleCount > 0 || emailEligibleCount > 0
        }

private fun ManualNotificationTargetSnapshot.toConfirmSummary(requestedChannels: RequestedChannels) =
    ManualNotificationConfirmSummary(
        targetCount = finalTargetCount,
        requestedChannels = requestedChannels,
        expectedInAppCount = inAppEligibleCount,
        expectedEmailCount = emailEligibleCount,
    )

private fun eventPayload(
    input: ManualNotificationConfirmTransactionInput,
    session: ManualNotificationSessionContext,
    targetSnapshot: ManualNotificationTargetSnapshot,
    dispatchId: UUID,
) = NotificationEventPayload(
    sessionId = input.selection.sessionId,
    sessionNumber = session.sessionNumber,
    bookTitle = session.bookTitle,
    manualDispatch =
        NotificationManualDispatchPayload(
            id = dispatchId,
            source = NotificationDispatchSource.MANUAL,
            requestedByMembershipId = input.hostMembershipId,
            requestedChannels = input.selection.requestedChannels,
            audience = input.selection.audience,
            contentRevision = input.selection.contentRevision,
            selectedMembershipIds = input.selection.selectedMembershipIds,
            excludedMembershipIds = input.selection.excludedMembershipIds,
            includedMembershipIds = input.selection.includedMembershipIds,
            targetMembershipIds = targetSnapshot.targetMembershipIds,
            inAppMembershipIds = targetSnapshot.inAppMembershipIds,
            emailMembershipIds = targetSnapshot.emailMembershipIds,
            resend = input.resendConfirmed,
            sendMode = input.selection.sendMode,
        ),
)

private fun rejected(reason: ManualNotificationConfirmRejection): ManualNotificationConfirmAttempt =
    ManualNotificationConfirmAttempt.Rejected(reason)

private sealed interface TargetResolution {
    data class Eligible(
        val snapshot: ManualNotificationTargetSnapshot,
    ) : TargetResolution

    data class Rejected(
        val reason: ManualNotificationConfirmRejection,
    ) : TargetResolution
}

private typealias RequestedChannels = ManualNotificationRequestedChannels
