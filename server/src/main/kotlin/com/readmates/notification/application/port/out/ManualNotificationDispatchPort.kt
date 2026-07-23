package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.ManualNotificationContentRevision
import com.readmates.notification.application.model.ManualNotificationDispatchList
import com.readmates.notification.application.model.ManualNotificationMemberOption
import com.readmates.notification.application.model.ManualNotificationRecentDispatch
import com.readmates.notification.application.model.ManualNotificationSelection
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

data class ManualNotificationSessionContext(
    val sessionId: UUID,
    val clubId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: LocalDate?,
    val state: String,
    val visibility: String,
    val feedbackDocumentUploaded: Boolean,
    val feedbackDocumentVersion: Int? = null,
    val sessionRecordContentRevision: String? = null,
)

fun ManualNotificationSessionContext.contentRevision(eventType: NotificationEventType): String? =
    when (eventType) {
        NotificationEventType.NEXT_BOOK_PUBLISHED ->
            ManualNotificationContentRevision.nextBook(sessionId, sessionNumber, bookTitle, visibility)
        NotificationEventType.SESSION_REMINDER_DUE ->
            ManualNotificationContentRevision.reminder(sessionId, date)
        NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED ->
            sessionRecordContentRevision?.let(ManualNotificationContentRevision::sessionRecord)
                ?: feedbackDocumentVersion?.let { ManualNotificationContentRevision.feedbackDocument(sessionId, it) }
        NotificationEventType.SESSION_RECORD_UPDATED ->
            sessionRecordContentRevision?.let(ManualNotificationContentRevision::sessionRecord)
        NotificationEventType.REVIEW_PUBLISHED,
        NotificationEventType.AI_GENERATION_READY,
        -> null
    }

data class ManualNotificationTargetSnapshot(
    val baseCount: Int,
    val excludedCount: Int,
    val includedCount: Int,
    val finalTargetCount: Int,
    val inAppEligibleCount: Int,
    val emailEligibleCount: Int,
    val emailSkippedByPreferenceCount: Int,
    val emailMissingCount: Int,
    val targetMembershipIds: List<UUID> = emptyList(),
    val inAppMembershipIds: List<UUID> = emptyList(),
    val emailMembershipIds: List<UUID> = emptyList(),
)

data class ManualNotificationPreviewRecord(
    val id: UUID,
    val clubId: UUID,
    val hostMembershipId: UUID,
    val selectionHash: String,
    val expiresAt: OffsetDateTime,
)

data class ManualNotificationStoredDispatch(
    val manualDispatchId: UUID,
    val eventId: UUID,
    val createdAt: OffsetDateTime,
)

enum class ManualNotificationConfirmInsertStatus {
    CREATED,
    ALREADY_CONSUMED,
    DUPLICATE,
}

data class ManualNotificationConfirmedDispatch(
    val manualDispatchId: UUID,
    val eventId: UUID,
    val createdAt: OffsetDateTime,
    val status: ManualNotificationConfirmInsertStatus,
)

interface ManualNotificationDispatchPort {
    fun findSessionContext(
        clubId: UUID,
        sessionId: UUID,
    ): ManualNotificationSessionContext?

    fun listMembers(
        clubId: UUID,
        sessionId: UUID?,
        search: String?,
        pageRequest: PageRequest,
    ): CursorPage<ManualNotificationMemberOption>

    fun listDispatches(
        clubId: UUID,
        sessionId: UUID?,
        eventType: NotificationEventType?,
        pageRequest: PageRequest,
    ): ManualNotificationDispatchList

    fun validateMembershipEdits(
        clubId: UUID,
        membershipIds: Set<UUID>,
    ): Boolean

    fun previewTargets(
        clubId: UUID,
        selection: ManualNotificationSelection,
    ): ManualNotificationTargetSnapshot

    fun recentDispatches(
        clubId: UUID,
        sessionId: UUID,
        eventType: NotificationEventType,
        contentRevision: String,
    ): List<ManualNotificationRecentDispatch>

    fun insertPreview(
        clubId: UUID,
        hostMembershipId: UUID,
        selectionHash: String,
        expiresAt: OffsetDateTime,
    ): UUID

    fun findPreview(
        id: UUID,
        clubId: UUID,
        hostMembershipId: UUID,
    ): ManualNotificationPreviewRecord?

    fun findConsumedManualDispatch(
        previewId: UUID,
        clubId: UUID,
        hostMembershipId: UUID,
        selectionHash: String,
        now: OffsetDateTime,
    ): ManualNotificationConfirmedDispatch?

    fun confirmManualDispatch(
        previewId: UUID,
        clubId: UUID,
        hostMembershipId: UUID,
        selectionHash: String,
        now: OffsetDateTime,
        selection: ManualNotificationSelection,
        payload: NotificationEventPayload,
        targetSnapshot: ManualNotificationTargetSnapshot,
        resend: Boolean,
    ): ManualNotificationConfirmedDispatch?

    fun insertManualDispatch(
        clubId: UUID,
        hostMembershipId: UUID,
        selection: ManualNotificationSelection,
        payload: NotificationEventPayload,
        targetSnapshot: ManualNotificationTargetSnapshot,
        resend: Boolean,
    ): ManualNotificationStoredDispatch
}
