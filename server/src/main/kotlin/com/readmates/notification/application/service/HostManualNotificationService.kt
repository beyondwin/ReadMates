package com.readmates.notification.application.service

import com.readmates.notification.application.NotificationApplicationError
import com.readmates.notification.application.NotificationApplicationException
import com.readmates.notification.application.model.ManualNotificationAudiencePreview
import com.readmates.notification.application.model.ManualNotificationChannelPreview
import com.readmates.notification.application.model.ManualNotificationConfirmCommand
import com.readmates.notification.application.model.ManualNotificationConfirmResult
import com.readmates.notification.application.model.ManualNotificationConfirmSummary
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
import com.readmates.notification.application.model.NotificationDispatchSource
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.model.NotificationManualDispatchPayload
import com.readmates.notification.application.model.allowedManualAudiences
import com.readmates.notification.application.model.defaultManualAudience
import com.readmates.notification.application.port.`in`.ManageManualHostNotificationsUseCase
import com.readmates.notification.application.port.out.ManualNotificationConfirmedDispatch
import com.readmates.notification.application.port.out.ManualNotificationDispatchPort
import com.readmates.notification.application.port.out.ManualNotificationSessionContext
import com.readmates.notification.application.port.out.ManualNotificationTargetSnapshot
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
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
                val disabledReason = session?.let { disabledReason(eventType, it) }
                ManualNotificationTemplateOption(
                    eventType = eventType,
                    label = manualTemplateLabel(eventType),
                    enabled = disabledReason == null,
                    disabledReason = disabledReason,
                    defaultAudience = defaultManualAudience(eventType),
                    allowedAudiences = allowedManualAudiences(eventType),
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
        validateSelection(currentHost, command.selection)
        val targetSnapshot = manualDispatchPort.previewTargets(currentHost.clubId, command.selection)
        requireNonEmptyAudience(targetSnapshot)
        val recent =
            manualDispatchPort.recentDispatches(
                currentHost.clubId,
                command.selection.sessionId,
                command.selection.eventType,
            )
        val expiresAt = clock().plusMinutes(PREVIEW_TTL_MINUTES)
        val previewId =
            manualDispatchPort.insertPreview(
                clubId = currentHost.clubId,
                hostMembershipId = currentHost.membershipId,
                selectionHash = selectionHash(command.selection),
                expiresAt = expiresAt,
            )
        return ManualNotificationPreview(
            previewId = previewId,
            expiresAt = expiresAt,
            template = templatePreview(command.selection.eventType),
            audience =
                ManualNotificationAudiencePreview(
                    baseGroup = command.selection.audience,
                    baseCount = targetSnapshot.baseCount,
                    excludedCount = targetSnapshot.excludedCount,
                    includedCount = targetSnapshot.includedCount,
                    finalTargetCount = targetSnapshot.finalTargetCount,
                ),
            channels =
                ManualNotificationChannelPreview(
                    requested = command.selection.requestedChannels,
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
        )
    }

    override fun confirm(
        host: CurrentMember,
        command: ManualNotificationConfirmCommand,
    ): ManualNotificationConfirmResult {
        val currentHost = requireHost(host)
        validateSelection(currentHost, command.selection)
        val targetSnapshot = manualDispatchPort.previewTargets(currentHost.clubId, command.selection)
        requireNonEmptyAudience(targetSnapshot)
        manualDispatchPort
            .findConsumedManualDispatch(
                previewId = command.previewId,
                clubId = currentHost.clubId,
                hostMembershipId = currentHost.membershipId,
                selectionHash = selectionHash(command.selection),
                now = clock(),
            )?.let { stored ->
                return confirmResult(stored, targetSnapshot, command.selection.requestedChannels)
            }
        val recent =
            manualDispatchPort.recentDispatches(
                currentHost.clubId,
                command.selection.sessionId,
                command.selection.eventType,
            )
        if (recent.isNotEmpty() && !command.resendConfirmed) {
            throw NotificationApplicationException(
                NotificationApplicationError.DUPLICATE_NOTIFICATION_DISPATCH,
                "Manual notification dispatch already exists for session/template",
            )
        }
        val session = manualDispatchPort.findSessionContext(currentHost.clubId, command.selection.sessionId) ?: throw notFound()
        val dispatchId = UUID.randomUUID()
        val payload =
            NotificationEventPayload(
                sessionId = command.selection.sessionId,
                sessionNumber = session.sessionNumber,
                bookTitle = session.bookTitle,
                manualDispatch =
                    NotificationManualDispatchPayload(
                        id = dispatchId,
                        source = NotificationDispatchSource.MANUAL,
                        requestedByMembershipId = currentHost.membershipId,
                        requestedChannels = command.selection.requestedChannels,
                        audience = command.selection.audience,
                        excludedMembershipIds = command.selection.excludedMembershipIds,
                        includedMembershipIds = command.selection.includedMembershipIds,
                        targetMembershipIds = targetSnapshot.targetMembershipIds,
                        inAppMembershipIds = targetSnapshot.inAppMembershipIds,
                        emailMembershipIds = targetSnapshot.emailMembershipIds,
                        resend = recent.isNotEmpty(),
                        sendMode = command.selection.sendMode,
                    ),
            )
        val stored =
            manualDispatchPort.confirmManualDispatch(
                previewId = command.previewId,
                clubId = currentHost.clubId,
                hostMembershipId = currentHost.membershipId,
                selectionHash = selectionHash(command.selection),
                now = clock(),
                selection = command.selection,
                payload = payload,
                targetSnapshot = targetSnapshot,
                resend = recent.isNotEmpty(),
            ) ?: throw previewExpired()
        return confirmResult(stored, targetSnapshot, command.selection.requestedChannels)
    }

    private fun confirmResult(
        stored: ManualNotificationConfirmedDispatch,
        targetSnapshot: ManualNotificationTargetSnapshot,
        requestedChannels: ManualNotificationRequestedChannels,
    ): ManualNotificationConfirmResult =
        ManualNotificationConfirmResult(
            manualDispatchId = stored.manualDispatchId,
            eventId = stored.eventId,
            status = NotificationEventOutboxStatus.PENDING,
            createdAt = stored.createdAt,
            summary =
                ManualNotificationConfirmSummary(
                    targetCount = targetSnapshot.finalTargetCount,
                    requestedChannels = requestedChannels,
                    expectedInAppCount = targetSnapshot.inAppEligibleCount,
                    expectedEmailCount = targetSnapshot.emailEligibleCount,
                ),
        )

    private fun validateSelection(
        host: CurrentMember,
        selection: ManualNotificationSelection,
    ) {
        if (selection.eventType !in manualTemplates || selection.audience !in allowedManualAudiences(selection.eventType)) {
            throw NotificationApplicationException(
                NotificationApplicationError.MANUAL_NOTIFICATION_TEMPLATE_UNAVAILABLE,
                "Manual notification template is unavailable",
            )
        }
        val session = manualDispatchPort.findSessionContext(host.clubId, selection.sessionId) ?: throw notFound()
        disabledReason(selection.eventType, session)?.let {
            throw NotificationApplicationException(NotificationApplicationError.MANUAL_NOTIFICATION_TEMPLATE_UNAVAILABLE, it)
        }
        val editedIds = (selection.includedMembershipIds + selection.excludedMembershipIds).toSet()
        if (!manualDispatchPort.validateMembershipEdits(host.clubId, editedIds)) {
            throw NotificationApplicationException(
                NotificationApplicationError.MEMBERSHIP_NOT_ALLOWED,
                "Manual notification membership selection is not allowed",
            )
        }
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
        )

    private fun disabledReason(
        eventType: NotificationEventType,
        session: ManualNotificationSessionContext,
    ): String? =
        when (eventType) {
            NotificationEventType.NEXT_BOOK_PUBLISHED ->
                if (session.state != "DRAFT" || session.visibility !in setOf("MEMBER", "PUBLIC")) {
                    "멤버에게 공개된 예정 세션만 다음 책 알림을 보낼 수 있습니다."
                } else {
                    null
                }
            NotificationEventType.SESSION_REMINDER_DUE ->
                if (session.state !in setOf("DRAFT", "OPEN")) {
                    "예정 또는 열린 세션만 리마인더를 보낼 수 있습니다."
                } else {
                    null
                }
            NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED ->
                if (session.state !in setOf("CLOSED", "PUBLISHED") || !session.feedbackDocumentUploaded) {
                    "닫힌 세션의 피드백 문서가 등록된 뒤 발송할 수 있습니다."
                } else {
                    null
                }
            NotificationEventType.REVIEW_PUBLISHED -> "서평 공개 알림은 수동 발송하지 않습니다."
            NotificationEventType.AI_GENERATION_READY -> "AI 회차 초안 완료 알림은 수동 발송하지 않습니다."
        }

    private fun templatePreview(eventType: NotificationEventType): ManualNotificationTemplatePreview =
        ManualNotificationTemplatePreview(
            eventType = eventType,
            label = manualTemplateLabel(eventType),
            subject = manualTemplateLabel(eventType),
            bodyPreview =
                when (eventType) {
                    NotificationEventType.NEXT_BOOK_PUBLISHED -> "다음 모임에서 함께 읽을 책을 확인해 주세요."
                    NotificationEventType.SESSION_REMINDER_DUE -> "모임 전 질문과 읽은 분량, 참석 상태를 확인해 주세요."
                    NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED -> "참석한 회차의 피드백 문서를 확인해 주세요."
                    NotificationEventType.REVIEW_PUBLISHED -> "새 서평을 확인해 주세요."
                    NotificationEventType.AI_GENERATION_READY -> "AI 회차 초안 결과를 확인해 주세요."
                },
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
            NotificationEventType.NEXT_BOOK_PUBLISHED -> "다음 책 공개"
            NotificationEventType.SESSION_REMINDER_DUE -> "모임 전날 리마인더"
            NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED -> "피드백 문서 등록"
            NotificationEventType.REVIEW_PUBLISHED -> "서평 공개"
            NotificationEventType.AI_GENERATION_READY -> "AI 회차 초안 완료"
        }

    private fun selectionHash(selection: ManualNotificationSelection): String {
        val raw =
            listOf(
                selection.sessionId,
                selection.eventType,
                selection.audience,
                selection.requestedChannels,
                selection.excludedMembershipIds.sorted(),
                selection.includedMembershipIds.sorted(),
                selection.sendMode,
            ).joinToString("|")
        return MessageDigest
            .getInstance("SHA-256")
            .digest(raw.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }

    private fun requireHost(host: CurrentMember): CurrentMember {
        if (!host.isHost) {
            throw AccessDeniedException("Host role required")
        }
        return host
    }

    private fun requireNonEmptyAudience(snapshot: ManualNotificationTargetSnapshot) {
        if (snapshot.finalTargetCount <= 0) {
            throw NotificationApplicationException(
                NotificationApplicationError.MANUAL_NOTIFICATION_AUDIENCE_EMPTY,
                "Manual notification target audience is empty",
            )
        }
    }

    private fun notFound(): NotificationApplicationException =
        NotificationApplicationException(
            NotificationApplicationError.NOTIFICATION_NOT_FOUND,
            "Manual notification context not found",
        )

    private fun previewExpired(): NotificationApplicationException =
        NotificationApplicationException(
            NotificationApplicationError.MANUAL_NOTIFICATION_PREVIEW_EXPIRED,
            "Manual notification preview expired",
        )

    private companion object {
        private const val PREVIEW_TTL_MINUTES = 10L
        private val manualTemplates =
            listOf(
                NotificationEventType.NEXT_BOOK_PUBLISHED,
                NotificationEventType.SESSION_REMINDER_DUE,
                NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
            )
    }
}
