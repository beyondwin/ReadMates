package com.readmates.notification.adapter.out.mail

import com.readmates.notification.application.port.out.MailDeliveryCommand
import jakarta.mail.Message
import jakarta.mail.Session
import jakarta.mail.internet.MimeMessage
import jakarta.mail.internet.MimeMultipart
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.mail.SimpleMailMessage
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.mail.javamail.MimeMessagePreparator
import java.io.InputStream
import java.util.Properties

class SmtpMailDeliveryAdapterTest {
    @Test
    fun `sends multipart alternative email when html is present`() {
        val sender = CapturingJavaMailSender()
        val adapter = SmtpMailDeliveryAdapter(sender, "no-reply@example.com", "ReadMates")

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
        val adapter = SmtpMailDeliveryAdapter(sender, "no-reply@example.com", "ReadMates")

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
}

private class CapturingJavaMailSender : JavaMailSender {
    private val messages = mutableListOf<MimeMessage>()

    fun singleMessage(): MimeMessage = messages.single()

    override fun createMimeMessage(): MimeMessage =
        MimeMessage(Session.getInstance(Properties()))

    override fun createMimeMessage(contentStream: InputStream): MimeMessage =
        MimeMessage(Session.getInstance(Properties()), contentStream)

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

private fun MimeMessage.allTextParts(): List<String> =
    collectTextParts(content)

private fun collectTextParts(content: Any?): List<String> =
    when (content) {
        is String -> listOf(content)
        is MimeMultipart -> (0 until content.count).flatMap { index ->
            collectTextParts(content.getBodyPart(index).content)
        }
        else -> emptyList()
    }

private fun MimeMessage.allMultipartTypes(): List<String> =
    collectMultipartTypes(content)

private fun collectMultipartTypes(content: Any?): List<String> =
    when (content) {
        is MimeMultipart -> listOf(content.contentType.lowercase()) +
            (0 until content.count).flatMap { index -> collectMultipartTypes(content.getBodyPart(index).content) }
        else -> emptyList()
    }
