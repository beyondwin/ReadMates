package com.readmates.notification.adapter.out.mail

import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryPort
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.mail.SimpleMailMessage
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(prefix = "readmates.notifications", name = ["enabled"], havingValue = "true")
class SmtpMailDeliveryAdapter(
    private val javaMailSender: JavaMailSender,
    @param:Value("\${readmates.notifications.sender-email}") private val senderEmail: String,
    @param:Value("\${readmates.notifications.sender-name}") private val senderName: String,
) : MailDeliveryPort {
    override fun send(command: MailDeliveryCommand) {
        val message = SimpleMailMessage()
        message.from = "$senderName <$senderEmail>"
        message.setTo(command.to)
        message.subject = command.subject
        message.text = command.text
        javaMailSender.send(message)
    }
}
