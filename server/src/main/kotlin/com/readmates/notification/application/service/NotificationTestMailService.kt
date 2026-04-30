package com.readmates.notification.application.service

import com.readmates.notification.application.model.NotificationTestMailAuditItem
import com.readmates.notification.application.model.SendNotificationTestMailCommand
import com.readmates.notification.application.model.sanitizeNotificationError
import com.readmates.notification.application.port.`in`.SendNotificationTestMailUseCase
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryPort
import com.readmates.notification.application.port.out.NotificationTestMailAuditPort
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import java.security.MessageDigest
import java.time.OffsetDateTime
import java.time.ZoneOffset

private const val TEST_MAIL_COOLDOWN_SECONDS = 60L
private const val TEST_MAIL_MAX_EMAIL_LENGTH = 320
private const val TEST_MAIL_MAX_ERROR_LENGTH = 500
private const val TEST_MAIL_SUBJECT = "ReadMates 알림 테스트"
private const val TEST_MAIL_BODY = "ReadMates 알림 발송 설정을 확인하기 위한 테스트 메일입니다."
private val TEST_MAIL_EMAIL_PATTERN = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")

@Service
class NotificationTestMailService(
    private val notificationTestMailAuditPort: NotificationTestMailAuditPort,
    private val mailDeliveryPort: MailDeliveryPort,
) : SendNotificationTestMailUseCase {
    override fun sendTestMail(
        host: CurrentMember,
        command: SendNotificationTestMailCommand,
    ): NotificationTestMailAuditItem {
        val currentHost = requireHost(host)
        val recipient = command.recipientEmail.trim().lowercase()
        if (recipient.length > TEST_MAIL_MAX_EMAIL_LENGTH || !TEST_MAIL_EMAIL_PATTERN.matches(recipient)) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid email address")
        }

        val audit = notificationTestMailAuditPort.reserveTestMailAuditAttempt(
            clubId = currentHost.clubId,
            hostMembershipId = currentHost.membershipId,
            recipientMaskedEmail = recipient.maskEmail(),
            recipientEmailHash = sha256Hex(recipient),
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
            notificationTestMailAuditPort.markTestMailAuditFailed(audit.id, exception.toTestMailStorageError())
        }
    }

    override fun listTestMailAudit(host: CurrentMember, pageRequest: PageRequest) =
        notificationTestMailAuditPort.listTestMailAudit(requireHost(host).clubId, pageRequest)

    private fun requireHost(host: CurrentMember): CurrentMember {
        if (!host.isHost) {
            throw AccessDeniedException("Host role required")
        }
        return host
    }

    private fun Exception.toTestMailStorageError(): String =
        sanitizeNotificationError(message ?: javaClass.simpleName, TEST_MAIL_MAX_ERROR_LENGTH)
            ?: javaClass.simpleName.take(TEST_MAIL_MAX_ERROR_LENGTH)

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
