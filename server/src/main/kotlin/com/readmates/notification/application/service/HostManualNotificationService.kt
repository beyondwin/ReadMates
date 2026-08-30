package com.readmates.notification.application.service

import com.readmates.notification.application.NotificationApplicationError
import com.readmates.notification.application.NotificationApplicationException
import com.readmates.notification.application.model.ManualNotificationAudience
import com.readmates.notification.application.model.ManualNotificationAudiencePreview
import com.readmates.notification.application.model.ManualNotificationChannelPreview
import com.readmates.notification.application.model.ManualNotificationConfirmCommand
import com.readmates.notification.application.model.ManualNotificationConfirmResult
import com.readmates.notification.application.model.ManualNotificationDispatchList
import com.readmates.notification.application.model.ManualNotificationDuplicatePreview
import com.readmates.notification.application.model.ManualNotificationOptions
import com.readmates.notification.application.model.ManualNotificationPreview
import com.readmates.notification.application.model.ManualNotificationPreviewCommand
import com.readmates.notification.application.model.ManualNotificationRequestedChannels
import com.readmates.notification.application.model.ManualNotificationSelection
import com.readmates.notification.application.model.ManualNotificationSessionSummary
import com.readmates.notification.application.model.ManualNotificationTemplateOption
import com.readmates.notification.application.model.ManualNotificationTemplatePreview
import com.readmates.notification.application.model.ManualNotificationWarning
import com.readmates.notification.application.model.allowedManualAudiences
import com.readmates.notification.application.model.defaultManualAudience
import com.readmates.notification.application.model.defaultManualBody
import com.readmates.notification.application.model.defaultManualSubject
import com.readmates.notification.application.port.`in`.ManageManualHostNotificationsUseCase
import com.readmates.notification.application.port.out.ManualNotificationConfirmAttempt
import com.readmates.notification.application.port.out.ManualNotificationConfirmInsertStatus
import com.readmates.notification.application.port.out.ManualNotificationConfirmRejection
import com.readmates.notification.application.port.out.ManualNotificationConfirmTransactionInput
import com.readmates.notification.application.port.out.ManualNotificationConfirmedDispatch
import com.readmates.notification.application.port.out.ManualNotificationDispatchPort
import com.readmates.notification.application.port.out.ManualNotificationSessionContext
import com.readmates.notification.application.port.out.ManualNotificationTargetSnapshot
import com.readmates.notification.application.port.out.contentRevision
import com.readmates.notification.application.port.out.manualDispatchDisabledReason
import com.readmates.notification.application.port.out.snapshotHash
import com.readmates.notification.application.port.out.targetSnapshotRevision
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.Sha256
import org.springframework.stereotype.Service
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@Service
class HostManualNotificationService(
    private val manualDispatchPort: ManualNotificationDispatchPort,
    private val clock: () -> OffsetDateTime = { OffsetDateTime.now(ZoneOffset.UTC) },
) : ManageManualHostNotificationsUseCase {
    override fun options(
        host: CurrentMember,
        sessionId: UUID?,
        search: String?,
        pageRequest: PageRequest,
    ): ManualNotificationOptions {
        val currentHost = requireHost(host)
        val session =
            sessionId?.let {
                manualDispatchPort.findSessionContext(currentHost.clubId, it) ?: throw notFound()
            }
        val templates =
            manualTemplates.map { eventType ->
                val disabledReason = session?.manualDispatchDisabledReason(eventType)
                ManualNotificationTemplateOption(
                    eventType = eventType,
                    label = manualTemplateLabel(eventType),
                    contentRevision =
                        session
                            ?.takeIf { disabledReason == null }
                            ?.contentRevision(eventType)
                            .orEmpty(),
                    enabled = disabledReason == null,
                    disabledReason = disabledReason,
                    defaultAudience = defaultManualAudience(eventType),
                    allowedAudiences = allowedManualAudiences(eventType),
                    defaultSubject = defaultManualSubject(eventType),
                    defaultBody = defaultManualBody(eventType),
                )
            }
        val members = manualDispatchPort.listMembers(currentHost.clubId, sessionId, search, pageRequest)
        val recentDispatches =
            manualDispatchPort.listDispatches(
                clubId = currentHost.clubId,
                sessionId = sessionId,
                eventType = null,
                pageRequest = PageRequest.cursor(5, null, defaultLimit = 5, maxLimit = 5),
            )
        return ManualNotificationOptions(
            session = session?.toSummary(),
            templates = templates,
            members = members.items,
            nextCursor = members.nextCursor,
            recentDispatches = recentDispatches.items,
        )
    }

    override fun listDispatches(
        host: CurrentMember,
        sessionId: UUID?,
        eventType: NotificationEventType?,
        pageRequest: PageRequest,
    ): ManualNotificationDispatchList {
        val currentHost = requireHost(host)
        return manualDispatchPort.listDispatches(currentHost.clubId, sessionId, eventType, pageRequest)
    }

    override fun preview(
        host: CurrentMember,
        command: ManualNotificationPreviewCommand,
    ): ManualNotificationPreview {
        val currentHost = requireHost(host)
        val selection = normalizeCopy(command.selection)
        val session = validateSelection(currentHost, selection)
        val targetSnapshot = manualDispatchPort.previewTargets(currentHost.clubId, selection)
        requireEligibleTarget(targetSnapshot, selection.requestedChannels)
        val recent =
            manualDispatchPort.recentDispatches(
                currentHost.clubId,
                selection.sessionId,
                selection.eventType,
                selection.contentRevision,
            )
        val expiresAt = clock().plusMinutes(PREVIEW_TTL_MINUTES)
        val targetSnapshotHash = targetSnapshot.snapshotHash()
        val contentHash = contentHash(selection.subject, selection.body)
        val targetSnapshotRevision = targetSnapshot.targetSnapshotRevision()
        val eligibilityFingerprint =
            Sha256.hex(
                listOf(
                    targetSnapshot.inAppMembershipIds.sorted(),
                    targetSnapshot.emailMembershipIds.sorted(),
                    targetSnapshot.audienceRevision,
                ).joinToString("|"),
            )
        val previewId =
            manualDispatchPort.insertPreview(
                clubId = currentHost.clubId,
                hostMembershipId = currentHost.membershipId,
                selectionHash = selectionHash(selection),
                targetSnapshotHash = targetSnapshotHash,
                scheduleRevision = session.scheduleRevision,
                targetSnapshotRevision = targetSnapshotRevision,
                targetMembershipIds = targetSnapshot.targetMembershipIds,
                eligibilityFingerprint = eligibilityFingerprint,
                subject = selection.subject,
                body = selection.body,
                contentHash = contentHash,
                expiresAt = expiresAt,
            )
        return ManualNotificationPreview(
            previewId = previewId,
            expiresAt = expiresAt,
            template = templatePreview(selection),
            audience =
                ManualNotificationAudiencePreview(
                    baseGroup = selection.audience,
                    baseCount = targetSnapshot.baseCount,
                    excludedCount = targetSnapshot.excludedCount,
                    includedCount = targetSnapshot.includedCount,
                    finalTargetCount = targetSnapshot.finalTargetCount,
                ),
            channels =
                ManualNotificationChannelPreview(
                    requested = selection.requestedChannels,
                    inAppEligibleCount = targetSnapshot.inAppEligibleCount,
                    emailEligibleCount = targetSnapshot.emailEligibleCount,
                    emailSkippedByPreferenceCount = targetSnapshot.emailSkippedByPreferenceCount,
                    emailMissingCount = targetSnapshot.emailMissingCount,
                ),
            duplicates =
                ManualNotificationDuplicatePreview(
                    requiresResendConfirmation = recent.isNotEmpty(),
                    recentDispatches = recent,
                ),
            warnings = warningsFor(targetSnapshot),
            scheduleRevision = session.scheduleRevision,
            targetSnapshotHash = targetSnapshotHash,
            contentHash = contentHash,
        )
    }

    override fun confirm(
        host: CurrentMember,
        command: ManualNotificationConfirmCommand,
    ): ManualNotificationConfirmResult {
        val currentHost = requireHost(host)
        val selection = normalizeCopy(command.selection)
        val attempt =
            manualDispatchPort.confirmManualDispatch(
                ManualNotificationConfirmTransactionInput(
                    previewId = command.previewId,
                    clubId = currentHost.clubId,
                    hostMembershipId = currentHost.membershipId,
                    selectionHash = selectionHash(selection),
                    now = clock(),
                    selection = selection,
                    resendConfirmed = command.resendConfirmed,
                ),
            )
        val stored =
            when (attempt) {
                is ManualNotificationConfirmAttempt.Confirmed -> attempt.dispatch
                is ManualNotificationConfirmAttempt.Rejected -> throw confirmRejected(attempt.reason)
            }
        if (stored.status == ManualNotificationConfirmInsertStatus.DUPLICATE) {
            throw NotificationApplicationException(
                NotificationApplicationError.DUPLICATE_NOTIFICATION_DISPATCH,
                "Manual notification dispatch already exists for session/template",
            )
        }
        return confirmResult(stored)
    }

    private fun confirmResult(stored: ManualNotificationConfirmedDispatch): ManualNotificationConfirmResult =
        ManualNotificationConfirmResult(
            manualDispatchId = stored.manualDispatchId,
            eventId = stored.eventId,
            status = NotificationEventOutboxStatus.PENDING,
            createdAt = stored.createdAt,
            summary = stored.summary,
        )

    private fun validateSelection(
        host: CurrentMember,
        selection: ManualNotificationSelection,
    ): ManualNotificationSessionContext {
        if (
            selection.eventType !in manualTemplates ||
            selection.audience !in allowedManualAudiences(selection.eventType)
        ) {
            throw NotificationApplicationException(
                NotificationApplicationError.MANUAL_NOTIFICATION_TEMPLATE_UNAVAILABLE,
                "Manual notification template is unavailable",
            )
        }
        val session = manualDispatchPort.findSessionContext(host.clubId, selection.sessionId) ?: throw notFound()
        session.manualDispatchDisabledReason(selection.eventType)?.let {
            throw NotificationApplicationException(NotificationApplicationError.MANUAL_NOTIFICATION_STATE_INVALID, it)
        }
        val currentRevision = session.contentRevision(selection.eventType)
        if (currentRevision == null || selection.contentRevision != currentRevision) {
            throw NotificationApplicationException(
                NotificationApplicationError.MANUAL_NOTIFICATION_CONTENT_STALE,
                "Manual notification content revision is stale",
            )
        }
        if (selection.scheduleRevision != 0L && selection.scheduleRevision != session.scheduleRevision) {
            throw NotificationApplicationException(
                NotificationApplicationError.MANUAL_NOTIFICATION_PREVIEW_STALE,
                "Manual notification schedule revision is stale",
            )
        }
        val editedIds = validateSelectionShape(selection)
        if (!manualDispatchPort.validateMembershipEdits(host.clubId, editedIds)) {
            throw recipientInvalid()
        }
        return session
    }

    private fun validateSelectionShape(selection: ManualNotificationSelection): Set<UUID> {
        val selected = selection.selectedMembershipIds
        val included = selection.includedMembershipIds
        val excluded = selection.excludedMembershipIds
        val legacyEdits = included + excluded
        val legacyEditsAreInvalid =
            included.size != included.toSet().size ||
                excluded.size != excluded.toSet().size ||
                included.toSet().intersect(excluded.toSet()).isNotEmpty()
        val audienceShapeIsInvalid =
            if (selection.audience == ManualNotificationAudience.SELECTED_MEMBERS) {
                selected.isEmpty() ||
                    selected.size != selected.toSet().size ||
                    legacyEdits.isNotEmpty()
            } else {
                selected.isNotEmpty()
            }
        if (legacyEditsAreInvalid || audienceShapeIsInvalid) {
            throw selectionInvalid()
        }
        return (selected + legacyEdits).toSet()
    }

    private fun ManualNotificationSessionContext.toSummary(): ManualNotificationSessionSummary =
        ManualNotificationSessionSummary(
            sessionId = sessionId,
            sessionNumber = sessionNumber,
            bookTitle = bookTitle,
            date = date,
            state = state,
            visibility = visibility,
            feedbackDocumentUploaded = feedbackDocumentUploaded,
            scheduleRevision = scheduleRevision,
        )

    private fun templatePreview(selection: ManualNotificationSelection): ManualNotificationTemplatePreview =
        ManualNotificationTemplatePreview(
            eventType = selection.eventType,
            label = manualTemplateLabel(selection.eventType),
            subject = selection.subject,
            bodyPreview = selection.body,
        )

    private fun warningsFor(snapshot: ManualNotificationTargetSnapshot): List<ManualNotificationWarning> =
        buildList {
            if (snapshot.emailSkippedByPreferenceCount > 0) {
                add(
                    ManualNotificationWarning(
                        "EMAIL_PREFERENCE_SKIPS",
                        "이메일 알림 설정 때문에 ${snapshot.emailSkippedByPreferenceCount}명에게는 이메일이 가지 않습니다.",
                    ),
                )
            }
            if (snapshot.emailMissingCount > 0) {
                add(
                    ManualNotificationWarning(
                        "EMAIL_MISSING",
                        "이메일 주소가 없어 ${snapshot.emailMissingCount}명에게는 이메일이 가지 않습니다.",
                    ),
                )
            }
        }

    private fun manualTemplateLabel(eventType: NotificationEventType): String =
        when (eventType) {
            NotificationEventType.NEXT_BOOK_PUBLISHED -> "다음 책 확정"
            NotificationEventType.SESSION_REMINDER_DUE -> "모임 전날 리마인더"
            NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED -> "피드백 문서 등록"
            NotificationEventType.REVIEW_PUBLISHED -> "새 서평"
            NotificationEventType.SESSION_RECORD_UPDATED -> "모임 기록 수정"
            NotificationEventType.AI_GENERATION_READY -> "AI 모임 초안 완료"
        }

    private fun selectionHash(selection: ManualNotificationSelection): String {
        val raw =
            listOf(
                selection.sessionId,
                selection.eventType,
                selection.contentRevision,
                selection.audience,
                selection.requestedChannels,
                selection.selectedMembershipIds.sorted(),
                selection.excludedMembershipIds.sorted(),
                selection.includedMembershipIds.sorted(),
                selection.sendMode,
                selection.scheduleRevision,
                selection.subject,
                selection.body,
            ).joinToString("|")
        return Sha256.hex(raw)
    }

    private fun requireHost(host: CurrentMember): CurrentMember {
        if (!host.isHost) {
            throw AccessDeniedException("Host role required")
        }
        return host
    }

    private fun requireEligibleTarget(
        snapshot: ManualNotificationTargetSnapshot,
        requestedChannels: ManualNotificationRequestedChannels,
    ) {
        val hasEligibleChannelTarget =
            when (requestedChannels) {
                ManualNotificationRequestedChannels.IN_APP -> snapshot.inAppEligibleCount > 0
                ManualNotificationRequestedChannels.EMAIL -> snapshot.emailEligibleCount > 0
                ManualNotificationRequestedChannels.BOTH ->
                    snapshot.inAppEligibleCount > 0 || snapshot.emailEligibleCount > 0
            }
        if (snapshot.finalTargetCount <= 0 || !hasEligibleChannelTarget) {
            throw NotificationApplicationException(
                NotificationApplicationError.MANUAL_NOTIFICATION_AUDIENCE_EMPTY,
                "Manual notification requested channels have no eligible target",
            )
        }
    }

    private fun selectionInvalid(): NotificationApplicationException =
        NotificationApplicationException(
            NotificationApplicationError.MANUAL_NOTIFICATION_SELECTION_INVALID,
            "Manual notification selection is invalid",
        )

    private fun recipientInvalid(): NotificationApplicationException =
        NotificationApplicationException(
            NotificationApplicationError.MANUAL_NOTIFICATION_RECIPIENT_INVALID,
            "Manual notification recipient selection is invalid",
        )

    private fun notFound(): NotificationApplicationException =
        NotificationApplicationException(
            NotificationApplicationError.NOTIFICATION_NOT_FOUND,
            "Manual notification context not found",
        )

    private fun confirmRejected(reason: ManualNotificationConfirmRejection): RuntimeException =
        when (reason) {
            ManualNotificationConfirmRejection.PREVIEW_NOT_FOUND ->
                NotificationApplicationException(
                    NotificationApplicationError.MANUAL_NOTIFICATION_PREVIEW_NOT_FOUND,
                    "Manual notification preview not found",
                )
            ManualNotificationConfirmRejection.PREVIEW_EXPIRED ->
                NotificationApplicationException(
                    NotificationApplicationError.MANUAL_NOTIFICATION_PREVIEW_EXPIRED,
                    "Manual notification preview expired",
                )
            ManualNotificationConfirmRejection.PREVIEW_SELECTION_MISMATCH ->
                NotificationApplicationException(
                    NotificationApplicationError.MANUAL_NOTIFICATION_SELECTION_INVALID,
                    "Manual notification preview selection is invalid",
                )
            ManualNotificationConfirmRejection.PREVIEW_ALREADY_CONSUMED ->
                NotificationApplicationException(
                    NotificationApplicationError.MANUAL_NOTIFICATION_PREVIEW_REUSED,
                    "Manual notification preview was already used with another selection",
                )
            ManualNotificationConfirmRejection.HOST_NOT_AUTHORIZED -> AccessDeniedException("Host role required")
            ManualNotificationConfirmRejection.SESSION_STATE_INVALID ->
                NotificationApplicationException(
                    NotificationApplicationError.MANUAL_NOTIFICATION_STATE_INVALID,
                    "Manual notification is unavailable for the current session state",
                )
            ManualNotificationConfirmRejection.CONTENT_REVISION_STALE ->
                NotificationApplicationException(
                    NotificationApplicationError.MANUAL_NOTIFICATION_CONTENT_STALE,
                    "Manual notification content revision is stale",
                )
            ManualNotificationConfirmRejection.RECIPIENT_INVALID ->
                NotificationApplicationException(
                    NotificationApplicationError.MANUAL_NOTIFICATION_RECIPIENT_INVALID,
                    "Manual notification recipient selection is invalid",
                )
            ManualNotificationConfirmRejection.RECIPIENTS_CHANGED ->
                NotificationApplicationException(
                    NotificationApplicationError.MANUAL_NOTIFICATION_RECIPIENTS_CHANGED,
                    "Manual notification recipients changed after preview",
                )
            ManualNotificationConfirmRejection.PREVIEW_STALE ->
                NotificationApplicationException(
                    NotificationApplicationError.MANUAL_NOTIFICATION_PREVIEW_STALE,
                    "Manual notification preview is stale",
                )
            ManualNotificationConfirmRejection.AUDIENCE_EMPTY ->
                NotificationApplicationException(
                    NotificationApplicationError.MANUAL_NOTIFICATION_AUDIENCE_EMPTY,
                    "Manual notification requested channels have no eligible target",
                )
        }

    private fun normalizeCopy(selection: ManualNotificationSelection): ManualNotificationSelection {
        val subject = selection.subject.replace("\r\n", "\n").replace('\r', '\n').trim()
        val body = selection.body.replace("\r\n", "\n").replace('\r', '\n').trim()
        if (subject.isEmpty() || body.isEmpty() || subject.length > MAX_SUBJECT_LENGTH || body.length > MAX_BODY_LENGTH) {
            throw NotificationApplicationException(
                NotificationApplicationError.MANUAL_NOTIFICATION_COPY_INVALID,
                "Manual notification copy is invalid",
            )
        }
        return selection.copy(subject = subject, body = body)
    }

    private fun contentHash(subject: String, body: String): String =
        Sha256.hex("${subject.length}:$subject|${body.length}:$body")

    private companion object {
        private const val PREVIEW_TTL_MINUTES = 10L
        private const val MAX_SUBJECT_LENGTH = 200
        private const val MAX_BODY_LENGTH = 4_000
        private val manualTemplates =
            listOf(
                NotificationEventType.NEXT_BOOK_PUBLISHED,
                NotificationEventType.SESSION_REMINDER_DUE,
                NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
                NotificationEventType.SESSION_RECORD_UPDATED,
            )
    }
}
