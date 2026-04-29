package com.readmates.notification.application.service

import com.readmates.notification.application.model.HostNotificationDetail
import com.readmates.notification.application.model.HostNotificationItemList
import com.readmates.notification.application.model.HostNotificationItemQuery
import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.model.NotificationOutboxItem
import com.readmates.notification.application.model.NotificationPreferences
import com.readmates.notification.application.model.NotificationTestMailAuditItem
import com.readmates.notification.application.model.SendNotificationTestMailCommand
import com.readmates.notification.application.model.sanitizeNotificationError
import com.readmates.notification.application.port.`in`.GetHostNotificationSummaryUseCase
import com.readmates.notification.application.port.`in`.ManageHostNotificationsUseCase
import com.readmates.notification.application.port.`in`.ManageNotificationPreferencesUseCase
import com.readmates.notification.application.port.`in`.ProcessNotificationOutboxUseCase
import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
import com.readmates.notification.application.port.`in`.SendNotificationTestMailUseCase
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryPort
import com.readmates.notification.application.port.out.NotificationOutboxPort
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import java.security.MessageDigest
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

private const val MAX_LAST_ERROR_LENGTH = 500
private const val MAX_EMAIL_LENGTH = 320
private const val TEST_MAIL_COOLDOWN_SECONDS = 60L
private const val TEST_MAIL_SUBJECT = "ReadMates 알림 테스트"
private const val TEST_MAIL_BODY = "ReadMates 알림 발송 설정을 확인하기 위한 테스트 메일입니다."
private val RETRY_DELAYS_MINUTES = listOf(5L, 15L, 60L, 240L)
private val EMAIL_PATTERN = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")

@Service
class NotificationOutboxService(
    private val notificationOutboxPort: NotificationOutboxPort,
    private val mailDeliveryPort: MailDeliveryPort,
    private val metrics: ReadmatesOperationalMetrics,
    @param:Value("\${readmates.notifications.worker.max-attempts:5}") private val maxAttempts: Int,
    @param:Value("\${readmates.notifications.enabled:false}") private val deliveryEnabled: Boolean = true,
) : RecordNotificationEventUseCase,
    ProcessNotificationOutboxUseCase,
    GetHostNotificationSummaryUseCase,
    ManageHostNotificationsUseCase,
    ManageNotificationPreferencesUseCase,
    SendNotificationTestMailUseCase {

    override fun recordFeedbackDocumentPublished(clubId: UUID, sessionId: UUID) {
        notificationOutboxPort.enqueueFeedbackDocumentPublished(clubId, sessionId)
    }

    override fun recordNextBookPublished(clubId: UUID, sessionId: UUID) {
        notificationOutboxPort.enqueueNextBookPublished(clubId, sessionId)
    }

    override fun recordReviewPublished(clubId: UUID, sessionId: UUID, authorMembershipId: UUID) {
        notificationOutboxPort.enqueueReviewPublished(clubId, sessionId, authorMembershipId)
    }

    override fun recordSessionReminderDue(targetDate: LocalDate) {
        notificationOutboxPort.enqueueSessionReminderDue(targetDate)
    }

    override fun processPending(limit: Int): Int {
        if (limit <= 0 || !deliveryEnabled) {
            return 0
        }

        val items = notificationOutboxPort.claimPending(limit)
        return deliverAll(items)
    }

    override fun processPendingForClub(clubId: UUID, limit: Int): Int {
        if (limit <= 0 || !deliveryEnabled) {
            return 0
        }

        val items = notificationOutboxPort.claimPendingForClub(clubId, limit)
        return deliverAll(items)
    }

    override fun getHostNotificationSummary(host: CurrentMember): HostNotificationSummary {
        val currentHost = requireHost(host)
        return notificationOutboxPort.hostSummary(currentHost.clubId)
    }

    override fun listItems(host: CurrentMember, query: HostNotificationItemQuery): HostNotificationItemList {
        val currentHost = requireHost(host)
        val clampedQuery = query.copy(limit = query.limit.coerceIn(1, 100))
        return notificationOutboxPort.listHostItems(currentHost.clubId, clampedQuery)
    }

    override fun detail(host: CurrentMember, id: UUID): HostNotificationDetail {
        val currentHost = requireHost(host)
        return notificationOutboxPort.hostItemDetail(currentHost.clubId, id)
            ?: throw notificationAccessDenied()
    }

    override fun retry(host: CurrentMember, id: UUID): HostNotificationDetail {
        val currentHost = requireHost(host)
        if (!deliveryEnabled) {
            return notificationOutboxPort.retryableHostItemDetail(currentHost.clubId, id)
                ?: throw notificationAccessDenied()
        }

        val item = notificationOutboxPort.claimOneForClub(currentHost.clubId, id)
            ?: throw notificationAccessDenied()
        deliver(item)
        return notificationOutboxPort.hostItemDetail(currentHost.clubId, id)
            ?: throw notificationAccessDenied()
    }

    override fun restore(host: CurrentMember, id: UUID): HostNotificationDetail {
        val currentHost = requireHost(host)
        if (!notificationOutboxPort.restoreDeadForClub(currentHost.clubId, id)) {
            throw notificationAccessDenied()
        }
        return notificationOutboxPort.hostItemDetail(currentHost.clubId, id)
            ?: throw notificationAccessDenied()
    }

    override fun sendTestMail(
        host: CurrentMember,
        command: SendNotificationTestMailCommand,
    ): NotificationTestMailAuditItem {
        val currentHost = requireHost(host)
        val recipient = command.recipientEmail.trim().lowercase()
        if (recipient.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.matches(recipient)) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid email address")
        }

        val maskedRecipient = recipient.maskEmail()
        val recipientHash = sha256Hex(recipient)
        val audit = notificationOutboxPort.reserveTestMailAuditAttempt(
            clubId = currentHost.clubId,
            hostMembershipId = currentHost.membershipId,
            recipientMaskedEmail = maskedRecipient,
            recipientEmailHash = recipientHash,
            cooldownStartedAfter = OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(TEST_MAIL_COOLDOWN_SECONDS),
        ) ?: throw ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Test mail cooldown is active")

        return try {
            mailDeliveryPort.send(
                MailDeliveryCommand(
                    to = recipient,
                    subject = TEST_MAIL_SUBJECT,
                    text = TEST_MAIL_BODY,
                ),
            )
            audit
        } catch (exception: Exception) {
            notificationOutboxPort.markTestMailAuditFailed(audit.id, exception.toTestMailStorageError())
        }
    }

    override fun listTestMailAudit(host: CurrentMember): List<NotificationTestMailAuditItem> {
        val currentHost = requireHost(host)
        return notificationOutboxPort.listTestMailAudit(currentHost.clubId)
    }

    override fun getPreferences(member: CurrentMember): NotificationPreferences =
        notificationOutboxPort.getPreferences(member)

    override fun savePreferences(
        member: CurrentMember,
        preferences: NotificationPreferences,
    ): NotificationPreferences =
        notificationOutboxPort.savePreferences(member, preferences)

    private fun deliver(item: NotificationOutboxItem) {
        try {
            mailDeliveryPort.send(
                MailDeliveryCommand(
                    to = item.recipientEmail,
                    subject = item.subject,
                    text = item.bodyText,
                ),
            )
            if (notificationOutboxPort.markSent(item.id, item.lockedAt)) {
                metrics.sent(item.eventType)
            }
        } catch (exception: Exception) {
            val error = exception.toStorageError()
            if (item.attemptCount + 1 >= maxAttempts.coerceAtLeast(1)) {
                if (notificationOutboxPort.markDead(item.id, item.lockedAt, error)) {
                    metrics.dead(item.eventType)
                }
            } else {
                if (
                    notificationOutboxPort.markFailed(
                        id = item.id,
                        lockedAt = item.lockedAt,
                        error = error,
                        nextAttemptDelayMinutes = retryDelayMinutes(item.attemptCount),
                    )
                ) {
                    metrics.failed(item.eventType)
                }
            }
        }
    }

    private fun deliverAll(items: List<NotificationOutboxItem>): Int {
        items.forEach(::deliver)
        return items.size
    }

    private fun requireHost(host: CurrentMember): CurrentMember {
        if (!host.isHost) {
            throw AccessDeniedException("Host role required")
        }
        return host
    }

    private fun notificationAccessDenied(): AccessDeniedException =
        AccessDeniedException("Notification not found")

    private fun retryDelayMinutes(attemptCount: Int): Long =
        RETRY_DELAYS_MINUTES[attemptCount.coerceIn(0, RETRY_DELAYS_MINUTES.lastIndex)]

    private fun Exception.toStorageError(): String =
        (message ?: javaClass.simpleName).take(MAX_LAST_ERROR_LENGTH)

    private fun Exception.toTestMailStorageError(): String =
        sanitizeNotificationError(message ?: javaClass.simpleName, MAX_LAST_ERROR_LENGTH)
            ?: javaClass.simpleName.take(MAX_LAST_ERROR_LENGTH)

    private fun String.maskEmail(): String {
        val atIndex = indexOf('@')
        if (atIndex <= 0 || atIndex == lastIndex) {
            return "숨김"
        }

        val local = substring(0, atIndex)
        val domain = substring(atIndex + 1)
        return if (local.isBlank() || domain.isBlank()) {
            "숨김"
        } else {
            "${local.first()}***@$domain"
        }
    }

    private fun sha256Hex(value: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
}
