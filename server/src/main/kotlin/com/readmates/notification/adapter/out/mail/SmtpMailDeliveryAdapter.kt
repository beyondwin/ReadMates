package com.readmates.notification.adapter.out.mail

import com.readmates.notification.application.config.NotificationRuntimeProperties
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryFailure
import com.readmates.notification.application.port.out.MailDeliveryFailureKind
import com.readmates.notification.application.port.out.MailDeliveryPort
import jakarta.mail.AuthenticationFailedException
import jakarta.mail.MessagingException
import jakarta.mail.SendFailedException
import jakarta.mail.internet.InternetAddress
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.mail.MailAuthenticationException
import org.springframework.mail.MailParseException
import org.springframework.mail.MailPreparationException
import org.springframework.mail.MailSendException
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.mail.javamail.MimeMessageHelper
import org.springframework.stereotype.Component
import java.net.SocketException
import java.net.SocketTimeoutException
import java.util.Collections
import java.util.IdentityHashMap

@Component
@ConditionalOnProperty(prefix = "readmates.notifications", name = ["enabled"], havingValue = "true")
class SmtpMailDeliveryAdapter(
    private val javaMailSender: JavaMailSender,
    properties: NotificationRuntimeProperties,
) : MailDeliveryPort {
    private val senderEmail = properties.senderEmail
    private val senderName = properties.senderName

    override fun send(command: MailDeliveryCommand) {
        val result =
            runCatching {
                val message = javaMailSender.createMimeMessage()
                val helper = MimeMessageHelper(message, command.html?.isNotBlank() == true, Charsets.UTF_8.name())
                helper.setFrom(InternetAddress(senderEmail, senderName, Charsets.UTF_8.name()))
                helper.setTo(command.to)
                helper.setSubject(command.subject)
                val html = command.html?.takeIf { it.isNotBlank() }
                if (html == null) {
                    helper.setText(command.text, false)
                } else {
                    helper.setText(command.text, html)
                }
                javaMailSender.send(message)
            }
        result.exceptionOrNull()?.let { failure ->
            throw failure.toMailDeliveryFailure() ?: failure
        }
    }

    private fun Throwable.toMailDeliveryFailure(): MailDeliveryFailure? =
        when (this) {
            is MailAuthenticationException,
            is MailPreparationException,
            is MailParseException,
            is MessagingException,
            -> MailDeliveryFailure(MailDeliveryFailureKind.PERMANENT)

            is MailSendException -> MailDeliveryFailure(failureKind())
            else -> null
        }

    private fun MailSendException.failureKind(): MailDeliveryFailureKind {
        val failures = failureChain()
        val responseCodes = failures.mapNotNull { it.smtpResponseCode() }
        return when {
            failures.any {
                it is AuthenticationFailedException ||
                    it is MailAuthenticationException ||
                    it is MailPreparationException ||
                    it is MailParseException
            } ->
                MailDeliveryFailureKind.PERMANENT
            failures.filterIsInstance<SendFailedException>().any { it.hasAcceptedRecipient() } ->
                MailDeliveryFailureKind.AMBIGUOUS
            failures.any { it is SocketTimeoutException || it is SocketException } ->
                MailDeliveryFailureKind.AMBIGUOUS
            responseCodes.any { it in TRANSIENT_SMTP_RESPONSE_RANGE } ->
                MailDeliveryFailureKind.RETRYABLE
            responseCodes.isNotEmpty() && responseCodes.all { it in PERMANENT_SMTP_RESPONSE_RANGE } ->
                MailDeliveryFailureKind.PERMANENT
            failures.filterIsInstance<SendFailedException>().any { it.hasInvalidRecipientOnly() } ->
                MailDeliveryFailureKind.PERMANENT
            else -> MailDeliveryFailureKind.AMBIGUOUS
        }
    }

    private fun MailSendException.failureChain(): List<Throwable> {
        val seen = Collections.newSetFromMap(IdentityHashMap<Throwable, Boolean>())
        val pending = ArrayDeque<Throwable>()
        pending += this
        messageExceptions.forEach(pending::addLast)
        failedMessages.values.forEach(pending::addLast)
        val failures = mutableListOf<Throwable>()
        while (pending.isNotEmpty()) {
            val current = pending.removeFirst()
            if (!seen.add(current)) {
                continue
            }
            failures += current
            current.cause?.let(pending::addLast)
            if (current is MessagingException) {
                current.nextException?.let(pending::addLast)
            }
        }
        return failures
    }

    private fun SendFailedException.hasAcceptedRecipient(): Boolean = !validSentAddresses.isNullOrEmpty()

    private fun SendFailedException.hasInvalidRecipientOnly(): Boolean =
        !invalidAddresses.isNullOrEmpty() && validSentAddresses.isNullOrEmpty()

    private fun Throwable.smtpResponseCode(): Int? =
        runCatching {
            javaClass
                .methods
                .firstOrNull { method -> method.name == "getReturnCode" && method.parameterCount == 0 }
                ?.invoke(this) as? Int
        }.getOrNull()

    private companion object {
        private val TRANSIENT_SMTP_RESPONSE_RANGE = 400..499
        private val PERMANENT_SMTP_RESPONSE_RANGE = 500..599
    }
}
