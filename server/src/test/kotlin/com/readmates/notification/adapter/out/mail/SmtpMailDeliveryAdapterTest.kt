package com.readmates.notification.adapter.out.mail

import com.readmates.notification.application.config.NotificationRuntimeProperties
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryFailure
import com.readmates.notification.application.port.out.MailDeliveryFailureKind
import jakarta.mail.Address
import jakarta.mail.Message
import jakarta.mail.SendFailedException
import jakarta.mail.Session
import jakarta.mail.internet.MimeMessage
import jakarta.mail.internet.MimeMultipart
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.mail.MailAuthenticationException
import org.springframework.mail.MailParseException
import org.springframework.mail.MailPreparationException
import org.springframework.mail.MailSendException
import org.springframework.mail.SimpleMailMessage
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.mail.javamail.MimeMessagePreparator
import java.io.InputStream
import java.net.SocketException
import java.net.SocketTimeoutException
import java.util.Properties

class SmtpMailDeliveryAdapterTest {
    @Test
    fun `sends multipart alternative email when html is present`() {
        val sender = CapturingJavaMailSender()
        val adapter = SmtpMailDeliveryAdapter(sender, notificationProperties())

        adapter.send(
            MailDeliveryCommand(
                to = "member@example.com",
                subject = "8회차 책이 공개되었습니다",
                text = "plain body",
                html = "<html><body><strong>html body</strong></body></html>",
            ),
        )

        val message = sender.singleMessage()
        assertThat(message.subject).isEqualTo("8회차 책이 공개되었습니다")
        assertThat(message.getRecipients(Message.RecipientType.TO).single().toString()).isEqualTo("member@example.com")
        assertThat(message.from.single().toString()).contains("ReadMates", "no-reply@example.com")
        assertThat(message.allMultipartTypes()).anySatisfy { contentType ->
            assertThat(contentType).contains("multipart/alternative")
        }
        assertThat(message.allTextParts()).contains("plain body")
        assertThat(message.allTextParts()).anySatisfy { part ->
            assertThat(part).contains("<strong>html body</strong>")
        }
    }

    @Test
    fun `sends plain text email when html is absent`() {
        val sender = CapturingJavaMailSender()
        val adapter = SmtpMailDeliveryAdapter(sender, notificationProperties())

        adapter.send(
            MailDeliveryCommand(
                to = "member@example.com",
                subject = "ReadMates 알림 테스트",
                text = "plain only",
            ),
        )

        val message = sender.singleMessage()
        assertThat(message.contentType.lowercase()).startsWith("text/plain")
        assertThat(message.content.toString()).contains("plain only")
    }

    @Test
    fun `classifies preparation and authentication failures as permanent without retaining raw causes`() {
        listOf(
            MailPreparationException("raw preparation recipient@example.test"),
            MailParseException("raw invalid recipient@example.test"),
            MailAuthenticationException("raw authentication password=synthetic-secret"),
            MailSendException(
                "raw wrapped parse recipient@example.test",
                MailParseException("raw invalid recipient@example.test"),
            ),
        ).forEach { failure ->
            assertSafeFailure(
                thrown = failure,
                expectedKind = MailDeliveryFailureKind.PERMANENT,
            )
        }
    }

    @Test
    fun `classifies explicit SMTP rejection by response family when no recipient was accepted`() {
        assertSafeFailure(
            thrown = smtpFailure(returnCode = 550),
            expectedKind = MailDeliveryFailureKind.PERMANENT,
        )
        assertSafeFailure(
            thrown = smtpFailure(returnCode = 450),
            expectedKind = MailDeliveryFailureKind.RETRYABLE,
        )
    }

    @Test
    fun `classifies accepted recipient and transport timeout as ambiguous`() {
        assertSafeFailure(
            thrown = smtpFailure(returnCode = 550, acceptedRecipients = arrayOf(InternetAddressStub)),
            expectedKind = MailDeliveryFailureKind.AMBIGUOUS,
        )
        assertSafeFailure(
            thrown =
                MailSendException(
                    "raw connection loss recipient@example.test",
                    SocketException("raw connection reset recipient@example.test"),
                ),
            expectedKind = MailDeliveryFailureKind.AMBIGUOUS,
        )
    }

    @Test
    fun `classifies explicit invalid recipient as permanent`() {
        assertSafeFailure(
            thrown =
                MailSendException(
                    "raw invalid recipient@example.test",
                    SendFailedException(
                        "raw invalid recipient@example.test",
                        null,
                        null,
                        null,
                        arrayOf(InternetAddressStub),
                    ),
                ),
            expectedKind = MailDeliveryFailureKind.PERMANENT,
        )
        assertSafeFailure(
            thrown =
                MailSendException(
                    "raw timeout recipient@example.test",
                    SocketTimeoutException("raw socket timeout recipient@example.test"),
                ),
            expectedKind = MailDeliveryFailureKind.AMBIGUOUS,
        )
    }

    @Test
    fun `classifies unknown mail send state as ambiguous but preserves fail fast programming errors`() {
        assertSafeFailure(
            thrown = MailSendException("raw unknown provider response recipient@example.test"),
            expectedKind = MailDeliveryFailureKind.AMBIGUOUS,
        )

        val adapter =
            SmtpMailDeliveryAdapter(
                ThrowingJavaMailSender(IllegalStateException("programming defect")),
                notificationProperties(),
            )
        assertThatThrownBy { adapter.send(mailCommand()) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessage("programming defect")
    }

    private fun assertSafeFailure(
        thrown: RuntimeException,
        expectedKind: MailDeliveryFailureKind,
    ) {
        val adapter = SmtpMailDeliveryAdapter(ThrowingJavaMailSender(thrown), notificationProperties())

        assertThatThrownBy { adapter.send(mailCommand()) }
            .isInstanceOfSatisfying(MailDeliveryFailure::class.java) { failure ->
                assertThat(failure.kind).isEqualTo(expectedKind)
                assertThat(failure.message).isEqualTo(expectedKind.storageCode)
                assertThat(failure.cause).isNull()
                assertThat(failure.message)
                    .doesNotContain("recipient@example.test")
                    .doesNotContain("synthetic-secret")
                    .doesNotContain("raw")
            }
    }

    private fun smtpFailure(
        returnCode: Int,
        acceptedRecipients: Array<Address>? = null,
    ): MailSendException =
        MailSendException(
            "raw outer provider response recipient@example.test",
            SmtpResponseException(returnCode, acceptedRecipients),
        )

    private fun mailCommand(): MailDeliveryCommand =
        MailDeliveryCommand(
            to = "member@example.com",
            subject = "ReadMates notification",
            text = "plain body",
        )
}

private object InternetAddressStub : Address() {
    override fun getType(): String = "rfc822"

    override fun toString(): String = "accepted@example.test"

    override fun equals(other: Any?): Boolean = other === this

    override fun hashCode(): Int = 1
}

private class SmtpResponseException(
    private val responseCode: Int,
    acceptedRecipients: Array<Address>?,
) : SendFailedException(
        "raw SMTP response recipient@example.test",
        null,
        acceptedRecipients,
        null,
        null,
    ) {
    fun getReturnCode(): Int = responseCode
}

private fun notificationProperties(): NotificationRuntimeProperties =
    NotificationRuntimeProperties(
        enabled = true,
        senderEmail = "no-reply@example.com",
        senderName = "ReadMates",
    )

private open class CapturingJavaMailSender : JavaMailSender {
    private val messages = mutableListOf<MimeMessage>()

    fun singleMessage(): MimeMessage = messages.single()

    override fun createMimeMessage(): MimeMessage = MimeMessage(Session.getInstance(Properties()))

    override fun createMimeMessage(contentStream: InputStream): MimeMessage = MimeMessage(Session.getInstance(Properties()), contentStream)

    override fun send(mimeMessage: MimeMessage) {
        messages += mimeMessage
    }

    override fun send(vararg mimeMessages: MimeMessage) {
        messages.addAll(mimeMessages)
    }

    override fun send(mimeMessagePreparator: MimeMessagePreparator) {
        val message = createMimeMessage()
        mimeMessagePreparator.prepare(message)
        send(message)
    }

    override fun send(vararg mimeMessagePreparators: MimeMessagePreparator) {
        mimeMessagePreparators.forEach(::send)
    }

    override fun send(simpleMessage: SimpleMailMessage) {
        error("SimpleMailMessage should not be used for SMTP notification delivery")
    }

    override fun send(vararg simpleMessages: SimpleMailMessage) {
        error("SimpleMailMessage should not be used for SMTP notification delivery")
    }
}

private class ThrowingJavaMailSender(
    private val failure: RuntimeException,
) : CapturingJavaMailSender() {
    override fun send(mimeMessage: MimeMessage): Unit = throw failure
}

private fun MimeMessage.allTextParts(): List<String> = collectTextParts(content)

private fun collectTextParts(content: Any?): List<String> =
    when (content) {
        is String -> listOf(content)
        is MimeMultipart ->
            (0 until content.count).flatMap { index ->
                collectTextParts(content.getBodyPart(index).content)
            }
        else -> emptyList()
    }

private fun MimeMessage.allMultipartTypes(): List<String> = collectMultipartTypes(content)

private fun collectMultipartTypes(content: Any?): List<String> =
    when (content) {
        is MimeMultipart ->
            listOf(content.contentType.lowercase()) +
                (0 until content.count).flatMap { index -> collectMultipartTypes(content.getBodyPart(index).content) }
        else -> emptyList()
    }
