package com.readmates.notification.adapter.out.mail

import com.readmates.notification.application.config.NotificationRuntimeProperties
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryFailure
import com.readmates.notification.application.port.out.MailDeliveryFailureKind
import jakarta.mail.Address
import jakarta.mail.AuthenticationFailedException
import jakarta.mail.Message
import jakarta.mail.MessagingException
import jakarta.mail.SendFailedException
import jakarta.mail.Session
import jakarta.mail.internet.InternetAddress
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
    fun `classifies bare messaging failure during preparation as permanent before send`() {
        val sender =
            PreparationThrowingJavaMailSender(
                MessagingException("raw preparation recipient@example.test"),
            )
        val adapter = SmtpMailDeliveryAdapter(sender, notificationProperties())

        assertSafeFailure(
            adapter = adapter,
            expectedKind = MailDeliveryFailureKind.PERMANENT,
        )
        assertThat(sender.sendCalls).isZero()
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
    fun `classifies typed SMTP address rejection by structured response family`() {
        assertSafeFailure(
            thrown = typedSmtpAddressFailure(returnCode = 550),
            expectedKind = MailDeliveryFailureKind.PERMANENT,
        )
        assertSafeFailure(
            thrown = typedSmtpAddressFailure(returnCode = 450),
            expectedKind = MailDeliveryFailureKind.RETRYABLE,
        )
    }

    @Test
    fun `ignores incidental SMTP-like number in an unstructured diagnostic`() {
        assertSafeFailure(
            thrown = MessagingException("local diagnostic: processed 550 records before unknown failure"),
            expectedKind = MailDeliveryFailureKind.AMBIGUOUS,
        )
        val sideEffectFailure = SideEffectSmtpResponseException()
        assertSafeFailure(
            thrown = MailSendException("raw outer provider response recipient@example.test", sideEffectFailure),
            expectedKind = MailDeliveryFailureKind.AMBIGUOUS,
        )
        assertThat(sideEffectFailure.returnCodeCalls).isZero()
    }

    @Test
    fun `classifies accepted recipient and transport timeout as ambiguous`() {
        assertSafeFailure(
            thrown = smtpFailure(returnCode = 550, acceptedRecipients = arrayOf(InternetAddressStub)),
            expectedKind = MailDeliveryFailureKind.AMBIGUOUS,
        )
        assertSafeFailure(
            thrown =
                smtpFailure(
                    returnCode = 550,
                    nestedFailure = SocketException("raw connection reset recipient@example.test"),
                ),
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
    fun `accepted recipient dominates nested permanent send signals`() {
        listOf(
            AuthenticationFailedException("raw authentication password=synthetic-secret"),
            MailPreparationException("raw preparation recipient@example.test"),
            typedSmtpAddressException(returnCode = 550),
        ).forEach { nestedFailure ->
            assertSafeFailure(
                thrown = acceptedFailureWithNested(nestedFailure),
                expectedKind = MailDeliveryFailureKind.AMBIGUOUS,
            )
        }
    }

    @Test
    fun `classifies bare and wrapped messaging transport failures as ambiguous`() {
        val nextExceptionFailure = MessagingException("raw transport state recipient@example.test")
        nextExceptionFailure.setNextException(SocketException("raw connection loss recipient@example.test"))

        listOf(
            MessagingException(
                "raw timeout recipient@example.test",
                SocketTimeoutException("raw timeout recipient@example.test"),
            ),
            nextExceptionFailure,
            MailSendException(
                "raw wrapped transport recipient@example.test",
                MessagingException(
                    "raw connection recipient@example.test",
                    SocketException("raw connection loss recipient@example.test"),
                ),
            ),
        ).forEach { failure ->
            assertSafeFailure(
                thrown = failure,
                expectedKind = MailDeliveryFailureKind.AMBIGUOUS,
            )
        }
    }

    @Test
    fun `classifies unknown send stage messaging state as ambiguous with a cycle safe chain`() {
        val first = MessagingException("raw unknown provider response recipient@example.test")
        val second = MessagingException("raw nested provider response recipient@example.test")
        first.setNextException(second)
        second.setNextException(first)

        assertSafeFailure(
            thrown = first,
            expectedKind = MailDeliveryFailureKind.AMBIGUOUS,
        )
    }

    @Test
    fun `classifies a truncated send failure chain as ambiguous when acceptance cannot be disproved`() {
        val root = AuthenticationFailedException("raw authentication password=synthetic-secret")
        var tail: MessagingException = root
        repeat(64) { index ->
            val next = MessagingException("raw nested provider response $index recipient@example.test")
            tail.setNextException(next)
            tail = next
        }
        tail.setNextException(
            SendFailedException(
                "raw accepted recipient@example.test",
                null,
                arrayOf(InternetAddressStub),
                null,
                null,
            ),
        )

        assertSafeFailure(
            thrown = root,
            expectedKind = MailDeliveryFailureKind.AMBIGUOUS,
        )

        val typedStatusRoot = typedSmtpAddressException(returnCode = 550) as MessagingException
        tail = typedStatusRoot
        repeat(64) { index ->
            val next = MessagingException("raw typed status chain $index recipient@example.test")
            tail.setNextException(next)
            tail = next
        }
        assertSafeFailure(
            thrown = typedStatusRoot,
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
        thrown: Throwable,
        expectedKind: MailDeliveryFailureKind,
    ) {
        val adapter = SmtpMailDeliveryAdapter(ThrowingJavaMailSender(thrown), notificationProperties())

        assertSafeFailure(adapter, expectedKind)
    }

    private fun assertSafeFailure(
        adapter: SmtpMailDeliveryAdapter,
        expectedKind: MailDeliveryFailureKind,
    ) {
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
        nestedFailure: Exception? = null,
    ): MailSendException =
        MailSendException(
            "raw outer provider response recipient@example.test",
            typedSmtpSendException(returnCode, acceptedRecipients, nestedFailure),
        )

    private fun typedSmtpAddressFailure(returnCode: Int): MailSendException =
        MailSendException(
            "raw outer provider response recipient@example.test",
            typedSmtpAddressException(returnCode),
        )

    private fun typedSmtpSendException(
        returnCode: Int,
        acceptedRecipients: Array<Address>? = null,
        nestedFailure: Exception? = null,
    ): Exception {
        val type = Class.forName("org.eclipse.angus.mail.smtp.SMTPSendFailedException")
        val constructor =
            type.getConstructor(
                String::class.java,
                Int::class.javaPrimitiveType,
                String::class.java,
                Exception::class.java,
                Array<Address>::class.java,
                Array<Address>::class.java,
                Array<Address>::class.java,
            )
        return constructor.newInstance(
            "DATA",
            returnCode,
            "raw structured provider response recipient@example.test",
            nestedFailure,
            acceptedRecipients,
            null,
            null,
        ) as Exception
    }

    private fun typedSmtpAddressException(returnCode: Int): Exception {
        val type = Class.forName("org.eclipse.angus.mail.smtp.SMTPAddressFailedException")
        val constructor =
            type.getConstructor(
                InternetAddress::class.java,
                String::class.java,
                Int::class.javaPrimitiveType,
                String::class.java,
            )
        return constructor.newInstance(
            InternetAddress("recipient@example.test"),
            "RCPT TO",
            returnCode,
            "raw structured provider response recipient@example.test",
        ) as Exception
    }

    private fun acceptedFailureWithNested(nestedFailure: Exception): MailSendException {
        val acceptedFailure =
            SendFailedException(
                "raw accepted recipient@example.test",
                null,
                arrayOf(InternetAddressStub),
                null,
                null,
            )
        acceptedFailure.setNextException(nestedFailure)
        return MailSendException("raw outer provider response recipient@example.test", acceptedFailure)
    }

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

private class SideEffectSmtpResponseException :
    SendFailedException(
        "550 raw SMTP response recipient@example.test",
    ) {
    var returnCodeCalls: Int = 0
        private set

    fun getReturnCode(): Int {
        returnCodeCalls += 1
        return 550
    }
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
    private val failure: Throwable,
) : CapturingJavaMailSender() {
    override fun send(mimeMessage: MimeMessage): Unit = throw failure
}

private class PreparationThrowingJavaMailSender(
    private val failure: Throwable,
) : CapturingJavaMailSender() {
    var sendCalls: Int = 0
        private set

    override fun createMimeMessage(): MimeMessage = throw failure

    override fun send(mimeMessage: MimeMessage) {
        sendCalls += 1
    }
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
