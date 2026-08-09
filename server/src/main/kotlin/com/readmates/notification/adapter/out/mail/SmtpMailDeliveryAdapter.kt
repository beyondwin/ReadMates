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
import org.eclipse.angus.mail.smtp.SMTPAddressFailedException
import org.eclipse.angus.mail.smtp.SMTPSendFailedException
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

private data class BoundedFailureChain(
    val failures: List<Throwable>,
    val truncated: Boolean,
)

@Component
@ConditionalOnProperty(prefix = "readmates.notifications", name = ["enabled"], havingValue = "true")
class SmtpMailDeliveryAdapter(
    private val javaMailSender: JavaMailSender,
    properties: NotificationRuntimeProperties,
) : MailDeliveryPort {
    private val senderEmail = properties.senderEmail
    private val senderName = properties.senderName

    override fun send(command: MailDeliveryCommand) {
        val message = prepareMessage(command)
        val result =
            runCatching {
                javaMailSender.send(message)
            }
        result.exceptionOrNull()?.let { failure ->
            throw failure.toSendStageMailDeliveryFailure() ?: failure
        }
    }

    private fun prepareMessage(command: MailDeliveryCommand) =
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
            message
        }.getOrElse { failure ->
            throw failure.toPreparationMailDeliveryFailure() ?: failure
        }

    private fun Throwable.toPreparationMailDeliveryFailure(): MailDeliveryFailure? =
        when (this) {
            is MailAuthenticationException,
            is MailPreparationException,
            is MailParseException,
            is MessagingException,
            -> MailDeliveryFailure(MailDeliveryFailureKind.PERMANENT)

            else -> null
        }

    private fun Throwable.toSendStageMailDeliveryFailure(): MailDeliveryFailure? =
        takeIf { failure -> failure.isBoundedMailFailure() }
            ?.let { failure -> MailDeliveryFailure(failure.sendStageFailureKind()) }

    private fun Throwable.isBoundedMailFailure(): Boolean =
        this is MailSendException ||
            this is MailAuthenticationException ||
            this is MailPreparationException ||
            this is MailParseException ||
            this is MessagingException ||
            this is SocketException

    private fun Throwable.sendStageFailureKind(): MailDeliveryFailureKind {
        val chain = failureChain()
        val failures = chain.failures
        val responseCodes = failures.mapNotNull { it.smtpResponseCode() }
        return when {
            failures.filterIsInstance<SendFailedException>().any { it.hasAcceptedRecipient() } ->
                MailDeliveryFailureKind.AMBIGUOUS
            failures.any { it is SocketTimeoutException || it is SocketException } ->
                MailDeliveryFailureKind.AMBIGUOUS
            chain.truncated ->
                MailDeliveryFailureKind.AMBIGUOUS
            responseCodes.any { it in TRANSIENT_SMTP_RESPONSE_RANGE } ->
                MailDeliveryFailureKind.RETRYABLE
            responseCodes.isNotEmpty() && responseCodes.all { it in PERMANENT_SMTP_RESPONSE_RANGE } ->
                MailDeliveryFailureKind.PERMANENT
            failures.filterIsInstance<SendFailedException>().any { it.hasInvalidRecipientOnly() } ->
                MailDeliveryFailureKind.PERMANENT
            failures.any {
                it is AuthenticationFailedException ||
                    it is MailAuthenticationException ||
                    it is MailPreparationException ||
                    it is MailParseException
            } ->
                MailDeliveryFailureKind.PERMANENT
            else -> MailDeliveryFailureKind.AMBIGUOUS
        }
    }

    private fun Throwable.failureChain(): BoundedFailureChain {
        val seen = Collections.newSetFromMap(IdentityHashMap<Throwable, Boolean>())
        val queued = Collections.newSetFromMap(IdentityHashMap<Throwable, Boolean>())
        val pending = ArrayDeque<Throwable>()
        val failures = mutableListOf<Throwable>()
        var truncated = false

        fun enqueue(failure: Throwable?) {
            if (failure != null && failure !in seen && failure !in queued) {
                if (seen.size + pending.size < MAX_FAILURE_CHAIN_NODES) {
                    pending += failure
                    queued += failure
                } else {
                    truncated = true
                }
            }
        }

        enqueue(this)
        while (pending.isNotEmpty()) {
            val current = pending.removeFirst()
            queued -= current
            if (!seen.add(current)) {
                continue
            }
            failures += current
            enqueue(current.cause)
            if (current is MessagingException) {
                enqueue(current.nextException)
            }
            if (current is MailSendException) {
                val messageExceptions = current.messageExceptions
                val failedMessages = current.failedMessages.values
                if (messageExceptions.size > MAX_FAILURE_CHAIN_NODES || failedMessages.size > MAX_FAILURE_CHAIN_NODES) {
                    truncated = true
                }
                messageExceptions
                    .asSequence()
                    .take(MAX_FAILURE_CHAIN_NODES)
                    .forEach(::enqueue)
                failedMessages
                    .asSequence()
                    .take(MAX_FAILURE_CHAIN_NODES)
                    .forEach(::enqueue)
            }
        }
        return BoundedFailureChain(failures, truncated)
    }

    private fun SendFailedException.hasAcceptedRecipient(): Boolean = !validSentAddresses.isNullOrEmpty()

    private fun SendFailedException.hasInvalidRecipientOnly(): Boolean =
        !invalidAddresses.isNullOrEmpty() && validSentAddresses.isNullOrEmpty()

    private fun Throwable.smtpResponseCode(): Int? =
        when (this) {
            is SMTPAddressFailedException -> returnCode
            is SMTPSendFailedException -> returnCode
            else -> null
        }

    private companion object {
        private const val MAX_FAILURE_CHAIN_NODES = 64
        private val TRANSIENT_SMTP_RESPONSE_RANGE = 400..499
        private val PERMANENT_SMTP_RESPONSE_RANGE = 500..599
    }
}
