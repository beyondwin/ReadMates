package com.readmates.notification.application.port.out

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
)

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
