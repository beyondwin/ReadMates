package com.readmates.notification.adapter.out.mail

import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryPort
import jakarta.mail.internet.InternetAddress
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.mail.javamail.MimeMessageHelper
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(prefix = "readmates.notifications", name = ["enabled"], havingValue = "true")
class SmtpMailDeliveryAdapter(
    private val javaMailSender: JavaMailSender,
    @param:Value("\${readmates.notifications.sender-email}") private val senderEmail: String,
    @param:Value("\${readmates.notifications.sender-name}") private val senderName: String,
) : MailDeliveryPort {
    override fun send(command: MailDeliveryCommand) {
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
}
