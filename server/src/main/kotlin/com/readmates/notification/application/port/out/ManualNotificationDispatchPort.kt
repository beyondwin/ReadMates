package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.ManualNotificationConfirmSummary
import com.readmates.notification.application.model.ManualNotificationContentRevision
import com.readmates.notification.application.model.ManualNotificationDispatchList
import com.readmates.notification.application.model.ManualNotificationMemberOption
import com.readmates.notification.application.model.ManualNotificationRecentDispatch
import com.readmates.notification.application.model.ManualNotificationSelection
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.Sha256
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
    val participantSetRevision: Long = 0,
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
    val audienceRevision: String = "",
)

data class ManualNotificationPreviewRecord(
    val id: UUID,
    val clubId: UUID,
    val hostMembershipId: UUID,
    val selectionHash: String,
    val targetSnapshotHash: String?,
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
    val summary: ManualNotificationConfirmSummary,
)

data class ManualNotificationConfirmTransactionInput(
    val previewId: UUID,
    val clubId: UUID,
    val hostMembershipId: UUID,
    val selectionHash: String,
    val now: OffsetDateTime,
    val selection: ManualNotificationSelection,
    val resendConfirmed: Boolean,
)

enum class ManualNotificationConfirmRejection {
    PREVIEW_NOT_FOUND,
    PREVIEW_EXPIRED,
    PREVIEW_SELECTION_MISMATCH,
    PREVIEW_ALREADY_CONSUMED,
    HOST_NOT_AUTHORIZED,
    SESSION_STATE_INVALID,
    CONTENT_REVISION_STALE,
    RECIPIENT_INVALID,
    RECIPIENTS_CHANGED,
    AUDIENCE_EMPTY,
}

sealed interface ManualNotificationConfirmAttempt {
    data class Confirmed(
        val dispatch: ManualNotificationConfirmedDispatch,
    ) : ManualNotificationConfirmAttempt

    data class Rejected(
        val reason: ManualNotificationConfirmRejection,
    ) : ManualNotificationConfirmAttempt
}

fun ManualNotificationTargetSnapshot.snapshotHash(): String =
    Sha256.hex(
        buildList {
            add(baseCount)
            add(excludedCount)
            add(includedCount)
            add(finalTargetCount)
            add(inAppEligibleCount)
            add(emailEligibleCount)
            add(emailSkippedByPreferenceCount)
            add(emailMissingCount)
            add(targetMembershipIds.sorted())
            add(inAppMembershipIds.sorted())
            add(emailMembershipIds.sorted())
            if (audienceRevision.isNotEmpty()) add(audienceRevision)
        }.joinToString("|"),
    )

fun ManualNotificationSessionContext.manualDispatchDisabledReason(eventType: NotificationEventType): String? =
    when (eventType) {
        NotificationEventType.NEXT_BOOK_PUBLISHED ->
            if (state != "DRAFT" || visibility !in setOf("MEMBER", "PUBLIC")) {
                "멤버에게 보이는 예정 모임만 다음 책 알림을 보낼 수 있습니다."
            } else {
                null
            }
        NotificationEventType.SESSION_REMINDER_DUE ->
            if (state !in setOf("DRAFT", "OPEN")) {
                "작성 중이거나 멤버와 준비 중인 모임만 리마인더를 보낼 수 있습니다."
            } else {
                null
            }
        NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED ->
            if (state !in setOf("OPEN", "CLOSED", "PUBLISHED") || !feedbackDocumentUploaded) {
                "현재 피드백 문서가 있는 멤버와 준비 중 또는 지난 모임에서 발송할 수 있습니다."
            } else {
                null
            }
        NotificationEventType.REVIEW_PUBLISHED -> "서평 공개 알림은 수동 발송하지 않습니다."
        NotificationEventType.SESSION_RECORD_UPDATED ->
            if (sessionRecordContentRevision == null) {
                "반영된 모임 기록이 있어야 수정 알림을 보낼 수 있습니다."
            } else {
                null
            }
        NotificationEventType.AI_GENERATION_READY -> "AI 모임 초안 완료 알림은 수동 발송하지 않습니다."
    }

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
        targetSnapshotHash: String,
        expiresAt: OffsetDateTime,
    ): UUID

    fun findPreview(
        id: UUID,
        clubId: UUID,
        hostMembershipId: UUID,
    ): ManualNotificationPreviewRecord?

    fun confirmManualDispatch(input: ManualNotificationConfirmTransactionInput): ManualNotificationConfirmAttempt

    fun insertManualDispatch(
        clubId: UUID,
        hostMembershipId: UUID,
        selection: ManualNotificationSelection,
        payload: NotificationEventPayload,
        targetSnapshot: ManualNotificationTargetSnapshot,
        resend: Boolean,
    ): ManualNotificationStoredDispatch
}
